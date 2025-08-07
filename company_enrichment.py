import os
import requests
import logging
from datetime import datetime, timedelta
from typing import Dict, Optional, Tuple, Any
from cachetools import TTLCache
from urllib.parse import quote_plus

logger = logging.getLogger(__name__)

class CompanyEnrichment:
    """
    Company enrichment using free/freemium APIs:
    - OpenCorporates (free tier)
    - Clearbit (freemium - 100 requests/month)
    - Crunchbase Basic (optional)
    """
    
    def __init__(self):
        # API configurations
        self.opencorporates_base_url = "https://api.opencorporates.com/v0.4"
        self.clearbit_api_key = os.environ.get('CLEARBIT_API_KEY', '')
        self.crunchbase_api_key = os.environ.get('CRUNCHBASE_API_KEY', '')
        
        # Cache for API responses (TTL = 24 hours)
        self.cache = TTLCache(maxsize=1000, ttl=86400)
        
        # Industry mappings
        self.telecom_sic_codes = {
            '4812', '4813', '4899',  # Telecom carriers
            '7372', '7373', '7374',  # Computer services
            '3661', '3663', '3669',  # Communications equipment
        }
        
        self.telecom_keywords = {
            'telecom', 'telecommunications', 'voip', 'cpaas', 'sip',
            'unified communications', 'cloud communications', 'pbx',
            'voice over ip', 'telephony', 'carrier', 'mvno'
        }
    
    def enrich_company(self, domain: str, company_name: Optional[str] = None) -> Dict[str, Any]:
        """
        Enrich company data using multiple APIs with fallback
        
        Returns:
            Dict with keys: incorporation_date, company_status, employee_count,
                          company_industry, is_telecom, score_adjustment
        """
        cache_key = f"company:{domain}"
        if cache_key in self.cache:
            logger.info(f"Returning cached data for {domain}")
            return self.cache[cache_key]
        
        result = {
            'incorporation_date': None,
            'company_status': 'unknown',
            'employee_count': 0,
            'company_industry': 'Unknown',
            'is_telecom': False,
            'score_adjustment': 0,
            'data_source': None
        }
        
        # Try OpenCorporates first (free tier)
        oc_data = self._opencorporates_lookup(domain, company_name)
        if oc_data:
            result.update(oc_data)
            result['data_source'] = 'OpenCorporates'
        
        # Try Clearbit for additional data (freemium)
        if self.clearbit_api_key:
            cb_data = self._clearbit_lookup(domain)
            if cb_data:
                # Merge Clearbit data, preferring non-null values
                for key, value in cb_data.items():
                    if value is not None and (result.get(key) is None or key == 'employee_count'):
                        result[key] = value
                if not result['data_source']:
                    result['data_source'] = 'Clearbit'
                else:
                    result['data_source'] += ', Clearbit'
        
        # Apply scoring adjustments
        result['score_adjustment'] = self._calculate_score_adjustment(result)
        
        # Cache the result
        self.cache[cache_key] = result
        
        return result
    
    def _opencorporates_lookup(self, domain: str, company_name: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Lookup company on OpenCorporates"""
        try:
            # Extract domain root for search
            domain_root = domain.split('.')[-2] if '.' in domain else domain
            search_query = company_name or domain_root
            
            url = f"{self.opencorporates_base_url}/companies/search"
            params = {
                'q': search_query,
                'per_page': 5,
                'order': 'score'
            }
            
            response = requests.get(url, params=params, timeout=10)
            if response.status_code == 200:
                data = response.json()
                companies = data.get('results', {}).get('companies', [])
                
                if companies:
                    # Take the first (best match) company
                    company = companies[0]['company']
                    
                    # Parse incorporation date
                    inc_date = None
                    if company.get('incorporation_date'):
                        try:
                            inc_date = datetime.strptime(company['incorporation_date'], '%Y-%m-%d')
                        except:
                            pass
                    
                    # Determine if telecom based on industry codes
                    is_telecom = False
                    industry = company.get('industry_codes', [])
                    if industry:
                        for code in industry:
                            if code.get('industry_code', {}).get('code') in self.telecom_sic_codes:
                                is_telecom = True
                                break
                    
                    return {
                        'incorporation_date': inc_date,
                        'company_status': company.get('current_status', 'unknown').lower(),
                        'company_industry': company.get('industry_codes', [{}])[0].get('industry_code', {}).get('name', 'Unknown'),
                        'is_telecom': is_telecom,
                        'company_name': company.get('name')
                    }
            
        except Exception as e:
            logger.error(f"OpenCorporates lookup failed for {domain}: {e}")
        
        return None
    
    def _clearbit_lookup(self, domain: str) -> Optional[Dict[str, Any]]:
        """Lookup company on Clearbit"""
        if not self.clearbit_api_key:
            return None
        
        try:
            url = f"https://company-stream.clearbit.com/v2/companies/find?domain={domain}"
            headers = {'Authorization': f'Bearer {self.clearbit_api_key}'}
            
            response = requests.get(url, headers=headers, timeout=10)
            if response.status_code == 200:
                data = response.json()
                
                # Check if telecom
                is_telecom = False
                categories = [data.get('category', {}).get('industry', '').lower(),
                            data.get('category', {}).get('subIndustry', '').lower(),
                            data.get('category', {}).get('industryGroup', '').lower()]
                
                for category in categories:
                    if any(keyword in category for keyword in self.telecom_keywords):
                        is_telecom = True
                        break
                
                # Parse founding year to date
                founding_date = None
                if data.get('foundedYear'):
                    try:
                        founding_date = datetime(int(data['foundedYear']), 1, 1)
                    except:
                        pass
                
                return {
                    'employee_count': data.get('metrics', {}).get('employeesRange', '0').split('-')[0],
                    'company_industry': data.get('category', {}).get('industry', 'Unknown'),
                    'is_telecom': is_telecom,
                    'company_name': data.get('name'),
                    'incorporation_date': founding_date,
                    'annual_revenue': data.get('metrics', {}).get('estimatedAnnualRevenue')
                }
            
        except Exception as e:
            logger.error(f"Clearbit lookup failed for {domain}: {e}")
        
        return None
    
    def _calculate_score_adjustment(self, company_data: Dict[str, Any]) -> int:
        """Calculate score adjustment based on company data"""
        score = 0
        
        # Company age bonus (5+ years)
        if company_data.get('incorporation_date'):
            age = (datetime.now() - company_data['incorporation_date']).days / 365
            if age > 5:
                score += 5
        
        # Company status penalty
        if company_data.get('company_status') == 'dissolved':
            score -= 50
        elif company_data.get('company_status') == 'inactive':
            score -= 20
        
        # Employee count bonus
        try:
            emp_count = int(str(company_data.get('employee_count', 0)).replace('+', ''))
            if emp_count > 500:
                score += 10
            elif emp_count > 100:
                score += 5
        except:
            pass
        
        # Telecom industry bonus
        if company_data.get('is_telecom'):
            score += 10
        
        return score
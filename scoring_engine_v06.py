import re
import logging
from typing import Tuple, Dict, Any, Optional
from datetime import datetime
from company_enrichment import CompanyEnrichment
from phone_enrichment import PhoneEnrichment

logger = logging.getLogger(__name__)

class EnhancedScoringEngine:
    """
    Enhanced scoring engine with real API integrations for:
    - Company intelligence (OpenCorporates, Clearbit)
    - Phone number lookups (Twilio, Clearbit)
    - Domain-based scoring with DIDWW rules
    """
    
    def __init__(self):
        # Initialize enrichment modules
        self.company_enrichment = CompanyEnrichment()
        self.phone_enrichment = PhoneEnrichment()
        
        # Domain categories
        self.free_email_providers = {
            'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
            'mail.com', 'protonmail.com', 'zoho.com', 'icloud.com', 'me.com',
            'mac.com', 'live.com', 'msn.com', 'yandex.com', 'mail.ru',
            'gmx.com', 'tutanota.com', 'fastmail.com', '163.com', 'qq.com'
        }
        
        self.telecom_domains = {
            'verizon.com', 'att.com', 'tmobile.com', 'sprint.com', 'vodafone.com',
            'orange.com', 'bt.com', 'telefonica.com', 'telstra.com', 'singtel.com',
            'twilio.com', 'vonage.com', 'ringcentral.com', '8x8.com', 'didww.com',
            'bandwidth.com', 'plivo.com', 'nexmo.com', 'messagebird.com'
        }
        
        self.enterprise_domains = {
            'microsoft.com', 'google.com', 'amazon.com', 'apple.com', 'salesforce.com',
            'oracle.com', 'ibm.com', 'cisco.com', 'adobe.com', 'sap.com'
        }
        
        # Premium TLDs
        self.premium_tlds = {'.com', '.org', '.net', '.io', '.co', '.ai', '.cloud'}
        
        # Suspicious TLDs
        self.suspicious_tlds = {'.tk', '.ml', '.ga', '.cf', '.biz', '.info', '.click'}
    
    def calculate_score(self, name: str, email: str) -> Tuple[int, str, Dict[str, Any]]:
        """
        Calculate lead score with real API enrichment
        
        Returns:
            - score (0-100)
            - detailed reason string
            - enrichment details dict
        """
        try:
            # Extract domain
            domain = email.split('@')[1].lower() if '@' in email else ''
            if not domain:
                return 0, "Invalid email format", {"error": "No domain found"}
            
            # Initialize scoring components
            details = {
                'domain': domain,
                'base_score': 0,
                'category': 'unknown',
                'enrichments': {}
            }
            
            components = []
            total_score = 0
            
            # 1. Base domain category scoring
            if domain in self.free_email_providers:
                details['category'] = 'free'
                details['base_score'] = 0
                components.append("Free email provider (0)")
            elif domain in self.telecom_domains:
                details['category'] = 'telecom'
                details['base_score'] = 30
                total_score += 30
                components.append("Telecom operator domain (+30)")
            elif domain in self.enterprise_domains:
                details['category'] = 'enterprise'
                details['base_score'] = 30
                total_score += 30
                components.append("Enterprise domain (+30)")
            else:
                details['category'] = 'business'
                details['base_score'] = 15
                total_score += 15
                components.append("Business domain (+15)")
            
            # 2. Company enrichment
            company_data = self.company_enrichment.enrich_company(domain, name)
            details['enrichments']['company'] = company_data
            
            if company_data['score_adjustment'] != 0:
                total_score += company_data['score_adjustment']
                
                # Add specific components based on company data
                if company_data.get('incorporation_date'):
                    age = (datetime.now() - company_data['incorporation_date']).days / 365
                    if age > 5:
                        components.append("Established company 5+ years (+5)")
                
                if company_data.get('company_status') == 'dissolved':
                    components.append("Company dissolved (-50)")
                elif company_data.get('company_status') == 'inactive':
                    components.append("Company inactive (-20)")
                
                if company_data.get('employee_count', 0) > 500:
                    components.append("Large company 500+ employees (+10)")
                elif company_data.get('employee_count', 0) > 100:
                    components.append("Mid-size company 100+ employees (+5)")
                
                if company_data.get('is_telecom'):
                    components.append("Telecom industry verified (+10)")
            
            # 3. Phone enrichment
            phone_data = self.phone_enrichment.enrich_phone(email, name, domain)
            details['enrichments']['phone'] = phone_data
            
            if phone_data['phone_number']:
                total_score += phone_data['score_adjustment']
                
                if phone_data['phone_verified']:
                    components.append(f"Verified phone number (+{phone_data['score_adjustment']})")
                else:
                    components.append(f"Phone number found (+{phone_data['score_adjustment']})")
                
                if phone_data.get('phone_type') == 'mobile':
                    components.append("Mobile phone (+5)")
            
            # 4. TLD scoring
            tld = '.' + domain.split('.')[-1] if '.' in domain else ''
            if tld in self.premium_tlds:
                total_score += 5
                components.append(f"Premium TLD {tld} (+5)")
                details['tld_bonus'] = 5
            elif tld in self.suspicious_tlds:
                total_score -= 10
                components.append(f"Suspicious TLD {tld} (-10)")
                details['tld_bonus'] = -10
            
            # 5. Domain length penalty
            domain_root = domain.split('.')[0]
            if len(domain_root) < 4 and details['category'] != 'free':
                total_score += 10
                components.append("Short premium domain (+10)")
            elif len(domain_root) > 20:
                total_score -= 5
                components.append("Suspiciously long domain (-5)")
            
            # 6. Name/email matching bonus
            name_parts = name.lower().split()
            email_local = email.split('@')[0].lower()
            
            if any(part in email_local for part in name_parts if len(part) > 2):
                total_score += 5
                components.append("Name matches email (+5)")
                details['name_match_bonus'] = 5
            
            # 7. Special characters penalty
            if re.search(r'[0-9]{4,}', email_local) or email_local.count('.') > 2:
                total_score -= 5
                components.append("Suspicious email pattern (-5)")
            
            # Cap score between 0 and 100
            total_score = max(0, min(100, total_score))
            
            # Build detailed reason
            reason = f"Score: {total_score} = " + " + ".join(components)
            
            # Add enrichment summary
            details['score'] = total_score
            details['industry'] = company_data.get('company_industry', 'Unknown')
            details['company_name'] = company_data.get('company_name')
            details['phone_number'] = phone_data.get('phone_number')
            details['data_sources'] = []
            
            if company_data.get('data_source'):
                details['data_sources'].append(company_data['data_source'])
            if phone_data.get('phone_source'):
                details['data_sources'].append(phone_data['phone_source'])
            
            return total_score, reason, details
            
        except Exception as e:
            logger.error(f"Error calculating score for {email}: {e}")
            return 0, f"Error: {str(e)}", {"error": str(e)}
    
    def format_enrichment_summary(self, details: Dict[str, Any]) -> str:
        """Format enrichment data for display"""
        parts = []
        
        # Company info
        company = details.get('enrichments', {}).get('company', {})
        if company.get('company_name'):
            parts.append(f"Company: {company['company_name']}")
        if company.get('employee_count'):
            parts.append(f"Employees: {company['employee_count']}")
        if company.get('company_status') and company['company_status'] != 'unknown':
            parts.append(f"Status: {company['company_status']}")
        
        # Phone info
        phone = details.get('enrichments', {}).get('phone', {})
        if phone.get('phone_number'):
            formatted_phone = self.phone_enrichment.format_phone_display(phone['phone_number'])
            parts.append(f"Phone: {formatted_phone}")
            if phone.get('phone_verified'):
                parts.append("✓ Verified")
        
        # Data sources
        sources = details.get('data_sources', [])
        if sources:
            parts.append(f"Sources: {', '.join(sources)}")
        
        return " | ".join(parts) if parts else "No enrichment data available"
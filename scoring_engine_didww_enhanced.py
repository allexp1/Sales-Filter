import re
import requests
from typing import Dict, Tuple, Optional, List, Any
from datetime import datetime, timedelta
import json

class DIDWWScoringEngine:
    """DIDWW-compliant scoring engine with all required checks"""
    
    def __init__(self):
        # Free email providers - recognize any TLD variation
        self.free_provider_patterns = [
            'gmail.com', 'yahoo.*', 'hotmail.*', 'yandex.ru',
            'mail.ru', 'bk.ru', 'tutamail.com', 'icloud.*', 'outlook.*',
            'protonmail.*', 'aol.*', 'zoho.*', 'fastmail.*'
        ]
        
        # Known telecom operators
        self.telecom_domains = {
            'vodafone.com', 't-mobile.com', 'verizon.com', 'att.com',
            'orange.com', 'telefonica.com', 'deutschetelekom.com',
            'bt.com', 'ee.co.uk', 'o2.com', 'three.com',
            'telstra.com.au', 'optus.com.au', 'telus.com',
            'rogers.com', 'bell.ca', 'tim.it', 'windtre.it',
            'movistar.com', 'claro.com', 'vivo.com.br',
            'mtn.com', 'airtel.com', 'etisalat.ae',
            'swisscom.ch', 'proximus.be', 'kpn.com'
        }
        
        # Fortune 500 / Large enterprises (expanded list)
        self.enterprise_domains = {
            'microsoft.com', 'apple.com', 'google.com', 'amazon.com',
            'facebook.com', 'meta.com', 'walmart.com', 'exxonmobil.com',
            'berkshirehathaway.com', 'unitedhealth.com', 'jpmorgan.com',
            'bankofamerica.com', 'alphabet.com', 'chevron.com',
            'wellsfargo.com', 'citigroup.com', 'att.com', 'comcast.com',
            'disney.com', 'intel.com', 'ibm.com', 'oracle.com',
            'cisco.com', 'salesforce.com', 'adobe.com', 'netflix.com'
        }
        
        # TLD bonuses
        self.bonus_tlds = {'.com', '.net', '.tel'}
        
        # Country-specific TLDs
        self.country_tlds = {
            '.co.il', '.de', '.us', '.uk', '.fr', '.it', '.es', 
            '.ca', '.au', '.jp', '.kr', '.cn', '.in', '.br', '.mx',
            '.nl', '.se', '.ch', '.at', '.be', '.dk', '.no', '.fi'
        }
        
        # Sanctioned countries (should be updated regularly)
        self.sanctioned_countries = {
            'ir', 'kp', 'sy', 'cu', 'ru', 'by', 'mm', 'af', 've'
        }
        
        # Load sanctions data
        self.sanctions_domains = self._load_sanctions_data()
        
        # Industry keywords mapping
        self.industry_keywords = {
            'Technology': ['tech', 'software', 'cloud', 'data', 'cyber', 'digital', 'it', 'dev', 'code', 'app', 'ai', 'ml'],
            'Telecommunications': ['telecom', 'telco', 'mobile', 'wireless', 'broadband', 'network', '5g', 'isp', 'voip', 'cpaas'],
            'Finance': ['bank', 'finance', 'invest', 'capital', 'fund', 'insurance', 'fintech', 'payment', 'credit', 'trading'],
            'Healthcare': ['health', 'medical', 'pharma', 'clinic', 'hospital', 'care', 'bio', 'wellness', 'doctor', 'patient'],
            'Retail': ['shop', 'store', 'retail', 'commerce', 'market', 'mall', 'buy', 'sell', 'ecommerce'],
            'Manufacturing': ['manufact', 'industrial', 'factory', 'production', 'assembly', 'plant', 'engineering'],
            'Education': ['edu', 'university', 'college', 'school', 'academy', 'learn', 'training', 'course'],
            'Energy': ['energy', 'power', 'oil', 'gas', 'solar', 'renewable', 'electric', 'utility', 'petroleum'],
            'Media': ['media', 'news', 'broadcast', 'publish', 'entertainment', 'studio', 'content', 'tv', 'radio'],
            'Real Estate': ['realty', 'property', 'estate', 'housing', 'construction', 'build', 'architect'],
            'Transportation': ['transport', 'logistics', 'shipping', 'freight', 'delivery', 'cargo', 'fleet'],
            'Consulting': ['consult', 'advisory', 'strategy', 'professional', 'services', 'solutions'],
            'Government': ['gov', 'government', 'federal', 'state', 'public', 'municipal', 'city'],
            'Non-profit': ['nonprofit', 'charity', 'foundation', 'ngo', 'org', 'volunteer'],
            'Agriculture': ['agri', 'farm', 'food', 'crop', 'livestock', 'harvest'],
            'Hospitality': ['hotel', 'restaurant', 'tourism', 'travel', 'hospitality', 'resort'],
            'Legal': ['law', 'legal', 'attorney', 'lawyer', 'justice', 'court'],
            'Automotive': ['auto', 'car', 'vehicle', 'motor', 'automotive', 'dealer']
        }
        
        # Role-based email patterns
        self.role_based_patterns = [
            'info', 'sales', 'support', 'admin', 'contact', 'help',
            'service', 'noreply', 'no-reply', 'hello', 'team',
            'office', 'mail', 'general', 'enquiry', 'inquiry'
        ]
        
        # Target sales regions for geo bonus
        self.target_regions = {
            'US', 'CA', 'GB', 'DE', 'FR', 'IT', 'ES', 'NL', 
            'CH', 'SE', 'DK', 'NO', 'FI', 'BE', 'AT', 'IE',
            'AU', 'NZ', 'JP', 'KR', 'SG', 'HK', 'IL'
        }
        
        # CRM history (placeholder - in production would connect to actual CRM)
        self.crm_history = {}
        
        # Telecom/VoIP tech stack keywords
        self.telecom_tech_keywords = [
            'twilio', 'nexmo', 'vonage', 'plivo', 'sinch', 'bandwidth',
            'asterisk', 'freeswitch', 'kamailio', 'opensips', 'webrtc',
            'sip', 'voip', 'pbx', 'ivr', 'did', 'toll-free', 'sms',
            'messaging', 'cloud-communications', 'cpaas', 'ucaas'
        ]
    
    def _load_sanctions_data(self) -> set:
        """Load sanctions data from file or API"""
        # In production, this would load from official sanctions APIs
        return {
            'sanctioned-domain1.ir',
            'sanctioned-company.ru',
            'blocked-org.kp',
            'crimea-telecom.ru',
            'syria-tel.sy'
        }
    
    def is_free_email(self, domain: str) -> bool:
        """Check if domain is a free email provider"""
        for pattern in self.free_provider_patterns:
            if pattern.endswith('*'):
                base = pattern[:-1]
                if domain.startswith(base):
                    return True
            elif domain == pattern:
                return True
        return False
    
    def is_role_based_email(self, email: str) -> bool:
        """Check if email is role-based"""
        if '@' not in email:
            return False
        
        local_part = email.split('@')[0].lower()
        return any(pattern in local_part for pattern in self.role_based_patterns)
    
    def get_domain_category(self, domain: str) -> Tuple[str, int]:
        """Determine domain category and base score"""
        if self.is_free_email(domain):
            return "free", 0
        elif domain in self.telecom_domains:
            return "telecom", 30
        elif domain in self.enterprise_domains:
            return "enterprise", 20
        else:
            return "corporate", 10
    
    def check_sanctions(self, domain: str, ip_address: Optional[str] = None) -> Tuple[bool, str]:
        """Check if domain or IP is sanctioned"""
        # Check domain sanctions
        if domain in self.sanctions_domains:
            return True, f"Domain {domain} is on sanctions list"
        
        # Check country TLD sanctions
        tld = self._get_tld(domain)
        if tld and tld.replace('.', '') in self.sanctioned_countries:
            return True, f"Country TLD {tld} is sanctioned"
        
        # Check domain parts for sanctioned country names
        domain_parts = domain.lower().split('.')
        for part in domain_parts:
            for country in self.sanctioned_countries:
                if country in part:
                    return True, f"Domain contains sanctioned country reference: {country}"
        
        # IP-based sanctions check (placeholder)
        if ip_address:
            # In production, would use GeoIP lookup
            pass
        
        return False, ""
    
    def check_domain_health(self, domain: str) -> Dict[str, Any]:
        """Comprehensive domain health check"""
        health_data = {
            'is_alive': False,
            'has_ssl': False,
            'ssl_valid': False,
            'dnssec_enabled': False,
            'mx_records': False,
            'status_code': None,
            'ssl_issuer': None
        }
        
        # Placeholder implementation - in production would make actual checks
        if self.is_free_email(domain):
            health_data['is_alive'] = True
            health_data['has_ssl'] = True
            health_data['ssl_valid'] = True
            health_data['mx_records'] = True
            return health_data
        
        # Simulate domain health checks for demo
        # In production:
        # 1. HTTP/HTTPS check
        # 2. SSL certificate validation
        # 3. DNSSEC lookup
        # 4. MX record check
        
        # For demo, assume corporate domains are healthy
        if not self.is_free_email(domain):
            health_data.update({
                'is_alive': True,
                'has_ssl': True,
                'ssl_valid': True,
                'dnssec_enabled': domain in self.enterprise_domains,
                'mx_records': True,
                'status_code': 200,
                'ssl_issuer': 'DigiCert Inc'
            })
        
        return health_data
    
    def check_domain_whois(self, domain: str) -> Dict[str, Any]:
        """Check WHOIS information for domain"""
        whois_data = {
            'domain_age_years': 0,
            'is_privacy_protected': False,
            'registrar': None,
            'creation_date': None
        }
        
        # Placeholder implementation
        # In production would use python-whois or similar
        if domain in self.enterprise_domains:
            whois_data.update({
                'domain_age_years': 15,
                'is_privacy_protected': False,
                'registrar': 'MarkMonitor Inc.',
                'creation_date': '2009-01-01'
            })
        elif domain in self.telecom_domains:
            whois_data.update({
                'domain_age_years': 20,
                'is_privacy_protected': False,
                'registrar': 'CSC Corporate Domains',
                'creation_date': '2004-01-01'
            })
        elif not self.is_free_email(domain):
            # Simulate random corporate domain
            import random
            whois_data.update({
                'domain_age_years': random.randint(1, 10),
                'is_privacy_protected': random.choice([True, False]),
                'registrar': random.choice(['GoDaddy', 'Namecheap', 'Network Solutions']),
                'creation_date': f"{2024 - whois_data['domain_age_years']}-01-01"
            })
        
        return whois_data
    
    def get_company_intelligence(self, domain: str) -> Dict[str, Any]:
        """Get company intelligence from Clearbit/FullContact (placeholder)"""
        intel = {
            'employee_count': 0,
            'industry': None,
            'annual_revenue': 0,
            'company_name': None,
            'description': None,
            'tags': []
        }
        
        if self.is_free_email(domain):
            return intel
        
        # Placeholder data based on domain category
        if domain in self.enterprise_domains:
            intel.update({
                'employee_count': 10000,
                'industry': 'Technology',
                'annual_revenue': 1000000000,  # $1B
                'company_name': domain.split('.')[0].title(),
                'tags': ['enterprise', 'fortune500', 'public']
            })
        elif domain in self.telecom_domains:
            intel.update({
                'employee_count': 5000,
                'industry': 'Telecommunications',
                'annual_revenue': 500000000,  # $500M
                'company_name': domain.split('.')[0].title() + ' Telecom',
                'tags': ['telecom', 'operator', 'carrier']
            })
        else:
            # Simulate for other corporate domains
            import random
            intel.update({
                'employee_count': random.randint(10, 500),
                'industry': self.detect_industry(domain),
                'annual_revenue': random.randint(1000000, 50000000),
                'company_name': domain.split('.')[0].title() + ' Corp',
                'tags': ['sme', 'corporate']
            })
        
        return intel
    
    def check_tech_stack(self, domain: str) -> Dict[str, Any]:
        """Check tech stack for telecom/VoIP technologies"""
        tech_data = {
            'has_telecom_tech': False,
            'technologies': [],
            'cpaas_platforms': []
        }
        
        # Placeholder - in production would use BuiltWith/Wappalyzer APIs
        if domain in self.telecom_domains:
            tech_data.update({
                'has_telecom_tech': True,
                'technologies': ['SIP.js', 'WebRTC', 'Asterisk'],
                'cpaas_platforms': ['Twilio', 'Vonage']
            })
        elif not self.is_free_email(domain):
            # Check domain name for tech keywords
            domain_lower = domain.lower()
            found_tech = []
            for keyword in self.telecom_tech_keywords:
                if keyword in domain_lower:
                    found_tech.append(keyword)
            
            if found_tech:
                tech_data.update({
                    'has_telecom_tech': True,
                    'technologies': found_tech[:3],
                    'cpaas_platforms': []
                })
        
        return tech_data
    
    def check_news_presence(self, domain: str) -> int:
        """Check Google News presence (placeholder)"""
        # In production: Google Custom Search API
        if domain in self.enterprise_domains:
            return 10  # High news presence
        elif domain in self.telecom_domains:
            return 5   # Moderate news presence
        elif not self.is_free_email(domain):
            import random
            return random.randint(0, 3)
        return 0
    
    def get_geolocation(self, domain: str) -> Dict[str, Any]:
        """Get geolocation data for domain"""
        geo_data = {
            'country_code': None,
            'country_name': None,
            'in_target_region': False,
            'timezone': None
        }
        
        # Placeholder implementation
        if domain.endswith('.il'):
            geo_data.update({
                'country_code': 'IL',
                'country_name': 'Israel',
                'in_target_region': True,
                'timezone': 'Asia/Jerusalem'
            })
        elif domain.endswith('.de'):
            geo_data.update({
                'country_code': 'DE',
                'country_name': 'Germany',
                'in_target_region': True,
                'timezone': 'Europe/Berlin'
            })
        elif domain in self.enterprise_domains or domain.endswith('.com'):
            geo_data.update({
                'country_code': 'US',
                'country_name': 'United States',
                'in_target_region': True,
                'timezone': 'America/New_York'
            })
        else:
            # Random assignment for demo
            import random
            country = random.choice(['GB', 'FR', 'CA', 'AU', 'IN', 'BR'])
            geo_data.update({
                'country_code': country,
                'country_name': country,
                'in_target_region': country in self.target_regions,
                'timezone': 'UTC'
            })
        
        return geo_data
    
    def check_crm_history(self, domain: str) -> Dict[str, Any]:
        """Check CRM history and engagement (placeholder)"""
        crm_data = {
            'is_returning': False,
            'previous_interactions': 0,
            'email_open_rate': 0,
            'email_click_rate': 0,
            'last_interaction': None
        }
        
        # Placeholder - in production would connect to actual CRM
        if domain in self.crm_history:
            crm_data.update(self.crm_history[domain])
        else:
            # Simulate for known domains
            if domain in self.enterprise_domains or domain in self.telecom_domains:
                crm_data.update({
                    'is_returning': True,
                    'previous_interactions': 3,
                    'email_open_rate': 45,
                    'email_click_rate': 15,
                    'last_interaction': '2024-06-15'
                })
        
        return crm_data
    
    def lookup_phone_number(self, name: str, email: str, domain: str) -> Optional[str]:
        """Lookup phone number from free databases (placeholder)"""
        # In production: Use APIs like Whitepages, TrueCaller, or LinkedIn
        
        # Placeholder implementation
        if domain in self.telecom_domains:
            return "+1-800-TELECOM"
        elif domain in self.enterprise_domains:
            return "+1-888-ENTERPRISE"
        elif not self.is_free_email(domain):
            # Simulate finding phone for some corporate domains
            import random
            if random.random() > 0.7:
                return f"+1-555-{random.randint(1000, 9999)}"
        
        return None
    
    def _get_tld(self, domain: str) -> Optional[str]:
        """Extract TLD from domain"""
        parts = domain.split('.')
        if len(parts) >= 2:
            # Handle country-specific TLDs like .co.il
            if len(parts) >= 3 and f".{parts[-2]}.{parts[-1]}" in self.country_tlds:
                return f".{parts[-2]}.{parts[-1]}"
            return f".{parts[-1]}"
        return None
    
    def calculate_tld_bonus(self, domain: str) -> int:
        """Calculate TLD bonus points"""
        tld = self._get_tld(domain)
        if not tld:
            return 0
        
        if tld in self.bonus_tlds or tld in self.country_tlds:
            return 5
        
        return 0
    
    def calculate_domain_metadata_bonus(self, domain: str) -> Tuple[int, List[str]]:
        """Calculate bonuses for domain metadata"""
        bonus = 0
        reasons = []
        
        # Don't give bonuses to free email domains
        if self.is_free_email(domain):
            return bonus, reasons
        
        # Extract root domain (without TLD)
        parts = domain.split('.')
        if len(parts) >= 2:
            root = parts[0]
            
            # Short domain bonus (only for non-free domains)
            if len(root) <= 10:
                bonus += 5
                reasons.append("short root (≤10 chars) (+5)")
            
            # Digit penalty
            if any(char.isdigit() for char in root):
                bonus -= 5
                reasons.append("digit(s) in root (-5)")
        
        return bonus, reasons
    
    def check_social_profiles(self, name: str, email: str) -> Dict[str, Tuple[bool, int]]:
        """Check social media profiles (enhanced placeholder)"""
        profiles = {
            'linkedin': (self._simulate_linkedin_check(name, email), 10),
            'github': (self._simulate_github_check(email), 15),
            'facebook': (self._simulate_facebook_check(name), 5),
            'twitter': (self._simulate_twitter_check(name), 5)
        }
        
        return profiles
    
    def _simulate_linkedin_check(self, name: str, email: str) -> bool:
        """Simulate LinkedIn profile check"""
        domain = email.split('@')[1] if '@' in email else ''
        return not self.is_free_email(domain) and len(name) > 3
    
    def _simulate_github_check(self, email: str) -> bool:
        """Simulate GitHub profile check"""
        domain = email.split('@')[1] if '@' in email else ''
        tech_keywords = ['dev', 'tech', 'soft', 'code', 'data', 'cloud', 'digital']
        return any(keyword in domain for keyword in tech_keywords)
    
    def _simulate_facebook_check(self, name: str) -> bool:
        """Simulate Facebook profile check"""
        return len(name) % 3 == 0
    
    def _simulate_twitter_check(self, name: str) -> bool:
        """Simulate Twitter profile check"""
        return len(name) % 4 == 0
    
    def check_username_match(self, name: str, email: str) -> bool:
        """Check if email username matches real name pattern"""
        if not name or not email or '@' not in email:
            return False
        
        username = email.split('@')[0].lower()
        name_parts = name.lower().split()
        
        # Check for firstname.lastname pattern
        if len(name_parts) >= 2:
            firstname = name_parts[0]
            lastname = name_parts[-1]
            
            # Check various common patterns
            patterns = [
                f"{firstname}.{lastname}",
                f"{firstname}{lastname}",
                f"{firstname[0]}{lastname}",
                f"{firstname}_{lastname}",
                f"{lastname}.{firstname}",
                f"{lastname}{firstname}"
            ]
            
            return any(pattern in username for pattern in patterns)
        
        # Check if single name appears in username
        elif len(name_parts) == 1:
            return name_parts[0] in username
        
        return False
    
    def detect_industry(self, domain: str) -> str:
        """Detect industry based on domain keywords"""
        if not domain or self.is_free_email(domain):
            return "Personal"
        
        # Check known enterprise/telecom domains first
        if domain in self.telecom_domains:
            return "Telecommunications"
        
        # Get company intelligence
        intel = self.get_company_intelligence(domain)
        if intel['industry']:
            return intel['industry']
        
        # Extract domain parts for keyword matching
        domain_lower = domain.lower()
        domain_parts = domain_lower.replace('-', ' ').replace('_', ' ').split('.')
        domain_text = ' '.join(domain_parts)
        
        # Check for industry keywords
        for industry, keywords in self.industry_keywords.items():
            for keyword in keywords:
                if keyword in domain_text:
                    return industry
        
        # Check TLD hints
        if domain.endswith('.edu'):
            return "Education"
        elif domain.endswith('.gov'):
            return "Government"
        elif domain.endswith('.org'):
            return "Non-profit"
        elif domain.endswith('.mil'):
            return "Government"
        
        return "Corporate"
    
    def calculate_score(self, name: str, email: str, ip_address: Optional[str] = None) -> Tuple[int, str, Dict]:
        """
        Calculate DIDWW-compliant score for a name/email pair
        Returns: (score, reason, details)
        """
        if not email or '@' not in email:
            return 0, "Invalid email format", {}
        
        domain = email.split('@')[1].lower().strip()
        score_components = []
        total_score = 0
        
        # 1. Base Domain Category
        category, base_score = self.get_domain_category(domain)
        total_score += base_score
        
        category_names = {
            'free': 'Free providers',
            'corporate': 'Other corporate domains',
            'enterprise': 'Large enterprises',
            'telecom': 'Telecom operator domains'
        }
        score_components.append(f"{category_names.get(category, category)} ({base_score})")
        
        # 2. Sanctions Screening
        is_sanctioned, sanction_reason = self.check_sanctions(domain, ip_address)
        if is_sanctioned:
            total_score -= 50
            score_components.append(f"Sanctions penalty (-50)")
        
        # 3. Domain Health & Metadata
        health = self.check_domain_health(domain)
        
        # Domain alive check
        if health['is_alive']:
            total_score += 10
            score_components.append("Domain alive (+10)")
        
        # SSL certificate check
        if health['ssl_valid']:
            total_score += 5
            score_components.append("Valid SSL certificate (+5)")
        
        # DNSSEC check
        if health['dnssec_enabled']:
            total_score += 5
            score_components.append("DNSSEC enabled (+5)")
        
        # MX records (email deliverability)
        if health['mx_records']:
            total_score += 5
            score_components.append("Email deliverability (+5)")
        
        # 4. WHOIS checks
        whois_data = self.check_domain_whois(domain)
        
        # Domain age
        if whois_data['domain_age_years'] > 5:
            total_score += 5
            score_components.append("Domain age > 5 yrs (+5)")
        
        # Privacy protection penalty
        if whois_data['is_privacy_protected']:
            total_score -= 5
            score_components.append("Privacy protected (-5)")
        
        # 5. TLD Bonus
        tld_bonus = self.calculate_tld_bonus(domain)
        if tld_bonus > 0:
            total_score += tld_bonus
            score_components.append(f"TLD bonus (+{tld_bonus})")
        
        # 6. Domain Metadata Bonuses
        metadata_bonus, metadata_reasons = self.calculate_domain_metadata_bonus(domain)
        total_score += metadata_bonus
        for reason in metadata_reasons:
            score_components.append(reason)
        
        # 7. Company Intelligence
        intel = self.get_company_intelligence(domain)
        
        if intel['employee_count'] > 500:
            total_score += 10
            score_components.append("Employee count > 500 (+10)")
        
        if intel['industry'] in ['Telecommunications', 'CPaaS']:
            total_score += 10
            score_components.append("Industry = Telecom/CPaaS (+10)")
        
        if intel['annual_revenue'] > 50000000:  # $50M
            total_score += 5
            score_components.append("Annual revenue > $50M (+5)")
        
        # 8. Social & News Presence
        social_profiles = self.check_social_profiles(name, email)
        for platform, (found, points) in social_profiles.items():
            if found:
                total_score += points
                score_components.append(f"LinkedIn match (+{points})" if platform == 'linkedin' else
                                      f"GitHub profile (+{points})" if platform == 'github' else
                                      f"Facebook page (+{points})" if platform == 'facebook' else
                                      f"Twitter handle (+{points})")
        
        # News presence
        news_count = self.check_news_presence(domain)
        if news_count > 3:
            total_score += 5
            score_components.append('Google "site:news" hit count > 3 (+5)')
        
        # 9. Tech-Stack Fingerprint
        tech_data = self.check_tech_stack(domain)
        if tech_data['has_telecom_tech']:
            total_score += 10
            score_components.append("Detect telecom/VoIP libraries (+10)")
        
        # 10. Role-Based Email
        if self.is_role_based_email(email):
            total_score -= 10
            score_components.append("Role-based email (-10)")
        
        # 11. Geolocation & Timezone
        geo_data = self.get_geolocation(domain)
        if geo_data['in_target_region']:
            total_score += 5
            score_components.append("Aligned with sales region (+5)")
        else:
            total_score -= 5
            score_components.append("Outside target regions (-5)")
        
        # 12. CRM History & Engagement
        crm_data = self.check_crm_history(domain)
        if crm_data['is_returning']:
            total_score += 10
            score_components.append("Returning user (+10)")
        
        if crm_data['email_open_rate'] > 30:
            total_score += 5
            score_components.append("Past email open rate > 30% (+5)")
        
        # 13. Free-Email Username Match
        if category == 'free' and self.check_username_match(name, email):
            total_score += 5
            score_components.append("Freemail username match (+5)")
        
        # Final score capping
        final_score = max(0, min(100, total_score))
        
        # Build reason string
        reason_str = " + ".join(score_components) + f" = {final_score}"
        
        # Get additional enrichment data
        phone_number = self.lookup_phone_number(name, email, domain)
        
        # Build details dictionary
        details = {
            'domain': domain,
            'category': category,
            'industry': self.detect_industry(domain),
            'base_score': base_score,
            'is_sanctioned': is_sanctioned,
            'domain_health': health,
            'whois': whois_data,
            'company_intelligence': intel,
            'social_profiles': {k: v[0] for k, v in social_profiles.items()},
            'tech_stack': tech_data,
            'geo_location': geo_data,
            'crm_history': crm_data,
            'phone_number': phone_number,
            'is_role_based': self.is_role_based_email(email),
            'final_score': final_score,
            'capped': total_score != final_score
        }
        
        return final_score, reason_str, details


# Test the scoring engine
if __name__ == "__main__":
    engine = DIDWWScoringEngine()
    
    # Test cases
    test_cases = [
        ("John Doe", "john.doe@gmail.com"),
        ("Jane Smith", "jsmith@vodafone.com"),
        ("Bob Wilson", "bob@microsoft.com"),
        ("Alice Brown", "alice@some-company.com"),
        ("Test User", "test123@domain.ir"),
        ("Sales Team", "sales@example.com"),
        ("Developer", "dev@github-enterprise.com"),
    ]
    
    for name, email in test_cases:
        score, reason, details = engine.calculate_score(name, email)
        print(f"\n{name} <{email}>")
        print(f"Score: {score}")
        print(f"Reason: {reason}")
        print(f"Industry: {details.get('industry')}")
        print(f"Phone: {details.get('phone_number', 'Not found')}")
        print(f"Company: {details['company_intelligence'].get('company_name', 'Unknown')}")
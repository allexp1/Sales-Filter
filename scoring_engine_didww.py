import re
import requests
from typing import Dict, Tuple, Optional, List
from datetime import datetime
import json

class DIDWWScoringEngine:
    """DIDWW-compliant scoring engine with sanctions screening and social media checks"""
    
    def __init__(self):
        # Free email providers - recognize any TLD variation
        self.free_provider_patterns = [
            'gmail.com', 'yahoo.*', 'hotmail.*', 'yandex.ru',
            'mail.ru', 'bk.ru', 'tutamail.com', 'icloud.*'
        ]
        
        # Known telecom operators
        self.telecom_domains = {
            'vodafone.com', 't-mobile.com', 'verizon.com', 'att.com',
            'orange.com', 'telefonica.com', 'deutschetelekom.com',
            'bt.com', 'ee.co.uk', 'o2.com', 'three.com',
            'telstra.com.au', 'optus.com.au', 'telus.com',
            'rogers.com', 'bell.ca', 'tim.it', 'windtre.it',
            'movistar.com', 'claro.com', 'vivo.com.br',
            'mtn.com', 'airtel.com', 'etisalat.ae'
        }
        
        # Fortune 500 / Large enterprises (sample list)
        self.enterprise_domains = {
            'microsoft.com', 'apple.com', 'google.com', 'amazon.com',
            'facebook.com', 'meta.com', 'walmart.com', 'exxonmobil.com',
            'berkshirehathaway.com', 'unitedhealth.com', 'jpmorgan.com',
            'bankofamerica.com', 'alphabet.com', 'chevron.com',
            'wellsfargo.com', 'citigroup.com', 'att.com', 'comcast.com'
        }
        
        # TLD bonuses
        self.bonus_tlds = {'.com', '.net', '.tel'}
        
        # Country-specific TLDs (sample list)
        self.country_tlds = {
            '.co.il', '.de', '.us', '.uk', '.fr', '.it', '.es', 
            '.ca', '.au', '.jp', '.kr', '.cn', '.in', '.br', '.mx'
        }
        
        # Sanctioned countries (placeholder list - should be updated regularly)
        self.sanctioned_countries = {
            'ir', 'kp', 'sy', 'cu', 'ru', 'by', 'mm'  # Iran, North Korea, Syria, Cuba, Russia, Belarus, Myanmar
        }
        
        # Load sanctions data (placeholder)
        self.sanctions_domains = self._load_sanctions_data()
        
        # Industry keywords mapping
        self.industry_keywords = {
            'Technology': ['tech', 'software', 'cloud', 'data', 'cyber', 'digital', 'it', 'dev', 'code', 'app'],
            'Telecommunications': ['telecom', 'telco', 'mobile', 'wireless', 'broadband', 'network', '5g', 'isp'],
            'Finance': ['bank', 'finance', 'invest', 'capital', 'fund', 'insurance', 'fintech', 'payment', 'credit'],
            'Healthcare': ['health', 'medical', 'pharma', 'clinic', 'hospital', 'care', 'bio', 'wellness'],
            'Retail': ['shop', 'store', 'retail', 'commerce', 'market', 'mall', 'buy', 'sell'],
            'Manufacturing': ['manufact', 'industrial', 'factory', 'production', 'assembly', 'plant'],
            'Education': ['edu', 'university', 'college', 'school', 'academy', 'learn', 'training'],
            'Energy': ['energy', 'power', 'oil', 'gas', 'solar', 'renewable', 'electric', 'utility'],
            'Media': ['media', 'news', 'broadcast', 'publish', 'entertainment', 'studio', 'content'],
            'Real Estate': ['realty', 'property', 'estate', 'housing', 'construction', 'build'],
            'Transportation': ['transport', 'logistics', 'shipping', 'freight', 'delivery', 'cargo'],
            'Consulting': ['consult', 'advisory', 'strategy', 'professional', 'services'],
            'Government': ['gov', 'government', 'federal', 'state', 'public', 'municipal'],
            'Non-profit': ['nonprofit', 'charity', 'foundation', 'ngo', 'org'],
            'Agriculture': ['agri', 'farm', 'food', 'crop', 'livestock'],
            'Hospitality': ['hotel', 'restaurant', 'tourism', 'travel', 'hospitality'],
            'Legal': ['law', 'legal', 'attorney', 'lawyer', 'justice'],
            'Automotive': ['auto', 'car', 'vehicle', 'motor', 'automotive']
        }
    
    def _load_sanctions_data(self) -> set:
        """Load sanctions data from file or API (placeholder)"""
        # In production, this would load from a regularly updated source
        return {
            'sanctioned-domain1.ir',
            'sanctioned-company.ru',
            'blocked-org.kp'
        }
    
    def is_free_email(self, domain: str) -> bool:
        """Check if domain is a free email provider"""
        for pattern in self.free_provider_patterns:
            if pattern.endswith('*'):
                # Handle wildcard patterns like yahoo.*
                base = pattern[:-1]
                if domain.startswith(base):
                    return True
            elif domain == pattern:
                return True
        return False
    
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
        """Check if domain or IP is sanctioned (placeholder implementation)"""
        # Check domain sanctions
        if domain in self.sanctions_domains:
            return True, f"Domain {domain} is sanctioned"
        
        # Check country TLD sanctions
        tld = self._get_tld(domain)
        if tld and tld.replace('.', '') in self.sanctioned_countries:
            return True, f"Country TLD {tld} is sanctioned"
        
        # IP-based sanctions check (placeholder)
        if ip_address:
            # In production, would use GeoIP lookup
            pass
        
        return False, ""
    
    def check_domain_health(self, domain: str) -> Tuple[bool, str]:
        """Check if domain responds to HTTPS HEAD request (placeholder)"""
        # Placeholder implementation - in production would make actual HTTP request
        # For demo purposes, assume all non-free domains are alive
        if self.is_free_email(domain):
            return False, "Free email provider"
        
        # Simulate domain health check
        # In production: 
        # try:
        #     response = requests.head(f"https://{domain}", timeout=5)
        #     return response.status_code < 400, f"Status: {response.status_code}"
        # except:
        #     return False, "Domain unreachable"
        
        return True, "Domain active (simulated)"
    
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
                reasons.append("Short domain (≤10 chars): +5")
            
            # Digit penalty
            if any(char.isdigit() for char in root):
                bonus -= 5
                reasons.append("Digits in domain: -5")
        
        return bonus, reasons
    
    def check_social_profiles(self, name: str, email: str) -> Dict[str, Tuple[bool, int]]:
        """Check social media profiles (placeholder implementation)"""
        # In production, these would use actual APIs or web scraping
        # For demo purposes, return simulated results
        
        profiles = {
            'linkedin': (self._simulate_linkedin_check(name, email), 10),
            'github': (self._simulate_github_check(email), 15),
            'facebook': (self._simulate_facebook_check(name), 5),
            'twitter': (self._simulate_twitter_check(name), 5)
        }
        
        return profiles
    
    def _simulate_linkedin_check(self, name: str, email: str) -> bool:
        """Simulate LinkedIn profile check"""
        # In production: Use LinkedIn API or search
        # For demo: Return True for corporate emails with matching names
        domain = email.split('@')[1] if '@' in email else ''
        return not self.is_free_email(domain) and len(name) > 3
    
    def _simulate_github_check(self, email: str) -> bool:
        """Simulate GitHub profile check"""
        # In production: Use GitHub API
        # For demo: Return True for tech-related domains
        domain = email.split('@')[1] if '@' in email else ''
        tech_keywords = ['dev', 'tech', 'soft', 'code', 'data', 'cloud']
        return any(keyword in domain for keyword in tech_keywords)
    
    def _simulate_facebook_check(self, name: str) -> bool:
        """Simulate Facebook profile check"""
        # In production: Use Facebook Graph API
        # For demo: Random simulation
        return len(name) % 3 == 0
    
    def _simulate_twitter_check(self, name: str) -> bool:
        """Simulate Twitter profile check"""
        # In production: Use Twitter API
        # For demo: Random simulation
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
        if domain in self.enterprise_domains:
            # Map known enterprises to their industries
            enterprise_industries = {
                'microsoft.com': 'Technology',
                'apple.com': 'Technology',
                'google.com': 'Technology',
                'amazon.com': 'E-commerce',
                'facebook.com': 'Technology',
                'meta.com': 'Technology',
                'walmart.com': 'Retail',
                'exxonmobil.com': 'Energy',
                'berkshirehathaway.com': 'Finance',
                'unitedhealth.com': 'Healthcare',
                'jpmorgan.com': 'Finance',
                'bankofamerica.com': 'Finance',
                'alphabet.com': 'Technology',
                'chevron.com': 'Energy',
                'wellsfargo.com': 'Finance',
                'citigroup.com': 'Finance',
                'att.com': 'Telecommunications',
                'comcast.com': 'Telecommunications'
            }
            return enterprise_industries.get(domain, 'Enterprise')
        
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
        reasons = []
        total_score = 0
        
        # 1. Base Domain Category
        category, base_score = self.get_domain_category(domain)
        total_score += base_score
        
        category_names = {
            'free': 'Free email base',
            'corporate': 'Corporate domain',
            'enterprise': 'Large enterprise',
            'telecom': 'Telecom operator'
        }
        score_components.append(f"{category_names.get(category, category)} ({base_score})")
        
        # 2. Sanctions Screening
        is_sanctioned, sanction_reason = self.check_sanctions(domain, ip_address)
        if is_sanctioned:
            total_score -= 50
            score_components.append(f"Sanctions penalty (-50)")
            reasons.append(sanction_reason)
        
        # 3. Domain Health Check
        is_alive, health_reason = self.check_domain_health(domain)
        if is_alive:
            total_score += 10
            score_components.append("Domain alive (+10)")
        
        # 4. TLD Bonus
        tld_bonus = self.calculate_tld_bonus(domain)
        if tld_bonus > 0:
            total_score += tld_bonus
            score_components.append(f"TLD bonus (+{tld_bonus})")
        
        # 5. Domain Metadata Bonuses
        metadata_bonus, metadata_reasons = self.calculate_domain_metadata_bonus(domain)
        total_score += metadata_bonus
        for reason in metadata_reasons:
            score_components.append(reason)
        
        # 6. Social Footprint Bonuses
        social_profiles = self.check_social_profiles(name, email)
        social_score = 0
        for platform, (found, points) in social_profiles.items():
            if found:
                social_score += points
                score_components.append(f"{platform.capitalize()} (+{points})")
        total_score += social_score
        
        # 7. Free-Email Username Match
        if category == 'free' and self.check_username_match(name, email):
            total_score += 5
            score_components.append("Username match (+5)")
        
        # Final score capping
        final_score = max(0, min(100, total_score))
        
        # Build reason string
        reason_str = " + ".join(score_components) + f" = {final_score}"
        
        # Build details dictionary
        details = {
            'domain': domain,
            'category': category,
            'industry': self.detect_industry(domain),
            'base_score': base_score,
            'is_sanctioned': is_sanctioned,
            'is_alive': is_alive,
            'tld_bonus': tld_bonus,
            'metadata_bonus': metadata_bonus,
            'social_score': social_score,
            'social_profiles': {k: v[0] for k, v in social_profiles.items()},
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
    ]
    
    for name, email in test_cases:
        score, reason, details = engine.calculate_score(name, email)
        print(f"\n{name} <{email}>")
        print(f"Score: {score}")
        print(f"Reason: {reason}")
        print(f"Details: {json.dumps(details, indent=2)}")
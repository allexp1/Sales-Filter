import re
from models import DomainIndustry, db
from typing import Dict, Tuple, Optional
from datetime import datetime

class ScoringEngine:
    """Enhanced scoring engine for v0.5 with industry lookup and advanced rules"""
    
    def __init__(self):
        self.free_providers = {
            'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'aol.com', 
            'icloud.com', 'live.com', 'msn.com', 'yandex.com', 'protonmail.com',
            'mail.com', 'zoho.com', 'gmx.com', 'fastmail.com'
        }
        
        self.telecom_tlds = {
            '.tel', '.net', '.org'
        }
        
        self.premium_tlds = {
            '.com', '.net', '.org', '.edu', '.gov', '.mil'
        }
        
        self.country_tlds = {
            '.uk', '.de', '.fr', '.it', '.es', '.ca', '.au', '.jp', '.kr', '.cn',
            '.in', '.br', '.mx', '.ru', '.nl', '.ch', '.se', '.no', '.dk', '.fi',
            '.at', '.be', '.pl', '.cz', '.hu', '.ro', '.bg', '.hr', '.si', '.sk',
            '.ie', '.pt', '.gr', '.tr', '.il', '.ae', '.sa', '.za', '.eg', '.ma',
            '.ng', '.ke', '.gh', '.tz', '.ug', '.zw', '.mw', '.zm', '.bw', '.sz',
            '.ls', '.na', '.ao', '.mz', '.mg', '.mu', '.sc', '.cv', '.st', '.gq',
            '.ga', '.cf', '.cd', '.cg', '.cm', '.bi', '.rw', '.dj', '.so', '.et',
            '.er', '.sd', '.ss', '.ly', '.tn', '.dz', '.mr', '.sn', '.gm', '.gw',
            '.gn', '.sl', '.lr', '.ci', '.bf', '.ml', '.ne', '.td', '.nz', '.fj',
            '.pg', '.sb', '.vu', '.nc', '.pf', '.wf', '.ws', '.to', '.tv', '.nu',
            '.ck', '.ki', '.nr', '.pw', '.fm', '.mh', '.mp', '.gu', '.as', '.vi',
            '.pr', '.do', '.ht', '.jm', '.cu', '.bs', '.bb', '.ag', '.dm', '.gd',
            '.kn', '.lc', '.vc', '.tt', '.gy', '.sr', '.fk', '.gf', '.aw', '.cw',
            '.sx', '.bq', '.tc', '.vg', '.ai', '.ms', '.gl', '.fo', '.is', '.ad',
            '.mc', '.sm', '.va', '.mt', '.cy', '.li', '.lu', '.by', '.md', '.ua',
            '.ge', '.am', '.az', '.kz', '.kg', '.tj', '.tm', '.uz', '.af', '.pk',
            '.bd', '.bt', '.lk', '.mv', '.np', '.mm', '.la', '.kh', '.vn', '.th',
            '.my', '.sg', '.bn', '.id', '.tl', '.ph', '.tw', '.hk', '.mo', '.mn',
            '.kp'
        }
    
    def extract_domain(self, email: str) -> Optional[str]:
        """Extract domain from email address"""
        if not email or '@' not in email:
            return None
        return email.split('@')[1].lower().strip()
    
    def extract_local_part(self, email: str) -> Optional[str]:
        """Extract local part (before @) from email address"""
        if not email or '@' not in email:
            return None
        return email.split('@')[0].lower().strip()
    
    def normalize_name(self, name: str) -> str:
        """Normalize name for comparison (remove spaces, special chars, numbers)"""
        if not name:
            return ""
        # Remove numbers, special characters, and spaces
        normalized = re.sub(r'[^a-zA-Z]', '', name.lower())
        return normalized
    
    def check_name_match(self, name: str, email: str) -> bool:
        """Check if local part of email matches the name (ignoring numbers/special chars)"""
        if not name or not email:
            return False
        
        local_part = self.extract_local_part(email)
        if not local_part:
            return False
        
        # Normalize both name and local part
        normalized_name = self.normalize_name(name)
        normalized_local = re.sub(r'[^a-zA-Z]', '', local_part)
        
        if not normalized_name or not normalized_local:
            return False
        
        # Check if normalized name appears in normalized local part
        return normalized_name in normalized_local or normalized_local in normalized_name
    
    def get_domain_info(self, domain: str) -> Dict:
        """Get domain information from database or classify it"""
        if not domain:
            return {'industry': 'Unknown', 'domain_type': 'unknown', 'score_modifier': 0}
        
        # Check database first
        domain_info = DomainIndustry.query.filter_by(domain=domain).first()
        if domain_info:
            return {
                'industry': domain_info.industry,
                'domain_type': domain_info.domain_type,
                'score_modifier': domain_info.score_modifier
            }
        
        # Classify unknown domains
        if domain in self.free_providers:
            return {'industry': 'Free Email', 'domain_type': 'free', 'score_modifier': -30}
        
        # Check for telecom keywords
        telecom_keywords = ['telecom', 'telco', 'mobile', 'wireless', 'phone', 'cellular']
        if any(keyword in domain for keyword in telecom_keywords):
            return {'industry': 'Telecom', 'domain_type': 'telecom', 'score_modifier': 50}
        
        # Default to corporate
        return {'industry': 'Corporate', 'domain_type': 'corporate', 'score_modifier': 10}
    
    def get_tld_bonus(self, domain: str) -> int:
        """Calculate TLD bonus points"""
        if not domain:
            return 0
        
        # Get TLD (everything after the last dot)
        parts = domain.split('.')
        if len(parts) < 2:
            return 0
        
        tld = '.' + parts[-1]
        
        # Telecom-friendly TLDs
        if tld in self.telecom_tlds:
            return 10
        
        # Country-specific TLDs
        if tld in self.country_tlds:
            return 10
        
        # Premium TLDs
        if tld in self.premium_tlds:
            return 5
        
        return 0
    
    def calculate_score(self, name: str, email: str) -> Tuple[int, str, Dict]:
        """
        Calculate score for a name/email pair
        Returns: (score, reason, details)
        """
        if not email:
            return 0, "No email provided", {}
        
        domain = self.extract_domain(email)
        if not domain:
            return 0, "Invalid email format", {}
        
        # Get domain information
        domain_info = self.get_domain_info(domain)
        
        # Initialize scoring components
        base_score = 0
        tld_bonus = 0
        name_match_bonus = 0
        reasons = []
        
        # Base score based on domain type
        base_score = domain_info['score_modifier']
        
        if domain_info['domain_type'] == 'free':
            reasons.append(f"Free email provider ({domain}): {base_score} pts")
        elif domain_info['domain_type'] == 'telecom':
            reasons.append(f"Telecom domain ({domain}): +{base_score} pts")
        elif domain_info['domain_type'] == 'enterprise':
            reasons.append(f"Enterprise domain ({domain}): +{base_score} pts")
        elif domain_info['domain_type'] == 'corporate':
            reasons.append(f"Corporate domain ({domain}): +{base_score} pts")
        else:
            reasons.append(f"Unknown domain type ({domain}): {base_score} pts")
        
        # TLD bonus
        tld_bonus = self.get_tld_bonus(domain)
        if tld_bonus > 0:
            reasons.append(f"TLD bonus: +{tld_bonus} pts")
        
        # Name match bonus for free email providers
        if domain_info['domain_type'] == 'free' and self.check_name_match(name, email):
            name_match_bonus = 5
            reasons.append(f"Name matches email local part: +{name_match_bonus} pts")
        
        # Calculate final score
        final_score = base_score + tld_bonus + name_match_bonus
        
        # Cap to 0-100 range
        final_score = max(0, min(100, final_score))
        
        # Create reason string
        reason_str = " | ".join(reasons)
        if final_score == 0:
            reason_str += " | Score capped at 0"
        elif final_score == 100:
            reason_str += " | Score capped at 100"
        
        # Return detailed information
        details = {
            'domain': domain,
            'industry': domain_info['industry'],
            'domain_type': domain_info['domain_type'],
            'base_score': base_score,
            'tld_bonus': tld_bonus,
            'name_match_bonus': name_match_bonus,
            'final_score': final_score,
            'name_match': name_match_bonus > 0
        }
        
        return final_score, reason_str, details
    
    def add_domain_to_database(self, domain: str, industry: str, domain_type: str, score_modifier: int):
        """Add a new domain to the database"""
        existing = DomainIndustry.query.filter_by(domain=domain).first()
        if existing:
            # Update existing
            existing.industry = industry
            existing.domain_type = domain_type
            existing.score_modifier = score_modifier
        else:
            # Create new
            new_domain = DomainIndustry(
                domain=domain,
                industry=industry,
                domain_type=domain_type,
                score_modifier=score_modifier
            )
            db.session.add(new_domain)
        
        db.session.commit()
    
    def get_business_domains_stats(self, session_id: int) -> Dict:
        """Get statistics for business domains only (excluding free providers)"""
        from models import ProcessingResult
        
        # Get all results for this session, excluding free email providers
        results = ProcessingResult.query.filter(
            ProcessingResult.session_id == session_id,
            ~ProcessingResult.domain.in_(self.free_providers)
        ).all()
        
        domain_stats = {}
        industry_stats = {}
        
        for result in results:
            if result.domain:
                # Domain statistics
                if result.domain in domain_stats:
                    domain_stats[result.domain]['count'] += 1
                    domain_stats[result.domain]['total_score'] += result.score or 0
                else:
                    domain_stats[result.domain] = {
                        'count': 1,
                        'total_score': result.score or 0,
                        'industry': result.industry or 'Unknown'
                    }
                
                # Industry statistics
                industry = result.industry or 'Unknown'
                if industry in industry_stats:
                    industry_stats[industry]['count'] += 1
                    industry_stats[industry]['total_score'] += result.score or 0
                else:
                    industry_stats[industry] = {
                        'count': 1,
                        'total_score': result.score or 0
                    }
        
        # Calculate averages and sort
        for domain_data in domain_stats.values():
            domain_data['avg_score'] = domain_data['total_score'] / domain_data['count']
        
        for industry_data in industry_stats.values():
            industry_data['avg_score'] = industry_data['total_score'] / industry_data['count']
        
        # Sort by count (most frequent first)
        top_domains = sorted(domain_stats.items(), key=lambda x: x[1]['count'], reverse=True)[:10]
        top_industries = sorted(industry_stats.items(), key=lambda x: x[1]['count'], reverse=True)[:10]
        
        return {
            'top_domains': top_domains,
            'top_industries': top_industries,
            'total_business_domains': len(domain_stats),
            'total_industries': len(industry_stats)
        }
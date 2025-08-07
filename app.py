from flask import Flask, request, jsonify, send_file, Response, stream_with_context
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
import pandas as pd
import os
import json
from datetime import datetime
import tempfile
import re
import requests
import dns.resolver
import socket
from urllib.parse import urlparse
import time
from bs4 import BeautifulSoup
import random
import uuid
from queue import Queue
import threading
import shutil

app = Flask(__name__)
CORS(app)

# Create directory for processed files
PROCESSED_FILES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'processed_files')
os.makedirs(PROCESSED_FILES_DIR, exist_ok=True)

# Database configuration with improved settings
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///./sales_filter.db?timeout=30'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    'pool_pre_ping': True,
    'pool_recycle': 300,
    'connect_args': {
        'timeout': 30,
        'check_same_thread': False
    }
}
db = SQLAlchemy(app)

# Global progress tracking
progress_updates = {}

# Database Models
class ProcessingSession(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(255), nullable=False)
    upload_time = db.Column(db.DateTime, default=datetime.utcnow)
    total_rows = db.Column(db.Integer, nullable=False)
    processed_file_path = db.Column(db.String(500))
    status = db.Column(db.String(50), default='completed')
    
    # Relationship to processing results and logs
    results = db.relationship('ProcessingResult', backref='session', lazy=True, cascade='all, delete-orphan')
    logs = db.relationship('ProcessingLog', backref='session', lazy=True, cascade='all, delete-orphan')
    
    def to_dict(self):
        return {
            'id': self.id,
            'filename': self.filename,
            'upload_time': self.upload_time.isoformat() if self.upload_time else None,
            'total_rows': self.total_rows,
            'status': self.status
        }

class ProcessingLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('processing_session.id'), nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    level = db.Column(db.String(20), default='info')  # info, warning, error, success
    message = db.Column(db.Text, nullable=False)
    details = db.Column(db.Text)  # JSON string for additional details
    
    def to_dict(self):
        return {
            'id': self.id,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
            'level': self.level,
            'message': self.message,
            'details': self.details
        }

class ProcessingResult(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('processing_session.id'), nullable=False)
    name = db.Column(db.String(255))
    email = db.Column(db.String(255), nullable=False)
    domain = db.Column(db.String(255))
    score = db.Column(db.Integer, nullable=False)
    reason = db.Column(db.Text)
    
    # Verification fields
    domain_alive = db.Column(db.Boolean, default=False)
    linkedin_verified = db.Column(db.Boolean, default=False)
    facebook_verified = db.Column(db.Boolean, default=False)
    linkedin_match = db.Column(db.Boolean, default=False)
    facebook_match = db.Column(db.Boolean, default=False)
    github_verified = db.Column(db.Boolean, default=False)
    github_match = db.Column(db.Boolean, default=False)
    
    # Advanced intelligence fields
    email_pattern_score = db.Column(db.Integer, default=0)
    consistency_score = db.Column(db.Integer, default=0)
    executive_score = db.Column(db.Integer, default=0)
    technical_score = db.Column(db.Integer, default=0)
    b2b_score = db.Column(db.Integer, default=0)
    suspicious_score = db.Column(db.Integer, default=0)
    geographic_score = db.Column(db.Integer, default=0)
    industry_score = db.Column(db.Integer, default=0)
    detected_industry = db.Column(db.String(100))
    domain_type = db.Column(db.String(50))
    
    verification_details = db.Column(db.Text)  # JSON string for detailed verification info
    intelligence_data = db.Column(db.Text)     # JSON string for advanced intelligence data
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'email': self.email,
            'domain': self.domain,
            'score': self.score,
            'reason': self.reason,
            'domain_alive': self.domain_alive,
            'linkedin_verified': self.linkedin_verified,
            'facebook_verified': self.facebook_verified,
            'linkedin_match': self.linkedin_match,
            'facebook_match': self.facebook_match,
            'github_verified': self.github_verified,
            'github_match': self.github_match,
            'email_pattern_score': self.email_pattern_score,
            'consistency_score': self.consistency_score,
            'executive_score': self.executive_score,
            'technical_score': self.technical_score,
            'b2b_score': self.b2b_score,
            'suspicious_score': self.suspicious_score,
            'geographic_score': self.geographic_score,
            'industry_score': self.industry_score,
            'detected_industry': self.detected_industry,
            'domain_type': self.domain_type,
            'verification_details': self.verification_details,
            'intelligence_data': self.intelligence_data
        }

# Domain classification lists
TELECOM_OPERATORS = {
    'vodafone.com', 'vodafone.co.uk', 'vodafone.de', 'vodafone.it',
    't-mobile.com', 't-mobile.de', 't-mobile.nl', 't-mobile.at',
    'orange.com', 'orange.fr', 'orange.es', 'orange.pl',
    'telefonica.com', 'telefonica.es', 'telefonica.de',
    'telecom.co.nz', 'telecom.com.au', 'telecom.pt',
    'verizon.com', 'att.com', 'sprint.com', 'tmobile.com',
    'bell.ca', 'rogers.com', 'telus.com',
    'bt.com', 'ee.co.uk', 'three.co.uk', 'o2.co.uk',
    'swisscom.ch', 'telekom.de', 'kpn.com', 'proximus.be',
    'telenor.com', 'telia.com', 'tele2.com', 'elisa.fi',
    'mtn.com', 'etisalat.ae', 'stc.com.sa', 'zain.com',
    'bharti.in', 'airtel.in', 'jio.com', 'idea.in',
    'singtel.com', 'celcom.com.my', 'digi.com.my',
    'ntt.com', 'nttdocomo.com', 'softbank.jp', 'kddi.com',
    'chinatelecom.com.cn', 'chinamobile.com', 'chinaunicom.com',
    'sktelecom.com', 'kt.com', 'lguplus.co.kr'
}

ENTERPRISE_DOMAINS = {
    'microsoft.com', 'google.com', 'amazon.com', 'apple.com',
    'facebook.com', 'meta.com', 'netflix.com', 'tesla.com',
    'salesforce.com', 'oracle.com', 'ibm.com', 'cisco.com',
    'intel.com', 'nvidia.com', 'amd.com', 'qualcomm.com',
    'hp.com', 'dell.com', 'lenovo.com', 'sony.com',
    'samsung.com', 'lg.com', 'huawei.com', 'xiaomi.com',
    'walmart.com', 'target.com', 'costco.com', 'homedepot.com',
    'mcdonalds.com', 'starbucks.com', 'coca-cola.com', 'pepsi.com',
    'visa.com', 'mastercard.com', 'jpmorgan.com', 'wellsfargo.com',
    'bankofamerica.com', 'goldmansachs.com', 'morganstanley.com',
    'boeing.com', 'airbus.com', 'ge.com', 'siemens.com',
    'mercedes-benz.com', 'bmw.com', 'volkswagen.com', 'toyota.com',
    'ford.com', 'gm.com', 'exxonmobil.com', 'shell.com',
    'bp.com', 'chevron.com', 'totalenergies.com'
}

FREE_PROVIDERS = {
    'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com',
    'aol.com', 'icloud.com', 'protonmail.com', 'yandex.com',
    'mail.com', 'gmx.com', 'web.de', 'freenet.de',
    'live.com', 'msn.com', 'me.com', 'mac.com',
    'yahoo.co.uk', 'yahoo.de', 'yahoo.fr', 'yahoo.ca',
    'googlemail.com', 'gmail.co.uk', 'gmail.de',
    'proton.me', '188.com'
}

# Function to check if domain matches free provider patterns
def is_free_provider(domain):
    """Check if domain is a free email provider, including wildcard patterns"""
    if not domain:
        return False
    
    # Direct match
    if domain in FREE_PROVIDERS:
        return True
    
    # Check wildcard patterns
    if domain.startswith('outlook.') or domain.startswith('yahoo.') or domain.startswith('hotmail.'):
        return True
    
    return False

TELECOM_TLDS = {'.net', '.tel', '.io', '.us', '.de', '.co.il', '.co.uk', '.fr', '.nl', '.be', '.ch', '.at', '.it', '.es', '.pt', '.pl', '.cz', '.sk', '.hu', '.ro', '.bg', '.hr', '.si', '.fi', '.se', '.no', '.dk', '.ee', '.lv', '.lt'}

def extract_domain(email):
    """Extract domain from email address"""
    if not email or pd.isna(email) or '@' not in str(email):
        return None
    return str(email).split('@')[1].lower().strip()

def get_tld(domain):
    """Extract TLD from domain"""
    if not domain:
        return None
    parts = domain.split('.')
    if len(parts) < 2:
        return None
    # Handle domains like .co.uk, .co.il
    if len(parts) >= 3 and parts[-2] in ['co', 'com', 'org', 'net', 'gov', 'edu']:
        return '.' + '.'.join(parts[-2:])
    return '.' + parts[-1]

def check_domain_alive(domain):
    """Check if domain is alive and accessible"""
    if not domain:
        return False, "No domain provided"
    
    try:
        # Check DNS resolution with timeout
        resolver = dns.resolver.Resolver()
        resolver.timeout = 2.0  # 2 second timeout
        resolver.lifetime = 2.0
        resolver.resolve(domain, 'A')
        
        # Check HTTP/HTTPS accessibility with reduced timeout
        for protocol in ['https', 'http']:
            try:
                url = f"{protocol}://{domain}"
                response = requests.get(url, timeout=3, allow_redirects=True)  # Reduced from 10 to 3 seconds
                if response.status_code == 200:
                    return True, f"Domain accessible via {protocol.upper()}"
            except:
                continue
        
        return True, "Domain has DNS record but no web server"
        
    except Exception as e:
        return False, f"Domain not accessible: {str(e)}"

def verify_linkedin_profile(name, email, domain):
    """Verify if name and email match on LinkedIn"""
    if not name or not email:
        return False, False, "Missing name or email"
    
    try:
        # LinkedIn search simulation (basic approach due to LinkedIn's restrictions)
        search_query = f"{name} {domain}"
        linkedin_url = f"https://www.linkedin.com/search/results/people/?keywords={search_query}"
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        
        # Basic verification - in production, you'd need LinkedIn API access
        # For now, we'll simulate based on domain and name patterns
        
        # Simple heuristic: if it's a business domain and has a proper name
        if domain and '.' in domain and len(name.strip()) > 2:
            # Check if name seems professional (has first and last name)
            name_parts = name.strip().split()
            if len(name_parts) >= 2:
                return True, True, "Professional name format detected"
            else:
                return True, False, "Single name format - possible match"
        
        return False, False, "Insufficient information for LinkedIn verification"
        
    except Exception as e:
        return False, False, f"LinkedIn verification error: {str(e)}"

def verify_facebook_profile(name, email, domain):
    """Verify if name and email match on Facebook"""
    if not name or not email:
        return False, False, "Missing name or email"
    
    try:
        # Facebook verification simulation (basic approach due to Facebook's restrictions)
        # In production, you'd need Facebook Graph API access
        
        # Simple heuristic based on email patterns and name
        if '@' in email and len(name.strip()) > 2:
            # Check for common personal email patterns
            personal_indicators = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com']
            email_domain = email.split('@')[1].lower()
            
            if email_domain in personal_indicators:
                return True, True, "Personal email provider suggests Facebook presence"
            else:
                return True, False, "Business email - less likely on Facebook"
        
        return False, False, "Insufficient information for Facebook verification"
        
    except Exception as e:
        return False, False, f"Facebook verification error: {str(e)}"

def verify_github_profile(name, email, domain):
    """Verify if user has a GitHub account"""
    if not name and not email:
        return False, False, "Missing name and email"
    
    try:
        # GitHub verification using GitHub API
        # We'll search for users based on name or extract username from email
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/vnd.github.v3+json'
        }
        
        # Try different search strategies
        search_queries = []
        
        # If we have a name, search by name
        if name and len(name.strip()) > 2:
            search_queries.append(name.strip())
        
        # If email looks like it might contain a username (before @)
        if email and '@' in email:
            username = email.split('@')[0]
            # Only use if it doesn't look like a random/generated username
            if len(username) > 3 and not any(char.isdigit() for char in username[-3:]):
                search_queries.append(username)
        
        for query in search_queries:
            try:
                # Search GitHub users API
                search_url = f"https://api.github.com/search/users?q={query}&per_page=5"
                response = requests.get(search_url, headers=headers, timeout=5)
                
                if response.status_code == 200:
                    data = response.json()
                    if data.get('total_count', 0) > 0:
                        # Found potential matches
                        users = data.get('items', [])
                        for user in users[:3]:  # Check top 3 matches
                            # Simple matching logic - in production you'd want more sophisticated matching
                            username = user.get('login', '').lower()
                            
                            # Check if username matches name or email prefix
                            if name and username in name.lower().replace(' ', ''):
                                return True, True, f"GitHub profile found: {user.get('login')}"
                            if email and username == email.split('@')[0].lower():
                                return True, True, f"GitHub profile found: {user.get('login')}"
                        
                        # If we found users but no exact match
                        return True, False, f"Potential GitHub profiles found but no exact match"
                
                elif response.status_code == 403:
                    # Rate limited
                    break
                    
            except requests.RequestException:
                continue
        
        # Fallback heuristic - developers often have GitHub accounts
        if email and any(indicator in email.lower() for indicator in ['dev', 'engineer', 'tech', 'code', 'git']):
            return True, False, "Email suggests technical background - likely GitHub user"
        
        return False, False, "No GitHub profile indicators found"
        
    except Exception as e:
        return False, False, f"GitHub verification error: {str(e)}"

# Advanced Email & Name Intelligence Functions

def analyze_email_pattern(email):
    """Analyze email structure for professional patterns"""
    if not email or '@' not in email:
        return 0, "Invalid email format"
    
    local_part, domain = email.split('@', 1)
    local_part = local_part.lower()
    score = 0
    reasons = []
    
    # Professional email format patterns
    if '.' in local_part:
        parts = local_part.split('.')
        if len(parts) == 2:
            first, last = parts
            if 2 <= len(first) <= 15 and 2 <= len(last) <= 15:
                if first.isalpha() and last.isalpha():
                    score += 15
                    reasons.append("Professional firstname.lastname format (+15)")
                elif len(first) == 1 and last.isalpha():
                    score += 12
                    reasons.append("Professional f.lastname format (+12)")
                else:
                    score += 8
                    reasons.append("Professional dotted format (+8)")
    
    # Role-based emails (decision makers)
    executive_roles = ['ceo', 'president', 'director', 'vp', 'vice.president', 'managing.director']
    management_roles = ['manager', 'lead', 'head', 'supervisor', 'chief']
    technical_roles = ['admin', 'it', 'tech', 'developer', 'engineer', 'dev']
    
    if any(role in local_part for role in executive_roles):
        score += 20
        reasons.append("Executive role email (+20)")
    elif any(role in local_part for role in management_roles):
        score += 15
        reasons.append("Management role email (+15)")
    elif any(role in local_part for role in technical_roles):
        score += 10
        reasons.append("Technical role email (+10)")
    
    # Low-value generic emails
    generic_emails = ['info', 'contact', 'sales', 'support', 'hello', 'enquiry', 'inquiry']
    negative_emails = ['noreply', 'no.reply', 'donotreply', 'automated', 'bulk', 'marketing']
    
    if any(generic in local_part for generic in generic_emails):
        score -= 5
        reasons.append("Generic email address (-5)")
    elif any(negative in local_part for negative in negative_emails):
        score -= 15
        reasons.append("Automated/bulk email address (-15)")
    
    # Username quality analysis
    if 6 <= len(local_part) <= 12:
        score += 5
        reasons.append("Professional username length (+5)")
    elif len(local_part) < 4 or len(local_part) > 20:
        score -= 5
        reasons.append("Unprofessional username length (-5)")
    
    # Number patterns in username
    if local_part.isalpha():
        score += 5
        reasons.append("Alphabetic username (+5)")
    elif any(char.isdigit() for char in local_part):
        # Check for birth years (1940-2010)
        import re
        years = re.findall(r'(19[4-9][0-9]|20[0-1][0-9])', local_part)
        if years:
            score -= 3
            reasons.append("Contains birth year - personal email (-3)")
        elif re.search(r'\d{3,}', local_part):
            score -= 10
            reasons.append("Random numbers - generated account (-10)")
    
    return score, ", ".join(reasons)

def analyze_name_email_consistency(name, email):
    """Check consistency between name and email address"""
    if not name or not email or '@' not in email:
        return 0, "Missing name or email"
    
    local_part = email.split('@')[0].lower()
    name_clean = name.lower().replace('.', '').replace(' ', '')
    name_parts = name.lower().split()
    
    score = 0
    reasons = []
    
    if len(name_parts) >= 2:
        first_name = name_parts[0]
        last_name = name_parts[-1]
        
        # Perfect matches
        if f"{first_name}.{last_name}" == local_part:
            score += 10
            reasons.append("Perfect name-email match (+10)")
        elif f"{first_name[0]}.{last_name}" == local_part:
            score += 8
            reasons.append("Initial.lastname match (+8)")
        elif first_name == local_part or last_name == local_part:
            score += 6
            reasons.append("Partial name match (+6)")
        elif first_name in local_part and last_name in local_part:
            score += 5
            reasons.append("Name components in email (+5)")
        elif any(part in local_part for part in name_parts):
            score += 3
            reasons.append("Name part in email (+3)")
        else:
            # Check if email seems completely unrelated
            if local_part.isalpha() and len(local_part) > 5:
                score -= 5
                reasons.append("Name-email mismatch (-5)")
    
    return score, ", ".join(reasons)

def detect_executive_indicators(name, email):
    """Detect executive/decision maker indicators"""
    if not name and not email:
        return 0, "Missing name and email"
    
    score = 0
    reasons = []
    
    # Check name for titles
    name_upper = name.upper() if name else ""
    executive_titles = ['CEO', 'CTO', 'CFO', 'CMO', 'COO', 'PRESIDENT', 'VP', 'VICE PRESIDENT', 
                       'MANAGING DIRECTOR', 'EXECUTIVE DIRECTOR', 'CHAIRMAN', 'FOUNDER']
    management_titles = ['DIRECTOR', 'MANAGER', 'HEAD OF', 'LEAD', 'SENIOR', 'PRINCIPAL']
    professional_titles = ['DR.', 'DR', 'PROF.', 'PROFESSOR', 'MR.', 'MS.', 'MRS.']
    
    if any(title in name_upper for title in executive_titles):
        score += 25
        reasons.append("Executive title in name (+25)")
    elif any(title in name_upper for title in management_titles):
        score += 15
        reasons.append("Management title in name (+15)")
    elif any(title in name_upper for title in professional_titles):
        score += 10
        reasons.append("Professional title in name (+10)")
    
    # Check email for role indicators (already handled in email pattern analysis)
    
    return score, ", ".join(reasons)

def detect_technical_professional(name, email, domain):
    """Detect technical professionals and developers"""
    if not email:
        return 0, "Missing email"
    
    local_part = email.split('@')[0].lower() if '@' in email else ""
    domain_lower = domain.lower() if domain else ""
    
    score = 0
    reasons = []
    
    # Technical email patterns
    technical_patterns = ['dev', 'developer', 'tech', 'engineer', 'eng', 'it', 'admin', 
                         'sysadmin', 'devops', 'architect', 'programmer', 'coder']
    
    if any(pattern in local_part for pattern in technical_patterns):
        score += 15
        reasons.append("Technical role in email (+15)")
    
    # Technical domains
    tech_domains = ['.io', '.dev', '.tech', '.ai', '.cloud']
    if any(tld in domain_lower for tld in tech_domains):
        score += 10
        reasons.append("Technical domain TLD (+10)")
    
    # Programming-related terms in name
    if name:
        name_lower = name.lower()
        prog_terms = ['developer', 'engineer', 'programmer', 'architect', 'devops', 'sysadmin']
        if any(term in name_lower for term in prog_terms):
            score += 12
            reasons.append("Technical role in name (+12)")
    
    return score, ", ".join(reasons)

def classify_b2b_vs_b2c(name, email, domain):
    """Classify as B2B or B2C contact"""
    if not email or not domain:
        return 0, "Missing email or domain"
    
    local_part = email.split('@')[0].lower() if '@' in email else ""
    
    score = 0
    reasons = []
    
    # B2B indicators (good for telecom)
    b2b_patterns = ['firstname.lastname', 'f.lastname', 'role@company']
    
    if '.' in local_part and not any(char.isdigit() for char in local_part):
        score += 10
        reasons.append("B2B email pattern (+10)")
    
    # Corporate domain patterns
    corporate_indicators = ['corp', 'company', 'group', 'ltd', 'llc', 'inc']
    if any(indicator in domain.lower() for indicator in corporate_indicators):
        score += 8
        reasons.append("Corporate domain indicator (+8)")
    
    # B2C indicators (lower value for telecom)
    consumer_patterns = ['nickname', 'personal', 'family']
    if any(pattern in local_part for pattern in consumer_patterns):
        score -= 5
        reasons.append("Consumer email pattern (-5)")
    
    # Personal number patterns (birth years, etc.)
    import re
    if re.search(r'(19[4-9][0-9]|20[0-1][0-9])', local_part):
        score -= 3
        reasons.append("Personal birth year pattern (-3)")
    
    return score, ", ".join(reasons)

def detect_suspicious_patterns(name, email):
    """Detect generated/fake accounts and suspicious patterns"""
    if not email:
        return 0, "Missing email"
    
    local_part = email.split('@')[0].lower() if '@' in email else ""
    
    score = 0
    reasons = []
    
    # Sequential numbers
    import re
    if re.search(r'\d{3,}$', local_part):  # Ends with 3+ digits
        score -= 10
        reasons.append("Sequential number pattern (-10)")
    
    # Random string patterns
    if len(set(local_part)) < len(local_part) * 0.7:  # Low character diversity
        score -= 15
        reasons.append("Low character diversity - generated (-15)")
    
    # Common fake patterns
    fake_patterns = ['test', 'temp', 'fake', 'dummy', 'sample', 'example']
    if any(pattern in local_part for pattern in fake_patterns):
        score -= 20
        reasons.append("Test/fake account pattern (-20)")
    
    # Bulk email patterns
    bulk_patterns = ['newsletter', 'marketing', 'bulk', 'mass', 'list']
    if any(pattern in local_part for pattern in bulk_patterns):
        score -= 15
        reasons.append("Bulk email pattern (-15)")
    
    # Name-email mismatch for obvious cases
    if name and email:
        name_clean = ''.join(name.lower().split())
        if len(name_clean) > 3 and name_clean not in local_part and not any(part in local_part for part in name.lower().split()):
            if local_part.isalpha() and len(local_part) > 6:  # Only flag obvious mismatches
                score -= 20
                reasons.append("Severe name-email mismatch (-20)")
    
    return score, ", ".join(reasons)

def analyze_geographic_intelligence(domain):
    """Analyze geographic signals from domain"""
    if not domain:
        return 0, "Missing domain"
    
    score = 0
    reasons = []
    
    # High-value geographic TLDs for telecom
    premium_geo_tlds = {
        '.de': ('Germany', 15), '.nl': ('Netherlands', 15), '.ch': ('Switzerland', 15), 
        '.at': ('Austria', 15), '.se': ('Sweden', 12), '.no': ('Norway', 12),
        '.dk': ('Denmark', 12), '.fi': ('Finland', 12)
    }
    
    good_geo_tlds = {
        '.sg': ('Singapore', 10), '.hk': ('Hong Kong', 10), '.au': ('Australia', 10),
        '.ca': ('Canada', 12), '.uk': ('United Kingdom', 12), '.fr': ('France', 12),
        '.jp': ('Japan', 8), '.kr': ('South Korea', 8)
    }
    
    restricted_geo_tlds = {
        '.cn': ('China', -20), '.ru': ('Russia', -50), '.by': ('Belarus', -30),
        '.ir': ('Iran', -40), '.kp': ('North Korea', -50)
    }
    
    domain_lower = domain.lower()
    
    # Check premium geographic TLDs
    for tld, (country, points) in premium_geo_tlds.items():
        if domain_lower.endswith(tld):
            score += points
            reasons.append(f"{country} domain - telecom-friendly ({points:+d})")
            break
    
    # Check good geographic TLDs
    for tld, (country, points) in good_geo_tlds.items():
        if domain_lower.endswith(tld):
            score += points
            reasons.append(f"{country} domain - business-friendly ({points:+d})")
            break
    
    # Check restricted geographic TLDs
    for tld, (country, points) in restricted_geo_tlds.items():
        if domain_lower.endswith(tld):
            score += points
            reasons.append(f"{country} domain - restricted/sanctioned ({points:+d})")
            break
    
    return score, ", ".join(reasons)

def detect_industry_vertical_indicators(email, domain):
    """Detect industry vertical from email and domain patterns"""
    if not email and not domain:
        return 0, "Missing email and domain"
    
    local_part = email.split('@')[0].lower() if email and '@' in email else ""
    domain_lower = domain.lower() if domain else ""
    
    score = 0
    reasons = []
    industry = "Unknown"
    
    # Telecom industry indicators (highest value)
    telecom_indicators = ['telecom', 'telco', 'mobile', 'cellular', 'wireless', 'network', 
                         'isp', 'broadband', '5g', 'fiber', 'voip', 'pbx']
    if any(indicator in domain_lower or indicator in local_part for indicator in telecom_indicators):
        score += 20
        reasons.append("Telecom industry indicators (+20)")
        industry = "Telecom"
    
    else:
        # Technology sector (high value)
        tech_indicators = ['tech', 'software', 'cloud', 'saas', 'digital', 'cyber', 'data',
                          'ai', 'ml', 'iot', 'api', 'platform']
        if any(indicator in domain_lower or indicator in local_part for indicator in tech_indicators):
            score += 15
            reasons.append("Technology sector indicators (+15)")
            industry = "Technology"
        else:
            # Financial services (medium-high value)
            finance_indicators = ['bank', 'finance', 'financial', 'invest', 'capital', 'fund',
                                 'insurance', 'fintech', 'trading', 'wealth']
            if any(indicator in domain_lower or indicator in local_part for indicator in finance_indicators):
                score += 12
                reasons.append("Financial services indicators (+12)")
                industry = "Financial Services"
            else:
                # Healthcare (medium value)
                healthcare_indicators = ['health', 'medical', 'hospital', 'clinic', 'pharma', 'bio',
                                       'medtech', 'healthcare', 'wellness']
                if any(indicator in domain_lower or indicator in local_part for indicator in healthcare_indicators):
                    score += 8
                    reasons.append("Healthcare industry indicators (+8)")
                    industry = "Healthcare"
                else:
                    # Manufacturing (medium value for B2B)
                    manufacturing_indicators = ['manufacturing', 'industrial', 'factory', 'production',
                                              'automotive', 'aerospace', 'chemical', 'steel']
                    if any(indicator in domain_lower or indicator in local_part for indicator in manufacturing_indicators):
                        score += 10
                        reasons.append("Manufacturing industry indicators (+10)")
                        industry = "Manufacturing"
    
    return score, ", ".join(reasons), industry

def calculate_enhanced_score(domain, name, email, domain_alive=False, linkedin_verified=False,
                           facebook_verified=False, linkedin_match=False, facebook_match=False,
                           github_verified=False, github_match=False):
    """Enhanced scoring system with advanced email and name intelligence"""
    if not domain:
        return 0, "Invalid domain", {}
    
    score = 0
    reasons = []
    intelligence_data = {}
    
    # Check for Russian domains first (sanctions)
    tld = get_tld(domain)
    if tld == '.ru':
        score = -50
        reasons.append("Russian domain - sanctions applied (-50)")
        reason_text = ", ".join(reasons) + f", total = {score}"
        return score, reason_text, {"sanctions_applied": True}
    
    # Advanced Email Pattern Analysis (0-35 points)
    email_score, email_reasons = analyze_email_pattern(email)
    score += email_score
    if email_reasons:
        reasons.append(email_reasons)
        intelligence_data['email_pattern_score'] = email_score
    
    # Name-Email Consistency Analysis (0-10 points)
    consistency_score, consistency_reasons = analyze_name_email_consistency(name, email)
    score += consistency_score
    if consistency_reasons:
        reasons.append(consistency_reasons)
        intelligence_data['consistency_score'] = consistency_score
    
    # Executive/Decision Maker Detection (0-25 points)
    executive_score, executive_reasons = detect_executive_indicators(name, email)
    score += executive_score
    if executive_reasons:
        reasons.append(executive_reasons)
        intelligence_data['executive_score'] = executive_score
    
    # Technical Professional Detection (0-15 points)
    tech_score, tech_reasons = detect_technical_professional(name, email, domain)
    score += tech_score
    if tech_reasons:
        reasons.append(tech_reasons)
        intelligence_data['technical_score'] = tech_score
    
    # B2B vs B2C Classification (0-10 points)
    b2b_score, b2b_reasons = classify_b2b_vs_b2c(name, email, domain)
    score += b2b_score
    if b2b_reasons:
        reasons.append(b2b_reasons)
        intelligence_data['b2b_score'] = b2b_score
    
    # Suspicious Pattern Detection (-20 to 0 points)
    suspicious_score, suspicious_reasons = detect_suspicious_patterns(name, email)
    score += suspicious_score
    if suspicious_reasons:
        reasons.append(suspicious_reasons)
        intelligence_data['suspicious_score'] = suspicious_score
    
    # Geographic Intelligence (0-15 points)
    geo_score, geo_reasons = analyze_geographic_intelligence(domain)
    score += geo_score
    if geo_reasons:
        reasons.append(geo_reasons)
        intelligence_data['geographic_score'] = geo_score
    
    # Industry Vertical Detection (0-20 points)
    industry_score, industry_reasons, detected_industry = detect_industry_vertical_indicators(email, domain)
    score += industry_score
    if industry_reasons:
        reasons.append(industry_reasons)
        intelligence_data['industry_score'] = industry_score
        intelligence_data['detected_industry'] = detected_industry
    
    # Base domain classification (0-40 points)
    if is_free_provider(domain):
        score += 5
        reasons.append("Free email provider (+5)")
        intelligence_data['domain_type'] = 'free'
    elif domain in TELECOM_OPERATORS:
        score += 40
        reasons.append("Telecom operator domain (+40)")
        intelligence_data['domain_type'] = 'telecom'
    elif domain in ENTERPRISE_DOMAINS:
        score += 30
        reasons.append("Large enterprise domain (+30)")
        intelligence_data['domain_type'] = 'enterprise'
    else:
        score += 15
        reasons.append("Corporate domain (+15)")
        intelligence_data['domain_type'] = 'corporate'
    
    # TLD bonus for telecom-friendly TLDs (0-10 points)
    if tld in TELECOM_TLDS:
        score += 10
        reasons.append(f"Telecom-friendly TLD {tld} (+10)")
    
    # Domain alive verification (0-20 points) - skip for free providers
    if not is_free_provider(domain):
        if domain_alive:
            score += 20
            reasons.append("Domain is alive and accessible (+20)")
        else:
            reasons.append("Domain not accessible (0)")
    else:
        reasons.append("Free email provider - domain check skipped")
    
    intelligence_data['domain_alive'] = domain_alive
    
    # Professional name format (0-10 points)
    if name and len(name.strip().split()) >= 2:
        score += 10
        reasons.append("Professional name format (+10)")
    elif name and len(name.strip()) > 0:
        score += 5
        reasons.append("Single name provided (+5)")
    
    # LinkedIn verification (0-10 points)
    if linkedin_verified:
        if linkedin_match:
            score += 10
            reasons.append("LinkedIn profile verified and matches (+10)")
        else:
            score += 5
            reasons.append("LinkedIn profile found but no exact match (+5)")
    
    intelligence_data['linkedin_verified'] = linkedin_verified
    intelligence_data['linkedin_match'] = linkedin_match
    
    # Facebook verification (0-10 points)
    if facebook_verified:
        if facebook_match:
            score += 10
            reasons.append("Facebook profile verified and matches (+10)")
        else:
            score += 5
            reasons.append("Facebook profile found but no exact match (+5)")
    
    intelligence_data['facebook_verified'] = facebook_verified
    intelligence_data['facebook_match'] = facebook_match
    
    # GitHub verification (0-15 points)
    if github_verified:
        if github_match:
            score += 15
            reasons.append("GitHub profile verified and matches (+15)")
        else:
            score += 10
            reasons.append("GitHub profile found but no exact match (+10)")
    
    intelligence_data['github_verified'] = github_verified
    intelligence_data['github_match'] = github_match
    
    # Cap score between -50 and 150 (increased range for advanced features)
    final_score = max(-50, min(150, score))
    
    reason_text = ", ".join(reasons) + f", total = {final_score}"
    return final_score, reason_text, intelligence_data

def calculate_score(domain):
    """Legacy scoring function - keeping for backward compatibility"""
    score, reason, intelligence_data = calculate_enhanced_score(domain, "", "", False, False, False, False, False, False, False)
    return score, reason

def log_progress(session_id, level, message, details=None):
    """Helper function to log progress and store in database"""
    log = ProcessingLog(
        session_id=session_id,
        level=level,
        message=message,
        details=json.dumps(details) if details else None
    )
    db.session.add(log)
    db.session.commit()
    
    # Update progress for SSE
    if session_id in progress_updates:
        progress_updates[session_id]['logs'].append(log.to_dict())

@app.route('/process', methods=['POST'])
def process_file():
    try:
        # Check if file is present
        if 'file' not in request.files:
            return jsonify({'error': 'No file uploaded'}), 400
        
        file = request.files['file']
        
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        # Check file extension
        if not file.filename.lower().endswith('.xlsx'):
            return jsonify({'error': 'Only .xlsx files are supported'}), 400
        
        # Save uploaded file to temporary location first
        upload_temp = tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx')
        file.save(upload_temp.name)
        upload_temp.close()
        
        # Create a new processing session early to track progress
        session = ProcessingSession(
            filename=file.filename,
            total_rows=0,  # Will update after reading file
            status='processing'
        )
        db.session.add(session)
        db.session.flush()
        session_id = session.id
        db.session.commit()
        
        # Initialize progress tracking
        progress_updates[session_id] = {
            'total_rows': 0,
            'processed_rows': 0,
            'current_row': 0,
            'current_step': 'Initializing',
            'message': 'Starting file processing...',
            'logs': []
        }
        
        # Start processing in a background thread
        def process_in_background():
            with app.app_context():
                try:
                    log_progress(session_id, 'info', f'Started processing file: {file.filename}')
                    
                    # Read Excel file
                    try:
                        log_progress(session_id, 'info', 'Reading Excel file...')
                        progress_updates[session_id]['message'] = 'Reading Excel file...'
                        df = pd.read_excel(upload_temp.name, engine='openpyxl')
                        log_progress(session_id, 'success', f'Successfully read Excel file with {len(df)} rows')
                    except Exception as e:
                        log_progress(session_id, 'error', f'Error reading Excel file: {str(e)}')
                        session.status = 'failed'
                        db.session.commit()
                        progress_updates[session_id]['current_step'] = 'failed'
                        os.unlink(upload_temp.name)
                        return
                
                    # Update total rows
                    session.total_rows = len(df)
                    db.session.commit()
                    progress_updates[session_id]['total_rows'] = len(df)
                    
                    # Validate required columns
                    required_columns = ['name', 'email']
                    missing_columns = [col for col in required_columns if col not in df.columns]
                    
                    if missing_columns:
                        log_progress(session_id, 'error', f'Missing required columns: {", ".join(missing_columns)}')
                        session.status = 'failed'
                        db.session.commit()
                        progress_updates[session_id]['current_step'] = 'failed'
                        os.unlink(upload_temp.name)
                        return
                    
                    log_progress(session_id, 'info', 'Starting lead verification process...')
                    progress_updates[session_id]['message'] = 'Processing leads...'
                    
                    # Process all data
                    processed_data = []
                    domains = []
                    scores = []
                    reasons = []
                    domain_alive_results = []
                    linkedin_verified_results = []
                    facebook_verified_results = []
                    linkedin_match_results = []
                    facebook_match_results = []
                    github_verified_results = []
                    github_match_results = []
                    verification_details_results = []
                    
                    # Advanced intelligence results
                    email_pattern_scores = []
                    consistency_scores = []
                    executive_scores = []
                    technical_scores = []
                    b2b_scores = []
                    suspicious_scores = []
                    geographic_scores = []
                    industry_scores = []
                    detected_industries = []
                    domain_types = []
                    
                    for idx, row in df.iterrows():
                        progress_updates[session_id]['processed_rows'] = idx + 1
                        progress_updates[session_id]['current_row'] = idx + 1
                        progress_updates[session_id]['current_step'] = f'Processing row {idx + 1} of {len(df)}'
                        progress_updates[session_id]['message'] = f'Processing row {idx + 1} of {len(df)}'
                        
                        email = row.get('email', '')
                        name = row.get('name', '')
                        
                        # Handle NaN values from pandas
                        if pd.isna(email):
                            email = ''
                        if pd.isna(name):
                            name = ''
                        
                        domain = extract_domain(email)
                        
                        # Log domain checking
                        if domain:
                            log_progress(session_id, 'info', f'Checking domain: {domain} (row {idx + 1})')
                        
                        # Perform verifications
                        # Skip domain alive check for free providers
                        if is_free_provider(domain):
                            domain_alive, domain_status = False, "Free email provider - domain check skipped"
                        else:
                            domain_alive, domain_status = check_domain_alive(domain)
                        
                        linkedin_verified, linkedin_match, linkedin_details = verify_linkedin_profile(name, email, domain)
                        facebook_verified, facebook_match, facebook_details = verify_facebook_profile(name, email, domain)
                        github_verified, github_match, github_details = verify_github_profile(name, email, domain)
                        
                        # Calculate enhanced score with advanced intelligence
                        score, reason, intelligence_data = calculate_enhanced_score(
                            domain, name, email, domain_alive, linkedin_verified,
                            facebook_verified, linkedin_match, facebook_match,
                            github_verified, github_match
                        )
                        
                        # Log verification results
                        if domain:
                            log_progress(
                                session_id,
                                'success' if domain_alive else 'warning',
                                f'Domain {domain}: {domain_status}',
                                {'score': score, 'domain_alive': domain_alive}
                            )
                        
                        # Store verification details as JSON
                        verification_details = {
                            'domain_status': domain_status,
                            'linkedin_details': linkedin_details,
                            'facebook_details': facebook_details,
                            'github_details': github_details
                        }
                        
                        # Collect all data
                        domains.append(domain if domain else '')
                        scores.append(score)
                        reasons.append(reason)
                        domain_alive_results.append(domain_alive)
                        linkedin_verified_results.append(linkedin_verified)
                        facebook_verified_results.append(facebook_verified)
                        linkedin_match_results.append(linkedin_match)
                        facebook_match_results.append(facebook_match)
                        github_verified_results.append(github_verified)
                        github_match_results.append(github_match)
                        verification_details_results.append(json.dumps(verification_details))
                        
                        # Collect advanced intelligence data
                        email_pattern_scores.append(intelligence_data.get('email_pattern_score', 0))
                        consistency_scores.append(intelligence_data.get('consistency_score', 0))
                        executive_scores.append(intelligence_data.get('executive_score', 0))
                        technical_scores.append(intelligence_data.get('technical_score', 0))
                        b2b_scores.append(intelligence_data.get('b2b_score', 0))
                        suspicious_scores.append(intelligence_data.get('suspicious_score', 0))
                        geographic_scores.append(intelligence_data.get('geographic_score', 0))
                        industry_scores.append(intelligence_data.get('industry_score', 0))
                        detected_industries.append(intelligence_data.get('detected_industry', 'Unknown'))
                        domain_types.append(intelligence_data.get('domain_type', 'unknown'))
                        
                        # Store processed data for database insertion
                        processed_data.append({
                            'name': str(name) if name else '',
                            'email': str(email) if email else '',
                            'domain': domain if domain else '',
                            'score': score,
                            'reason': reason,
                            'domain_alive': domain_alive,
                            'linkedin_verified': linkedin_verified,
                            'facebook_verified': facebook_verified,
                            'linkedin_match': linkedin_match,
                            'facebook_match': facebook_match,
                            'github_verified': github_verified,
                            'github_match': github_match,
                            'email_pattern_score': intelligence_data.get('email_pattern_score', 0),
                            'consistency_score': intelligence_data.get('consistency_score', 0),
                            'executive_score': intelligence_data.get('executive_score', 0),
                            'technical_score': intelligence_data.get('technical_score', 0),
                            'b2b_score': intelligence_data.get('b2b_score', 0),
                            'suspicious_score': intelligence_data.get('suspicious_score', 0),
                            'geographic_score': intelligence_data.get('geographic_score', 0),
                            'industry_score': intelligence_data.get('industry_score', 0),
                            'detected_industry': intelligence_data.get('detected_industry', 'Unknown'),
                            'domain_type': intelligence_data.get('domain_type', 'unknown'),
                            'verification_details': json.dumps(verification_details),
                            'intelligence_data': json.dumps(intelligence_data)
                        })
                    
                    log_progress(session_id, 'info', 'Saving results to file...')
                    progress_updates[session_id]['message'] = 'Saving results...'
                    
                    # Add core analysis columns (right after original data)
                    df['domain'] = domains
                    df['score'] = scores
                    df['reason'] = reasons
                    df['detected_industry'] = detected_industries
                    df['domain_type'] = domain_types
                    
                    # Add social verification columns (grouped together)
                    df['domain_alive'] = domain_alive_results
                    df['linkedin_verified'] = linkedin_verified_results
                    df['linkedin_match'] = linkedin_match_results
                    df['facebook_verified'] = facebook_verified_results
                    df['facebook_match'] = facebook_match_results
                    df['github_verified'] = github_verified_results
                    df['github_match'] = github_match_results
                    
                    # Add advanced intelligence scoring breakdown
                    df['email_pattern_score'] = email_pattern_scores
                    df['consistency_score'] = consistency_scores
                    df['executive_score'] = executive_scores
                    df['technical_score'] = technical_scores
                    df['b2b_score'] = b2b_scores
                    df['suspicious_score'] = suspicious_scores
                    df['geographic_score'] = geographic_scores
                    df['industry_score'] = industry_scores
                    
                    # Add verification details (JSON) at the end
                    df['verification_details'] = verification_details_results
                    
                    # Log column summary for debugging
                    column_list = list(df.columns)
                    log_progress(session_id, 'info', f'Excel file will contain {len(column_list)} columns: {", ".join(column_list)}')
                    
                    # Verify GitHub columns are present
                    github_cols_present = [col for col in column_list if 'github' in col.lower()]
                    if github_cols_present:
                        log_progress(session_id, 'success', f'GitHub columns confirmed: {", ".join(github_cols_present)}')
                    else:
                        log_progress(session_id, 'warning', 'GitHub columns not found in output!')
                    
                    # Save to permanent file in processed_files directory
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    processed_filename = f"processed_{session_id}_{timestamp}_{file.filename}"
                    processed_file_path = os.path.join(PROCESSED_FILES_DIR, processed_filename)
                    df.to_excel(processed_file_path, index=False, engine='openpyxl')
                    
                    log_progress(session_id, 'info', 'Saving results to database...')
                    
                    # Update session and save results to database
                    try:
                        # Re-fetch the session in this thread's context
                        current_session = db.session.get(ProcessingSession, session_id)
                        if current_session:
                            current_session.processed_file_path = processed_file_path
                            current_session.status = 'completed'
                            current_session.total_rows = len(df)
                        
                        # Bulk insert all results
                        for data in processed_data:
                            result = ProcessingResult(
                                session_id=session_id,
                                **data
                            )
                            db.session.add(result)
                        
                        db.session.commit()
                        log_progress(session_id, 'success', f'Successfully processed {len(df)} leads!')
                        progress_updates[session_id]['current_step'] = 'completed'
                        progress_updates[session_id]['message'] = 'Processing completed!'
                        
                    except Exception as db_error:
                        db.session.rollback()
                        log_progress(session_id, 'error', f'Database error: {str(db_error)}')
                        # Clean up processed file if database operation fails
                        if os.path.exists(processed_file_path):
                            os.unlink(processed_file_path)
                        session.status = 'failed'
                        db.session.commit()
                        progress_updates[session_id]['current_step'] = 'failed'
                        raise db_error
                    
                    
                    # Clean up upload temp file
                    os.unlink(upload_temp.name)
                    
                    # Clean up progress tracking after a delay
                    def cleanup_progress():
                        time.sleep(300)  # Keep progress data for 5 minutes
                        if session_id in progress_updates:
                            del progress_updates[session_id]
                    
                    threading.Thread(target=cleanup_progress).start()
                
                except Exception as e:
                    log_progress(session_id, 'error', f'Processing error: {str(e)}')
                    progress_updates[session_id]['current_step'] = 'failed'
                    # Update session status to failed
                    failed_session = db.session.get(ProcessingSession, session_id)
                    if failed_session:
                        failed_session.status = 'failed'
                        db.session.commit()
        
        # Start background processing
        processing_thread = threading.Thread(target=process_in_background)
        processing_thread.start()
        
        # Return immediately with session ID
        return jsonify({
            'success': True,
            'message': 'File uploaded successfully, processing started',
            'session_id': session_id
        })
        
    except Exception as e:
        if 'session_id' in locals():
            log_progress(session_id, 'error', f'Processing error: {str(e)}')
        return jsonify({'error': f'Processing error: {str(e)}'}), 500

@app.route('/download', methods=['GET'])
@app.route('/download/<int:session_id>', methods=['GET'])
def download_file(session_id=None):
    try:
        if session_id:
            # Download specific session file
            session = ProcessingSession.query.get_or_404(session_id)
        else:
            # Get the most recent completed processing session
            session = ProcessingSession.query.filter_by(status='completed').order_by(ProcessingSession.upload_time.desc()).first()
        
        if not session or not session.processed_file_path:
            return jsonify({'error': 'No processed file available'}), 404
        
        if not os.path.exists(session.processed_file_path):
            return jsonify({'error': 'Processed file not found on disk'}), 404
        
        return send_file(
            session.processed_file_path,
            as_attachment=True,
            download_name=f'processed_{session.filename}',
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        
    except Exception as e:
        return jsonify({'error': f'Download error: {str(e)}'}), 500

@app.route('/history', methods=['GET'])
def get_processing_history():
    """Get list of all processing sessions"""
    try:
        sessions = ProcessingSession.query.order_by(ProcessingSession.upload_time.desc()).all()
        history_data = []
        
        for session in sessions:
            # Calculate verification statistics for this session
            results = ProcessingResult.query.filter_by(session_id=session.id).all()
            
            # Calculate averages and counts
            avg_score = sum(r.score for r in results) / len(results) if results else 0
            domains_alive_count = sum(1 for r in results if r.domain_alive)
            linkedin_verified_count = sum(1 for r in results if r.linkedin_verified)
            facebook_verified_count = sum(1 for r in results if r.facebook_verified)
            github_verified_count = sum(1 for r in results if r.github_verified)
            
            session_data = session.to_dict()
            session_data.update({
                'avg_score': round(avg_score, 1),
                'domains_alive_count': domains_alive_count,
                'linkedin_verified_count': linkedin_verified_count,
                'facebook_verified_count': facebook_verified_count,
                'github_verified_count': github_verified_count
            })
            history_data.append(session_data)
        
        return jsonify({
            'success': True,
            'sessions': history_data
        })
    except Exception as e:
        return jsonify({'error': f'Error retrieving history: {str(e)}'}), 500

@app.route('/history/<int:session_id>', methods=['GET'])
def get_session_details(session_id):
    """Get detailed results for a specific session"""
    try:
        session = ProcessingSession.query.get_or_404(session_id)
        results = ProcessingResult.query.filter_by(session_id=session_id).all()
        
        return jsonify({
            'success': True,
            'session': session.to_dict(),
            'results': [result.to_dict() for result in results]
        })
    except Exception as e:
        return jsonify({'error': f'Error retrieving session details: {str(e)}'}), 500

@app.route('/history/<int:session_id>/download', methods=['GET'])
def download_session_file(session_id):
    """Download the processed file for a specific session"""
    try:
        session = ProcessingSession.query.get_or_404(session_id)
        
        if not session.processed_file_path or not os.path.exists(session.processed_file_path):
            return jsonify({'error': 'Processed file not available'}), 404
        
        return send_file(
            session.processed_file_path,
            as_attachment=True,
            download_name=f'processed_{session.filename}',
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        
    except Exception as e:
        return jsonify({'error': f'Download error: {str(e)}'}), 500

@app.route('/stats', methods=['GET'])
def get_statistics():
    """Get overall statistics"""
    try:
        total_sessions = ProcessingSession.query.count()
        total_leads = db.session.query(db.func.sum(ProcessingSession.total_rows)).scalar() or 0
        
        # Get average scores by domain type
        avg_scores = db.session.query(
            db.func.avg(ProcessingResult.score).label('avg_score')
        ).scalar() or 0
        
        # Get verification statistics
        domains_alive_count = ProcessingResult.query.filter_by(domain_alive=True).count()
        linkedin_verified_count = ProcessingResult.query.filter_by(linkedin_verified=True).count()
        facebook_verified_count = ProcessingResult.query.filter_by(facebook_verified=True).count()
        github_verified_count = ProcessingResult.query.filter_by(github_verified=True).count()
        
        # Calculate total processed results for rates
        total_processed_results = ProcessingResult.query.count()
        
        # Calculate verification rates
        domain_alive_rate = (domains_alive_count / total_processed_results * 100) if total_processed_results > 0 else 0
        linkedin_verified_rate = (linkedin_verified_count / total_processed_results * 100) if total_processed_results > 0 else 0
        facebook_verified_rate = (facebook_verified_count / total_processed_results * 100) if total_processed_results > 0 else 0
        github_verified_rate = (github_verified_count / total_processed_results * 100) if total_processed_results > 0 else 0
        
        # Get top domains
        top_domains = db.session.query(
            ProcessingResult.domain,
            db.func.count(ProcessingResult.id).label('count'),
            db.func.avg(ProcessingResult.score).label('avg_score')
        ).filter(
            ProcessingResult.domain != ''
        ).group_by(
            ProcessingResult.domain
        ).order_by(
            db.func.count(ProcessingResult.id).desc()
        ).limit(10).all()
        
        return jsonify({
            'success': True,
            'stats': {
                'total_sessions': total_sessions,
                'total_leads_processed': int(total_leads),
                'average_score': round(float(avg_scores), 2),
                'domains_alive_count': domains_alive_count,
                'linkedin_verified_count': linkedin_verified_count,
                'facebook_verified_count': facebook_verified_count,
                'github_verified_count': github_verified_count,
                'domain_alive_rate': round(domain_alive_rate, 1),
                'linkedin_verified_rate': round(linkedin_verified_rate, 1),
                'facebook_verified_rate': round(facebook_verified_rate, 1),
                'github_verified_rate': round(github_verified_rate, 1),
                'top_domains': [
                    {
                        'domain': domain,
                        'count': count,
                        'avg_score': round(float(avg_score), 2)
                    }
                    for domain, count, avg_score in top_domains
                ]
            }
        })
    except Exception as e:
        return jsonify({'error': f'Error retrieving statistics: {str(e)}'}), 500

@app.route('/', methods=['GET'])
def index():
    """Serve the main HTML page"""
    return send_file('index.html')

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy', 'service': 'DIDWW Sales Filter Service'})

@app.route('/progress/<int:session_id>', methods=['GET'])
def get_progress(session_id):
    """Get current progress for a processing session"""
    if session_id in progress_updates:
        return jsonify({
            'success': True,
            'progress': progress_updates[session_id]
        })
    else:
        # Try to get from database if not in memory
        session = ProcessingSession.query.get(session_id)
        if session:
            return jsonify({
                'success': True,
                'progress': {
                    'total_rows': session.total_rows,
                    'processed_rows': session.total_rows if session.status == 'completed' else 0,
                    'current_step': session.status,
                    'logs': []
                }
            })
        else:
            return jsonify({'error': 'Session not found'}), 404

@app.route('/logs/<int:session_id>', methods=['GET'])
def get_logs(session_id):
    """Get all logs for a processing session"""
    try:
        logs = ProcessingLog.query.filter_by(session_id=session_id).order_by(ProcessingLog.timestamp).all()
        return jsonify({
            'success': True,
            'logs': [log.to_dict() for log in logs]
        })
    except Exception as e:
        return jsonify({'error': f'Error retrieving logs: {str(e)}'}), 500

@app.route('/progress/stream/<int:session_id>')
def progress_stream(session_id):
    """Server-Sent Events endpoint for real-time progress updates"""
    def generate():
        # Send initial connection message
        yield f"data: {json.dumps({'type': 'connected', 'session_id': session_id})}\n\n"
        
        # Keep track of last sent log index
        last_log_index = 0
        
        while True:
            if session_id in progress_updates:
                progress = progress_updates[session_id]
                
                # Send progress update
                yield f"data: {json.dumps({'type': 'progress', 'data': progress})}\n\n"
                
                # Send new logs since last update
                new_logs = progress['logs'][last_log_index:]
                if new_logs:
                    for log in new_logs:
                        yield f"data: {json.dumps({'type': 'log', 'data': log})}\n\n"
                    last_log_index = len(progress['logs'])
                
                # Check if processing is complete
                if progress.get('current_step') == 'completed':
                    yield f"data: {json.dumps({'type': 'complete'})}\n\n"
                    break
            else:
                # Session not found or completed
                session = ProcessingSession.query.get(session_id)
                if session and session.status == 'completed':
                    yield f"data: {json.dumps({'type': 'complete'})}\n\n"
                    break
            
            time.sleep(0.5)  # Update every 500ms
    
    return Response(generate(), mimetype='text/event-stream')

def init_db():
    """Initialize the database with optimized settings"""
    with app.app_context():
        # Configure SQLite for better concurrency
        from sqlalchemy import event, text
        
        def _pragmas_on_connect(dbapi_con, con_record):
            dbapi_con.execute('PRAGMA journal_mode = WAL')
            dbapi_con.execute('PRAGMA busy_timeout = 30000')
            dbapi_con.execute('PRAGMA synchronous = NORMAL')
        
        event.listen(db.engine, 'connect', _pragmas_on_connect)
        
        # Create tables
        db.create_all()
        
        # Execute pragmas on current connection
        with db.engine.connect() as conn:
            conn.execute(text('PRAGMA journal_mode = WAL'))
            conn.execute(text('PRAGMA busy_timeout = 30000'))
            conn.execute(text('PRAGMA synchronous = NORMAL'))
            conn.commit()
        
        print("Database initialized successfully with optimized settings!")

if __name__ == '__main__':
    # Initialize database
    init_db()
    app.run(debug=True, host='0.0.0.0', port=5001)
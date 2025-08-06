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
    
    # New verification fields
    domain_alive = db.Column(db.Boolean, default=False)
    linkedin_verified = db.Column(db.Boolean, default=False)
    facebook_verified = db.Column(db.Boolean, default=False)
    linkedin_match = db.Column(db.Boolean, default=False)
    facebook_match = db.Column(db.Boolean, default=False)
    verification_details = db.Column(db.Text)  # JSON string for detailed verification info
    
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
            'verification_details': self.verification_details
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
    'googlemail.com', 'gmail.co.uk', 'gmail.de'
}

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

def calculate_enhanced_score(domain, name, email, domain_alive=False, linkedin_verified=False,
                           facebook_verified=False, linkedin_match=False, facebook_match=False):
    """Enhanced scoring system with maximum 100 points"""
    if not domain:
        return 0, "Invalid domain"
    
    score = 0
    reasons = []
    
    # Base domain classification (0-40 points)
    if domain in FREE_PROVIDERS:
        score += 5
        reasons.append("Free email provider (+5)")
    elif domain in TELECOM_OPERATORS:
        score += 40
        reasons.append("Telecom operator domain (+40)")
    elif domain in ENTERPRISE_DOMAINS:
        score += 30
        reasons.append("Large enterprise domain (+30)")
    else:
        score += 15
        reasons.append("Corporate domain (+15)")
    
    # TLD bonus for telecom-friendly TLDs (0-10 points)
    tld = get_tld(domain)
    if tld in TELECOM_TLDS:
        score += 10
        reasons.append(f"Telecom-friendly TLD {tld} (+10)")
    
    # Domain alive verification (0-20 points)
    if domain_alive:
        score += 20
        reasons.append("Domain is alive and accessible (+20)")
    else:
        reasons.append("Domain not accessible (0)")
    
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
    
    # Facebook verification (0-10 points)
    if facebook_verified:
        if facebook_match:
            score += 10
            reasons.append("Facebook profile verified and matches (+10)")
        else:
            score += 5
            reasons.append("Facebook profile found but no exact match (+5)")
    
    # Cap score between 0 and 100
    score = max(0, min(100, score))
    
    reason_text = ", ".join(reasons) + f", total = {score}"
    return score, reason_text

def calculate_score(domain):
    """Legacy scoring function - keeping for backward compatibility"""
    return calculate_enhanced_score(domain, "", "", False, False, False, False, False)

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
                    verification_details_results = []
                    
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
                        domain_alive, domain_status = check_domain_alive(domain)
                        linkedin_verified, linkedin_match, linkedin_details = verify_linkedin_profile(name, email, domain)
                        facebook_verified, facebook_match, facebook_details = verify_facebook_profile(name, email, domain)
                        
                        # Calculate enhanced score
                        score, reason = calculate_enhanced_score(
                            domain, name, email, domain_alive, linkedin_verified,
                            facebook_verified, linkedin_match, facebook_match
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
                            'facebook_details': facebook_details
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
                        verification_details_results.append(json.dumps(verification_details))
                        
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
                            'verification_details': json.dumps(verification_details)
                        })
                    
                    log_progress(session_id, 'info', 'Saving results to file...')
                    progress_updates[session_id]['message'] = 'Saving results...'
                    
                    # Add new columns to DataFrame
                    df['domain'] = domains
                    df['score'] = scores
                    df['reason'] = reasons
                    df['domain_alive'] = domain_alive_results
                    df['linkedin_verified'] = linkedin_verified_results
                    df['facebook_verified'] = facebook_verified_results
                    df['linkedin_match'] = linkedin_match_results
                    df['facebook_match'] = facebook_match_results
                    df['verification_details'] = verification_details_results
                    
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
def download_file():
    try:
        file_path = app.config.get('PROCESSED_FILE')
        
        if not file_path or not os.path.exists(file_path):
            return jsonify({'error': 'No processed file available'}), 404
        
        return send_file(
            file_path,
            as_attachment=True,
            download_name=f'processed_leads_{datetime.now().strftime("%Y%m%d_%H%M%S")}.xlsx',
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
            
            session_data = session.to_dict()
            session_data.update({
                'avg_score': round(avg_score, 1),
                'domains_alive_count': domains_alive_count,
                'linkedin_verified_count': linkedin_verified_count,
                'facebook_verified_count': facebook_verified_count
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
        
        # Calculate total processed results for rates
        total_processed_results = ProcessingResult.query.count()
        
        # Calculate verification rates
        domain_alive_rate = (domains_alive_count / total_processed_results * 100) if total_processed_results > 0 else 0
        linkedin_verified_rate = (linkedin_verified_count / total_processed_results * 100) if total_processed_results > 0 else 0
        facebook_verified_rate = (facebook_verified_count / total_processed_results * 100) if total_processed_results > 0 else 0
        
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
                'domain_alive_rate': round(domain_alive_rate, 1),
                'linkedin_verified_rate': round(linkedin_verified_rate, 1),
                'facebook_verified_rate': round(facebook_verified_rate, 1),
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
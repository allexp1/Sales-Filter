from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
import json

db = SQLAlchemy()

class User(UserMixin, db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_active = db.Column(db.Boolean, default=True)
    
    # Relationships
    sessions = db.relationship('ProcessingSession', backref='user', lazy=True, cascade='all, delete-orphan')
    
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
    
    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'created_at': self.created_at.isoformat(),
            'is_active': self.is_active
        }

class ProcessingSession(db.Model):
    __tablename__ = 'processing_sessions'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    filename = db.Column(db.String(255), nullable=False)
    upload_time = db.Column(db.DateTime, default=datetime.utcnow)
    status = db.Column(db.String(50), default='pending')  # pending, processing, completed, failed
    total_rows = db.Column(db.Integer, default=0)
    processed_file_path = db.Column(db.String(500))
    
    # Enhanced statistics
    avg_score = db.Column(db.Float, default=0.0)
    business_domains_count = db.Column(db.Integer, default=0)
    free_emails_count = db.Column(db.Integer, default=0)
    telecom_domains_count = db.Column(db.Integer, default=0)
    enterprise_domains_count = db.Column(db.Integer, default=0)
    
    # Date range for filtering
    date_from = db.Column(db.Date)
    date_to = db.Column(db.Date)
    
    # Relationships
    results = db.relationship('ProcessingResult', backref='session', lazy=True, cascade='all, delete-orphan')
    logs = db.relationship('ProcessingLog', backref='session', lazy=True, cascade='all, delete-orphan')
    
    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'filename': self.filename,
            'upload_time': self.upload_time.isoformat(),
            'status': self.status,
            'total_rows': self.total_rows,
            'avg_score': self.avg_score,
            'business_domains_count': self.business_domains_count,
            'free_emails_count': self.free_emails_count,
            'telecom_domains_count': self.telecom_domains_count,
            'enterprise_domains_count': self.enterprise_domains_count,
            'date_from': self.date_from.isoformat() if self.date_from else None,
            'date_to': self.date_to.isoformat() if self.date_to else None
        }

class ProcessingResult(db.Model):
    __tablename__ = 'processing_results'
    
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('processing_sessions.id'), nullable=False)
    row_number = db.Column(db.Integer, nullable=False)
    
    # Original data
    name = db.Column(db.String(255))
    email = db.Column(db.String(255))
    date = db.Column(db.Date)
    
    # Enhanced data
    domain = db.Column(db.String(255))
    industry = db.Column(db.String(100))
    score = db.Column(db.Integer)
    reason = db.Column(db.Text)
    
    # Scoring components
    base_score = db.Column(db.Integer, default=0)
    tld_bonus = db.Column(db.Integer, default=0)
    name_match_bonus = db.Column(db.Integer, default=0)
    domain_type = db.Column(db.String(50))  # free, telecom, enterprise, corporate
    
    def to_dict(self):
        return {
            'id': self.id,
            'session_id': self.session_id,
            'row_number': self.row_number,
            'name': self.name,
            'email': self.email,
            'date': self.date.isoformat() if self.date else None,
            'domain': self.domain,
            'industry': self.industry,
            'score': self.score,
            'reason': self.reason,
            'base_score': self.base_score,
            'tld_bonus': self.tld_bonus,
            'name_match_bonus': self.name_match_bonus,
            'domain_type': self.domain_type
        }

class ProcessingLog(db.Model):
    __tablename__ = 'processing_logs'
    
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('processing_sessions.id'), nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    level = db.Column(db.String(20), default='info')  # info, warning, error
    message = db.Column(db.Text)
    progress = db.Column(db.Float, default=0.0)  # 0-100
    
    def to_dict(self):
        return {
            'id': self.id,
            'session_id': self.session_id,
            'timestamp': self.timestamp.isoformat(),
            'level': self.level,
            'message': self.message,
            'progress': self.progress
        }

class DomainIndustry(db.Model):
    __tablename__ = 'domain_industries'
    
    id = db.Column(db.Integer, primary_key=True)
    domain = db.Column(db.String(255), unique=True, nullable=False)
    industry = db.Column(db.String(100), nullable=False)
    domain_type = db.Column(db.String(50), nullable=False)  # free, telecom, enterprise, corporate
    score_modifier = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'domain': self.domain,
            'industry': self.industry,
            'domain_type': self.domain_type,
            'score_modifier': self.score_modifier
        }

def init_db(app):
    """Initialize database with sample data"""
    db.init_app(app)
    
    with app.app_context():
        # Create all tables
        db.create_all()
        
        # Check if domain data already exists
        if DomainIndustry.query.count() == 0:
            # Add sample domain classifications
            sample_domains = [
                # Free providers
                {'domain': 'gmail.com', 'industry': 'Free Email', 'domain_type': 'free', 'score_modifier': -30},
                {'domain': 'yahoo.com', 'industry': 'Free Email', 'domain_type': 'free', 'score_modifier': -30},
                {'domain': 'outlook.com', 'industry': 'Free Email', 'domain_type': 'free', 'score_modifier': -30},
                {'domain': 'hotmail.com', 'industry': 'Free Email', 'domain_type': 'free', 'score_modifier': -30},
                {'domain': 'aol.com', 'industry': 'Free Email', 'domain_type': 'free', 'score_modifier': -30},
                {'domain': 'icloud.com', 'industry': 'Free Email', 'domain_type': 'free', 'score_modifier': -30},
                
                # Telecom providers
                {'domain': 'verizon.com', 'industry': 'Telecom', 'domain_type': 'telecom', 'score_modifier': 50},
                {'domain': 'att.com', 'industry': 'Telecom', 'domain_type': 'telecom', 'score_modifier': 50},
                {'domain': 'tmobile.com', 'industry': 'Telecom', 'domain_type': 'telecom', 'score_modifier': 50},
                {'domain': 'orange.com', 'industry': 'Telecom', 'domain_type': 'telecom', 'score_modifier': 50},
                {'domain': 'vodafone.com', 'industry': 'Telecom', 'domain_type': 'telecom', 'score_modifier': 50},
                {'domain': 'telefonica.com', 'industry': 'Telecom', 'domain_type': 'telecom', 'score_modifier': 50},
                {'domain': 'bt.com', 'industry': 'Telecom', 'domain_type': 'telecom', 'score_modifier': 50},
                {'domain': 'sprint.com', 'industry': 'Telecom', 'domain_type': 'telecom', 'score_modifier': 50},
                
                # Enterprise domains
                {'domain': 'microsoft.com', 'industry': 'Technology', 'domain_type': 'enterprise', 'score_modifier': 30},
                {'domain': 'google.com', 'industry': 'Technology', 'domain_type': 'enterprise', 'score_modifier': 30},
                {'domain': 'apple.com', 'industry': 'Technology', 'domain_type': 'enterprise', 'score_modifier': 30},
                {'domain': 'amazon.com', 'industry': 'E-commerce', 'domain_type': 'enterprise', 'score_modifier': 30},
                {'domain': 'facebook.com', 'industry': 'Social Media', 'domain_type': 'enterprise', 'score_modifier': 30},
                {'domain': 'salesforce.com', 'industry': 'SaaS', 'domain_type': 'enterprise', 'score_modifier': 30},
                {'domain': 'oracle.com', 'industry': 'Technology', 'domain_type': 'enterprise', 'score_modifier': 30},
                {'domain': 'ibm.com', 'industry': 'Technology', 'domain_type': 'enterprise', 'score_modifier': 30},
                {'domain': 'cisco.com', 'industry': 'Technology', 'domain_type': 'enterprise', 'score_modifier': 30},
                {'domain': 'intel.com', 'industry': 'Technology', 'domain_type': 'enterprise', 'score_modifier': 30},
                
                # Financial
                {'domain': 'jpmorgan.com', 'industry': 'Finance', 'domain_type': 'enterprise', 'score_modifier': 30},
                {'domain': 'goldmansachs.com', 'industry': 'Finance', 'domain_type': 'enterprise', 'score_modifier': 30},
                {'domain': 'bankofamerica.com', 'industry': 'Finance', 'domain_type': 'enterprise', 'score_modifier': 30},
                {'domain': 'wellsfargo.com', 'industry': 'Finance', 'domain_type': 'enterprise', 'score_modifier': 30},
                {'domain': 'chase.com', 'industry': 'Finance', 'domain_type': 'enterprise', 'score_modifier': 30},
            ]
            
            for domain_data in sample_domains:
                domain = DomainIndustry(**domain_data)
                db.session.add(domain)
            
            db.session.commit()
            print("Sample domain data added to database")
        
        print("Database initialized successfully!")
import os
import json
import threading
import time
import shutil
from datetime import datetime, date
from flask import Flask, render_template, request, jsonify, redirect, url_for, flash, send_file, session as flask_session
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from flask_cors import CORS
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
import pandas as pd
from models import db, User, ProcessingSession, ProcessingResult, ProcessingLog, DomainIndustry, init_db
from scoring_engine import ScoringEngine
from forms import LoginForm, SignUpForm, UploadForm

# Initialize Flask app
app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'your-secret-key-change-in-production')
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:///sales_filter_v05.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Initialize extensions
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'
login_manager.login_message = 'Please log in to access this page.'
login_manager.login_message_category = 'info'

CORS(app, origins=["*"])

# Create directories
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs('processed_files', exist_ok=True)

# Initialize database
init_db(app)

# Initialize scoring engine
scoring_engine = ScoringEngine()

# Global progress tracking
progress_updates = {}

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

def log_progress(session_id, level, message, progress=None):
    """Log progress for a processing session"""
    try:
        with app.app_context():
            log = ProcessingLog(
                session_id=session_id,
                level=level,
                message=message,
                progress=progress or 0.0
            )
            db.session.add(log)
            db.session.commit()
            
            # Update in-memory progress
            if session_id not in progress_updates:
                progress_updates[session_id] = {}
            
            progress_updates[session_id].update({
                'level': level,
                'message': message,
                'progress': progress or 0.0,
                'timestamp': datetime.utcnow().isoformat()
            })
    except Exception as e:
        print(f"Error logging progress: {e}")

# Routes
@app.route('/')
def index():
    """Main dashboard page"""
    if not current_user.is_authenticated:
        return redirect(url_for('login'))
    
    # Get user's recent sessions
    recent_sessions = ProcessingSession.query.filter_by(user_id=current_user.id).order_by(ProcessingSession.upload_time.desc()).limit(5).all()
    
    # Get user's statistics
    total_sessions = ProcessingSession.query.filter_by(user_id=current_user.id).count()
    completed_sessions = ProcessingSession.query.filter_by(user_id=current_user.id, status='completed').count()
    total_rows_processed = db.session.query(db.func.sum(ProcessingSession.total_rows)).filter_by(user_id=current_user.id).scalar() or 0
    
    return render_template('dashboard.html', 
                         recent_sessions=recent_sessions,
                         total_sessions=total_sessions,
                         completed_sessions=completed_sessions,
                         total_rows_processed=total_rows_processed)

@app.route('/login', methods=['GET', 'POST'])
def login():
    """User login page"""
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    
    form = LoginForm()
    if form.validate_on_submit():
        user = User.query.filter_by(username=form.username.data).first()
        if user and user.check_password(form.password.data):
            login_user(user, remember=form.remember_me.data)
            next_page = request.args.get('next')
            return redirect(next_page) if next_page else redirect(url_for('index'))
        flash('Invalid username or password', 'error')
    
    return render_template('login.html', form=form)

@app.route('/signup', methods=['GET', 'POST'])
def signup():
    """User signup page"""
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    
    form = SignUpForm()
    if form.validate_on_submit():
        # Check if username already exists
        if User.query.filter_by(username=form.username.data).first():
            flash('Username already exists', 'error')
            return render_template('signup.html', form=form)
        
        # Check if email already exists
        if User.query.filter_by(email=form.email.data).first():
            flash('Email already registered', 'error')
            return render_template('signup.html', form=form)
        
        # Create new user
        user = User(
            username=form.username.data,
            email=form.email.data
        )
        user.set_password(form.password.data)
        
        db.session.add(user)
        db.session.commit()
        
        flash('Registration successful! Please log in.', 'success')
        return redirect(url_for('login'))
    
    return render_template('signup.html', form=form)

@app.route('/logout')
@login_required
def logout():
    """User logout"""
    logout_user()
    flash('You have been logged out.', 'info')
    return redirect(url_for('login'))

@app.route('/upload', methods=['GET', 'POST'])
@login_required
def upload():
    """File upload page"""
    form = UploadForm()
    if form.validate_on_submit():
        file = form.file.data
        date_from = form.date_from.data
        date_to = form.date_to.data
        
        if file and file.filename and file.filename.endswith('.xlsx'):
            filename = secure_filename(file.filename)
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(filepath)
            
            # Create processing session
            session = ProcessingSession(
                user_id=current_user.id,
                filename=filename,
                status='pending',
                date_from=date_from,
                date_to=date_to
            )
            db.session.add(session)
            db.session.commit()
            
            # Start background processing
            thread = threading.Thread(target=process_file_async, args=(session.id, filepath))
            thread.daemon = True
            thread.start()
            
            return redirect(url_for('processing', session_id=session.id))
    
    return render_template('upload.html', form=form)

@app.route('/processing/<int:session_id>')
@login_required
def processing(session_id):
    """Processing status page"""
    session = ProcessingSession.query.get_or_404(session_id)
    if session.user_id != current_user.id:
        flash('Access denied', 'error')
        return redirect(url_for('index'))
    
    return render_template('processing.html', session=session)

@app.route('/history')
@login_required
def history():
    """Processing history page"""
    sessions = ProcessingSession.query.filter_by(user_id=current_user.id).order_by(ProcessingSession.upload_time.desc()).all()
    return render_template('history.html', sessions=sessions)

@app.route('/history/<int:session_id>')
@login_required
def session_details(session_id):
    """Session details page"""
    session = ProcessingSession.query.get_or_404(session_id)
    if session.user_id != current_user.id:
        flash('Access denied', 'error')
        return redirect(url_for('index'))
    
    # Get results with pagination
    page = request.args.get('page', 1, type=int)
    results = ProcessingResult.query.filter_by(session_id=session_id).paginate(
        page=page, per_page=50, error_out=False
    )
    
    # Get business domain statistics
    business_stats = scoring_engine.get_business_domains_stats(session_id)
    
    return render_template('session_details.html', 
                         session=session, 
                         results=results,
                         business_stats=business_stats)

@app.route('/download/<int:session_id>')
@login_required
def download_results(session_id):
    """Download processed results"""
    session = ProcessingSession.query.get_or_404(session_id)
    if session.user_id != current_user.id:
        flash('Access denied', 'error')
        return redirect(url_for('index'))
    
    if session.status != 'completed' or not session.processed_file_path:
        flash('File not ready for download', 'error')
        return redirect(url_for('history'))
    
    if not os.path.exists(session.processed_file_path):
        flash('Processed file not found', 'error')
        return redirect(url_for('history'))
    
    return send_file(session.processed_file_path, as_attachment=True)

@app.route('/progress/stream/<int:session_id>')
@login_required
def progress_stream(session_id):
    """Server-Sent Events for progress updates"""
    session = ProcessingSession.query.get_or_404(session_id)
    if session.user_id != current_user.id:
        return jsonify({'error': 'Access denied'}), 403
    
    def generate():
        while True:
            if session_id in progress_updates:
                data = progress_updates[session_id]
                yield f"data: {json.dumps(data)}\n\n"
            
            # Check if processing is complete
            current_session = ProcessingSession.query.get(session_id)
            if current_session and current_session.status in ['completed', 'failed']:
                final_data = {
                    'status': current_session.status,
                    'message': f'Processing {current_session.status}',
                    'progress': 100.0 if current_session.status == 'completed' else 0.0
                }
                yield f"data: {json.dumps(final_data)}\n\n"
                break
            
            time.sleep(1)
    
    return app.response_class(generate(), mimetype='text/plain')

def process_file_async(session_id, filepath):
    """Background file processing"""
    with app.app_context():
        session = ProcessingSession.query.get(session_id)
        if not session:
            return
        
        try:
            session.status = 'processing'
            db.session.commit()
            
            log_progress(session_id, 'info', 'Starting file processing...', 0)
            
            # Read Excel file
            df = pd.read_excel(filepath)
            
            # Validate columns
            required_columns = ['name', 'email', 'date']
            missing_columns = [col for col in required_columns if col not in df.columns]
            if missing_columns:
                raise ValueError(f"Missing required columns: {', '.join(missing_columns)}")
            
            # Apply date filtering if specified
            if session.date_from or session.date_to:
                df['date'] = pd.to_datetime(df['date'])
                if session.date_from:
                    df = df[df['date'] >= pd.Timestamp(session.date_from)]
                if session.date_to:
                    df = df[df['date'] <= pd.Timestamp(session.date_to)]
            
            total_rows = len(df)
            session.total_rows = total_rows
            db.session.commit()
            
            log_progress(session_id, 'info', f'Processing {total_rows} rows...', 10)
            
            # Process each row
            results = []
            for idx, row in df.iterrows():
                try:
                    # Calculate score
                    score, reason, details = scoring_engine.calculate_score(row['name'], row['email'])
                    
                    # Create result record
                    result = ProcessingResult(
                        session_id=session_id,
                        row_number=idx + 1,
                        name=row['name'],
                        email=row['email'],
                        date=pd.to_datetime(row['date']).date() if pd.notna(row['date']) else None,
                        domain=details.get('domain'),
                        industry=details.get('industry'),
                        score=score,
                        reason=reason,
                        base_score=details.get('base_score', 0),
                        tld_bonus=details.get('tld_bonus', 0),
                        name_match_bonus=details.get('name_match_bonus', 0),
                        domain_type=details.get('domain_type')
                    )
                    results.append(result)
                    
                    # Update progress
                    progress = 10 + (idx + 1) / total_rows * 80
                    log_progress(session_id, 'info', f'Processed row {idx + 1} of {total_rows}', progress)
                    
                except Exception as e:
                    log_progress(session_id, 'error', f'Error processing row {idx + 1}: {str(e)}')
                    continue
            
            # Bulk insert results
            db.session.bulk_save_objects(results)
            db.session.commit()
            
            log_progress(session_id, 'info', 'Creating enhanced Excel file...', 90)
            
            # Create enhanced DataFrame
            enhanced_data = []
            for result in results:
                enhanced_data.append({
                    'name': result.name,
                    'email': result.email,
                    'date': result.date,
                    'domain': result.domain,
                    'industry': result.industry,
                    'score': result.score,
                    'reason': result.reason
                })
            
            enhanced_df = pd.DataFrame(enhanced_data)
            
            # Save enhanced file
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f"processed_{session_id}_{timestamp}_{session.filename}"
            processed_path = os.path.join('processed_files', filename)
            enhanced_df.to_excel(processed_path, index=False)
            
            # Update session with results
            session.processed_file_path = processed_path
            session.status = 'completed'
            
            # Calculate statistics
            if results:
                session.avg_score = sum(r.score for r in results) / len(results)
                session.business_domains_count = len([r for r in results if r.domain_type != 'free'])
                session.free_emails_count = len([r for r in results if r.domain_type == 'free'])
                session.telecom_domains_count = len([r for r in results if r.domain_type == 'telecom'])
                session.enterprise_domains_count = len([r for r in results if r.domain_type == 'enterprise'])
            
            db.session.commit()
            
            log_progress(session_id, 'info', 'Processing completed successfully!', 100)
            
        except Exception as e:
            log_progress(session_id, 'error', f'Processing failed: {str(e)}')
            session.status = 'failed'
            db.session.commit()
        
        finally:
            # Clean up uploaded file
            if os.path.exists(filepath):
                os.remove(filepath)

if __name__ == '__main__':
    app.run(debug=True, port=5002, host='0.0.0.0')
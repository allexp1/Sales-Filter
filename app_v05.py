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
from scoring_engine_didww_enhanced import DIDWWScoringEngine
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

# Initialize DIDWW scoring engine
scoring_engine = DIDWWScoringEngine()

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

@app.route('/logs/<int:session_id>')
@login_required
def get_logs(session_id):
    """Get processing logs for a session"""
    session = ProcessingSession.query.get_or_404(session_id)
    if session.user_id != current_user.id:
        return jsonify({'error': 'Access denied'}), 403
    
    logs = ProcessingLog.query.filter_by(session_id=session_id).order_by(ProcessingLog.timestamp).all()
    log_data = []
    for log in logs:
        log_data.append({
            'timestamp': log.timestamp.isoformat(),
            'level': log.level,
            'message': log.message,
            'progress': log.progress
        })
    
    return jsonify({
        'session_id': session_id,
        'logs': log_data,
        'status': session.status
    })

@app.route('/logs/download/<int:session_id>')
@login_required
def download_logs(session_id):
    """Download logs as text file"""
    session = ProcessingSession.query.get_or_404(session_id)
    if session.user_id != current_user.id:
        flash('Access denied', 'error')
        return redirect(url_for('index'))
    
    logs = ProcessingLog.query.filter_by(session_id=session_id).order_by(ProcessingLog.timestamp).all()
    
    # Create log content
    log_content = f"Processing Logs for Session {session_id}\n"
    log_content += f"File: {session.filename}\n"
    log_content += f"Status: {session.status}\n"
    log_content += f"Started: {session.upload_time}\n"
    log_content += "=" * 80 + "\n\n"
    
    for log in logs:
        log_content += f"[{log.timestamp.strftime('%Y-%m-%d %H:%M:%S')}] [{log.level.upper()}] {log.message} (Progress: {log.progress}%)\n"
    
    # Create response
    from flask import Response
    return Response(
        log_content,
        mimetype="text/plain",
        headers={"Content-disposition": f"attachment; filename=logs_session_{session_id}.txt"}
    )

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
        
        if file and file.filename:
            # Check file extension
            if not file.filename.endswith('.xlsx'):
                # Return JSON error for non-.xlsx files
                return jsonify({'error': 'Upload must be an .xlsx file.'}), 400
                
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
        else:
            # No file provided
            return jsonify({'error': 'No file provided.'}), 400
    
    # For GET requests or form validation errors
    if request.method == 'POST':
        # Form validation failed - return JSON error for AJAX requests
        errors = []
        for field, field_errors in form.errors.items():
            for error in field_errors:
                errors.append(f"{field}: {error}")
        return jsonify({'error': ', '.join(errors)}), 400
    
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
    
    # Get sorting parameters
    sort_by = request.args.get('sort', 'row_number')
    sort_order = request.args.get('order', 'asc')
    
    # Build query
    query = ProcessingResult.query.filter_by(session_id=session_id)
    
    # Apply date filtering if requested
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')
    if date_from or date_to:
        if date_from:
            query = query.filter(ProcessingResult.date >= date_from)
        if date_to:
            query = query.filter(ProcessingResult.date <= date_to)
    
    # Apply sorting
    if sort_by == 'name':
        query = query.order_by(ProcessingResult.name.asc() if sort_order == 'asc' else ProcessingResult.name.desc())
    elif sort_by == 'email':
        query = query.order_by(ProcessingResult.email.asc() if sort_order == 'asc' else ProcessingResult.email.desc())
    elif sort_by == 'domain':
        query = query.order_by(ProcessingResult.domain.asc() if sort_order == 'asc' else ProcessingResult.domain.desc())
    elif sort_by == 'industry':
        query = query.order_by(ProcessingResult.industry.asc() if sort_order == 'asc' else ProcessingResult.industry.desc())
    elif sort_by == 'score':
        query = query.order_by(ProcessingResult.score.asc() if sort_order == 'asc' else ProcessingResult.score.desc())
    else:
        query = query.order_by(ProcessingResult.row_number.asc())
    
    # Get results with pagination
    page = request.args.get('page', 1, type=int)
    results = query.paginate(page=page, per_page=50, error_out=False)
    
    # Get business domain statistics (simplified for DIDWW engine)
    business_stats = {
        'total_business_domains': ProcessingResult.query.filter_by(session_id=session_id).filter(ProcessingResult.domain != None).count(),
        'total_industries': 0  # DIDWW engine doesn't track industries the same way
    }
    
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

@app.route('/logs')
@login_required
def logs():
    """View all processing logs"""
    sessions = ProcessingSession.query.filter_by(user_id=current_user.id).order_by(ProcessingSession.upload_time.desc()).all()
    return render_template('logs.html', sessions=sessions)

@app.route('/progress/stream/<int:session_id>')
@login_required
def progress_stream(session_id):
    """Server-Sent Events for progress updates"""
    session = ProcessingSession.query.get_or_404(session_id)
    if session.user_id != current_user.id:
        return jsonify({'error': 'Access denied'}), 403
    
    def generate():
        with app.app_context():
            while True:
                if session_id in progress_updates:
                    data = progress_updates[session_id]
                    # Add processed and total rows info
                    current_session = db.session.get(ProcessingSession, session_id)
                    if current_session:
                        processed_count = ProcessingResult.query.filter_by(session_id=session_id).count()
                        data['total_rows'] = current_session.total_rows
                        data['processed_rows'] = processed_count
                    yield f"data: {json.dumps(data)}\n\n"
                
                # Check if processing is complete
                current_session = db.session.get(ProcessingSession, session_id)
                if current_session and current_session.status in ['completed', 'failed']:
                    final_data = {
                        'status': current_session.status,
                        'message': f'Processing {current_session.status}',
                        'progress': 100.0 if current_session.status == 'completed' else 0.0,
                        'level': 'success' if current_session.status == 'completed' else 'error'
                    }
                    yield f"data: {json.dumps(final_data)}\n\n"
                    break
                
                time.sleep(1)
    
    return app.response_class(generate(), mimetype='text/event-stream')

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
            required_columns = ['name', 'email']
            missing_columns = [col for col in required_columns if col not in df.columns]
            if missing_columns:
                raise ValueError(f"Missing required columns: {', '.join(missing_columns)}")
            
            # Check for date column with various possible names
            date_column = None
            possible_date_columns = ['date', 'Date', 'DATE', 'datetime', 'DateTime', 'timestamp', 'Timestamp']
            
            # Also check columns by index (column C would be index 2)
            if len(df.columns) > 2 and df.columns[2] not in ['name', 'email']:
                # Check if column C contains date-like values
                try:
                    test_dates = pd.to_datetime(df.iloc[:5, 2], errors='coerce', dayfirst=True)
                    if test_dates.notna().sum() > 0:
                        date_column = df.columns[2]
                        log_progress(session_id, 'info', f'Detected date column at position C: {date_column}', 5)
                except:
                    pass
            
            # If not found by position, check by name
            if not date_column:
                for col in possible_date_columns:
                    if col in df.columns:
                        date_column = col
                        break
            
            has_date_column = date_column is not None
            
            # Apply date filtering if specified and date column exists
            if has_date_column and (session.date_from or session.date_to):
                df['date'] = pd.to_datetime(df[date_column], errors='coerce', dayfirst=True)
                if session.date_from:
                    df = df[df['date'] >= pd.Timestamp(session.date_from)]
                if session.date_to:
                    df = df[df['date'] <= pd.Timestamp(session.date_to)]
            elif not has_date_column and (session.date_from or session.date_to):
                log_progress(session_id, 'warning', 'Date filtering requested but no date column found in file', 5)
            
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
                        date=pd.to_datetime(row.get(date_column or 'date'), dayfirst=True).date() if has_date_column and date_column in row and pd.notna(row.get(date_column)) else None,
                        domain=details.get('domain'),
                        industry=details.get('industry', 'Unknown'),  # Use the enhanced industry detection
                        score=score,
                        reason=reason,
                        base_score=details.get('base_score', 0),
                        tld_bonus=details.get('tld_bonus', 0),
                        name_match_bonus=5 if details.get('category') == 'free' and any(details.get('social_profiles', {}).values()) else 0,
                        domain_type=details.get('category')
                    )
                    results.append(result)
                    
                    # Update progress every 10 rows or on last row
                    if (idx + 1) % 10 == 0 or idx == total_rows - 1:
                        progress = 10 + (idx + 1) / total_rows * 80
                        progress_updates[session_id]['processed_rows'] = idx + 1
                        progress_updates[session_id]['total_rows'] = total_rows
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
            for idx, result in enumerate(results):
                # Get the details from the original calculation
                score, reason, details = scoring_engine.calculate_score(result.name, result.email)
                
                # Extract company intelligence
                company_intel = details.get('company_intelligence', {})
                company_info = ""
                if company_intel.get('company_name'):
                    company_info = f"{company_intel.get('company_name', 'N/A')} - {company_intel.get('employee_count', 0)} employees, ${company_intel.get('annual_revenue', 0):,} revenue"
                
                enhanced_data.append({
                    'name': result.name,
                    'email': result.email,
                    'date': result.date if result.date else '',
                    'domain': result.domain,
                    'industry': details.get('industry', 'Unknown'),
                    'company_intelligence': company_info,
                    'phone_number': details.get('phone_number', ''),
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
                session.business_domains_count = len([r for r in results if r.domain_type not in ['free', None]])
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
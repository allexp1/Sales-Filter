# Sales Filter v0.5

A modern web application for scoring and filtering sales leads based on email domain analysis and industry classification.

## Features

- **User Authentication**: Secure sign-up and login system
- **Enhanced Scoring**: 100-point scoring system with multiple criteria
- **Industry Lookup**: Automatic domain-to-industry mapping
- **Date Range Filtering**: Process leads within specific date ranges
- **Real-time Progress**: Live updates during file processing
- **Business Domain Focus**: Statistics excluding free email providers
- **Modern UI**: Responsive design with Tailwind CSS
- **File Management**: Permanent storage for processed results

## Scoring System

### Base Scoring Rules
- **Free Email Providers** (gmail.com, yahoo.com, etc.): -30 points
- **Telecom Domains**: +50 points
- **Enterprise Domains**: +30 points
- **Corporate Domains**: +10 points

### Bonus Points
- **TLD Bonus**: +10 points for .net, .tel, country-specific TLDs
- **Name Matching**: +5 points if local part matches customer name (free emails only)

### Score Range
- Final scores are capped between 0-100 points
- Scores ≥70: High quality leads
- Scores 40-69: Medium quality leads  
- Scores <40: Low quality leads

## Installation

### Prerequisites
- Python 3.8+
- pip package manager
- Git (for version control)

### Step 1: Clone the Repository
```bash
git clone https://github.com/allexp1/Sales-Filter.git
cd Sales-Filter
```

### Step 2: Install Dependencies
```bash
pip install -r requirements.txt
```

### Step 3: Set Environment Variables (Optional)
```bash
export SECRET_KEY="your-secret-key-here"
export DATABASE_URL="sqlite:///sales_filter_v05.db"
```

### Step 4: Run the Application
```bash
python app_v05.py
```

The application will be available at `http://localhost:5002`

## File Requirements

### Excel File Format
Your Excel file must contain the following columns:
- **name**: Customer name
- **email**: Email address
- **date**: Date in YYYY-MM-DD or MM/DD/YYYY format

### Example Excel Structure
```
name          | email                    | date
John Smith    | john.smith@verizon.com   | 2024-01-15
Jane Doe      | jane.doe@gmail.com       | 2024-01-16
Bob Johnson   | bob@enterprise.com       | 2024-01-17
```

## Usage

### 1. Sign Up / Sign In
- Create a new account or sign in with existing credentials
- All processing sessions are tied to your user account

### 2. Upload File
- Navigate to the Upload page
- Select your Excel file (.xlsx format only)
- Optionally set date range filters
- Click "Upload and Process"

### 3. Monitor Progress
- View real-time processing progress
- See detailed logs of each processing step
- Download results when complete

### 4. View History
- Access all your processing sessions
- Download previous results
- View detailed statistics and insights

## API Endpoints

### Authentication
- `GET /login` - Login page
- `POST /login` - Process login
- `GET /signup` - Registration page
- `POST /signup` - Process registration
- `GET /logout` - Logout user

### File Processing
- `GET /upload` - Upload page
- `POST /upload` - Process file upload
- `GET /processing/<session_id>` - Processing status page
- `GET /progress/stream/<session_id>` - Server-Sent Events for progress
- `GET /download/<session_id>` - Download processed file

### History & Statistics
- `GET /history` - Processing history
- `GET /history/<session_id>` - Session details
- `GET /` - Dashboard (requires authentication)

## Database Schema

### Users
- User accounts with secure password hashing
- Session management with Flask-Login

### Processing Sessions
- File upload tracking
- Processing status and statistics
- Date range filtering support

### Processing Results
- Individual lead records with scores
- Domain and industry information
- Detailed scoring breakdown

### Domain Industries
- Domain-to-industry mapping
- Configurable scoring modifiers
- Support for custom classifications

## Git Setup and GitHub Deployment

### Initialize Git Repository
```bash
git init
git add .
git commit -m "Initial commit - Sales Filter v0.5"
git tag v0.5
```

### Create GitHub Repository
1. Go to GitHub.com and create a new private repository named "Sales-Filter"
2. Add the remote origin:
```bash
git remote add origin https://github.com/allexp1/Sales-Filter.git
git branch -M main
git push -u origin main
git push origin v0.5
```

### Update Favicon Reference
The application references the favicon from:
```html
<link rel="icon" href="https://raw.githubusercontent.com/allexp1/Sales-Filter/v0.5/favicon.ico">
```

Make sure to add the favicon.ico file to your repository root.

## Production Deployment

### Environment Variables
Set these environment variables in production:
```bash
export SECRET_KEY="your-production-secret-key"
export DATABASE_URL="postgresql://user:password@localhost/sales_filter_prod"
export FLASK_ENV="production"
```

### Database Migration
For production, consider using PostgreSQL:
```bash
pip install psycopg2-binary
# Update DATABASE_URL to PostgreSQL connection string
```

### Web Server
Use a production WSGI server like Gunicorn:
```bash
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:5002 app_v05:app
```

### Nginx Configuration
```nginx
server {
    listen 80;
    server_name yourdomain.com;
    
    location / {
        proxy_pass http://127.0.0.1:5002;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Development

### Project Structure
```
Sales-Filter/
├── app_v05.py              # Main Flask application
├── models.py               # Database models
├── scoring_engine.py       # Scoring logic
├── forms.py               # WTForms definitions
├── requirements.txt       # Python dependencies
├── README.md             # This file
├── templates/            # HTML templates
│   ├── base.html
│   ├── login.html
│   ├── signup.html
│   ├── dashboard.html
│   ├── upload.html
│   ├── processing.html
│   ├── history.html
│   └── session_details.html
├── uploads/              # Temporary upload storage
├── processed_files/      # Permanent processed files
└── sales_filter_v05.db   # SQLite database
```

### Adding New Industries
To add new domain-to-industry mappings:
```python
from models import DomainIndustry, db

# Add new domain
new_domain = DomainIndustry(
    domain='example.com',
    industry='Technology',
    domain_type='corporate',
    score_modifier=10
)
db.session.add(new_domain)
db.session.commit()
```

### Customizing Scoring
Modify the scoring rules in `scoring_engine.py`:
- Update `free_providers` set for new free email providers
- Modify `telecom_tlds` for telecom-friendly TLDs
- Adjust score values in `calculate_score()` method

## Troubleshooting

### Common Issues

1. **Module Import Errors**
   ```bash
   pip install -r requirements.txt
   ```

2. **Database Connection Issues**
   - Check if database file exists
   - Verify write permissions in project directory

3. **File Upload Errors**
   - Ensure file is .xlsx format
   - Check file size (max 16MB)
   - Verify required columns exist

4. **Processing Timeout**
   - Large files are processed in background
   - Check processing logs for errors

### Debug Mode
Run with debug enabled:
```bash
export FLASK_DEBUG=1
python app_v05.py
```

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review application logs
3. Verify file format requirements
4. Check database permissions

## License

This project is proprietary software. All rights reserved.

## Version History

### v0.5 (Current)
- User authentication system
- Enhanced scoring with industry lookup
- Date range filtering
- Modern UI with Tailwind CSS
- Real-time progress tracking
- Business domain statistics
- Permanent file storage

### Previous Versions
- v0.1-v0.4: Internal development versions
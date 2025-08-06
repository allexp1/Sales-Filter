# Sales Filter v0.7

A modern web application for scoring and filtering sales leads based on email domain analysis and industry classification, now with GitHub verification, enhanced free email detection, and sanctions compliance.

## Features

- **User Authentication**: Secure sign-up and login system
- **Enhanced Scoring**: 100-point scoring system with multiple criteria
- **Industry Lookup**: Automatic domain-to-industry mapping
- **Date Range Filtering**: Process leads within specific date ranges
- **Real-time Progress**: Live updates during file processing
- **Business Domain Focus**: Statistics excluding free email providers
- **Modern UI**: Responsive design with Tailwind CSS
- **File Management**: Permanent storage for processed results
- **GitHub Verification** (v0.7): Developer profile detection and verification
- **Enhanced Free Email Detection** (v0.7): Comprehensive wildcard domain matching
- **Sanctions Compliance** (v0.7): Automatic penalties for sanctioned domains
- **Company Intelligence** (v0.6): Real-time company enrichment via OpenCorporates and Clearbit
- **Phone Lookup** (v0.6): Automated phone number discovery and validation via Twilio

## What's New in v0.7

### GitHub Profile Verification
- **GitHub API Integration**: Searches for user profiles on GitHub
- **Developer Identification**: +15 points for exact profile matches, +10 for potential matches
- **Technical Background Detection**: Fallback heuristics for developer-oriented email patterns
- **Rate Limited**: Built-in protection against API abuse

### Enhanced Free Email Detection
- **Wildcard Support**: Automatically detects `outlook.*`, `yahoo.*`, `hotmail.*` domains
- **Expanded Provider List**: Added `proton.me`, `188.com` to free provider database
- **Processing Optimization**: Skips expensive domain checks for free email providers
- **Pattern Matching**: Smart detection of free email provider variations

### Sanctions Compliance
- **Russian Domain Penalties**: `.ru` domains automatically receive -50 points
- **Compliance Reasoning**: Clear audit trail for sanctions-based scoring decisions
- **Configurable**: Easy to extend for additional sanctioned regions

### Technical Improvements
- **Fixed Download Bug**: Post-processing file downloads now work correctly
- **Database Schema**: Added GitHub verification columns with migration support
- **Enhanced Statistics**: GitHub verification rates included in reporting
- **Error Handling**: Robust fallbacks for API failures

## What's New in v0.6

### Real API Integrations
- **OpenCorporates**: Free company incorporation data and status verification
- **Clearbit**: Employee count, industry verification, and contact enrichment (100 free lookups/month)
- **Twilio**: Phone number validation and carrier information
- **Intelligent Caching**: 24-hour cache to minimize API calls and respect rate limits

### Enhanced Scoring with Real Data
- Company age bonuses based on incorporation date
- Employee count scoring (startup to enterprise scale)
- Real-time industry verification
- Phone number validation bonuses
- Company status penalties (inactive/dissolved companies)

## API Key Setup

### Step 1: Create a .env file
Copy the `.env.example` file to `.env`:
```bash
cp .env.example .env
```

### Step 2: Obtain Free API Keys

#### OpenCorporates (Free Tier)
1. Visit https://opencorporates.com/api_accounts/new
2. Sign up for a free account
3. Copy your API key to `OPENCORPORATES_API_KEY` in `.env`
4. Free tier includes 500 requests/month

#### Clearbit (Freemium)
1. Visit https://clearbit.com/pricing
2. Sign up for the free plan (100 lookups/month)
3. Copy your API key to `CLEARBIT_API_KEY` in `.env`
4. Provides company and person enrichment data

#### Twilio (Free Trial)
1. Visit https://www.twilio.com/try-twilio
2. Sign up for a free trial account (includes free credits)
3. Copy your Account SID to `TWILIO_ACCOUNT_SID` in `.env`
4. Copy your Auth Token to `TWILIO_AUTH_TOKEN` in `.env`
5. Provides phone number validation and carrier lookup

#### GitHub (Free)
1. No API key required for basic searches
2. Rate limited to prevent abuse
3. Used for developer identification and scoring bonuses

#### Optional: Crunchbase (Not yet implemented)
- Reserved for future funding and investor data integration

## Scoring System

### Base Scoring Rules
- **Free Email Providers** (gmail.com, yahoo.com, etc.): -30 points
- **Telecom Domains**: +50 points
- **Enterprise Domains**: +30 points
- **Corporate Domains**: +10 points

### Bonus Points
- **TLD Bonus**: +10 points for .net, .tel, country-specific TLDs
- **Name Matching**: +5 points if local part matches customer name (free emails only)

### v0.7 Enhanced Bonuses
- **GitHub Verification**: +15 points for exact matches, +10 for potential matches
- **Enhanced Free Email Detection**: Better identification of free providers
- **Sanctions Penalties**: -50 points for `.ru` domains
- **Processing Optimization**: Faster processing by skipping unnecessary checks

### v0.6 Real Data Bonuses
- **Company Age**: +5 to +20 points based on years in business
- **Employee Count**: +5 to +25 points based on company size
- **Industry Match**: +15 points for telecom/technology sectors
- **Phone Validation**: +5 points for valid phone numbers
- **Company Status**: -20 points for inactive/dissolved companies

### Score Range
- Final scores are capped between -50 to +100 points (v0.7 updated range)
- Scores ≥70: High quality leads
- Scores 40-69: Medium quality leads  
- Scores <40: Low quality leads
- Scores <0: Sanctioned or problematic leads

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

### Step 3: Set Up API Keys
```bash
cp .env.example .env
# Edit .env and add your API keys
```

### Step 4: Set Environment Variables (Optional)
```bash
export SECRET_KEY="your-secret-key-here"
export DATABASE_URL="sqlite:///sales_filter_v06.db"
```

### Step 5: Run the Application

For v0.7 with GitHub verification and enhanced features:
```bash
python app.py
# or
python app_v07.py
```

For v0.6 with API integrations:
```bash
python app_v06.py
```

For v0.5 without API integrations:
```bash
python app_v05.py
```

The v0.7 application will be available at `http://localhost:5001`
The v0.6 application will be available at `http://localhost:5003`
The v0.5 application will be available at `http://localhost:5002`

## File Requirements

### Excel File Format
Your Excel file must contain the following columns:
- **name**: Customer name
- **email**: Email address
- **date**: Date in YYYY-MM-DD or MM/DD/YYYY format (optional in v0.6)

### v0.7 Output Columns
The processed file will include all original columns plus:
- **score**: Lead quality score (-50 to 100)
- **domain**: Extracted email domain
- **reason**: Detailed scoring breakdown
- **domain_alive**: Whether domain is accessible
- **linkedin_verified**: LinkedIn profile found
- **facebook_verified**: Facebook profile found  
- **github_verified**: GitHub profile found
- **github_match**: Exact GitHub profile match
- **verification_details**: JSON with detailed verification info

### v0.6 Legacy Columns
- **domain_type**: Classification (free/corporate/enterprise/telecom)
- **industry**: Industry sector
- **company_intelligence**: Company details (age, status, employees, industry)
- **phone_lookup**: Discovered/validated phone numbers with carrier info

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
- v0.6: Watch as company data is enriched in real-time
- Download results when complete

### 4. View History
- Access all your processing sessions
- Download previous results
- View detailed statistics and insights

### 5. Check Enhanced Features (v0.7)
- GitHub verification automatically runs during processing
- Sanctions compliance automatically applied
- Enhanced free email detection works seamlessly
- Fixed download functionality works immediately after processing

### 6. Check API Status (v0.6 features)
- Visit `/api-status` to verify API configuration
- Shows which APIs are configured and available

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

### v0.6 API Features
- `GET /api-status` - Check API configuration status

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
- v0.6: Enriched company and phone data

### Domain Industries
- Domain-to-industry mapping
- Configurable scoring modifiers
- Support for custom classifications

## Git Setup and GitHub Deployment

### Initialize Git Repository
```bash
git init
git add .
git commit -m "Initial commit - Sales Filter v0.6"
git tag v0.6
```

### Create GitHub Repository
1. Go to GitHub.com and create a new private repository named "Sales-Filter"
2. Add the remote origin:
```bash
git remote add origin https://github.com/allexp1/Sales-Filter.git
git branch -M main
git push -u origin main
git push origin v0.6
```

### Update Favicon Reference
The application references the favicon from:
```html
<link rel="icon" href="https://raw.githubusercontent.com/allexp1/Sales-Filter/v0.6/favicon.ico">
```

Make sure to add the favicon.ico file to your repository root.

## Production Deployment

### Environment Variables
Set these environment variables in production:
```bash
export SECRET_KEY="your-production-secret-key"
export DATABASE_URL="postgresql://user:password@localhost/sales_filter_prod"
export FLASK_ENV="production"

# API Keys
export OPENCORPORATES_API_KEY="your-opencorporates-key"
export CLEARBIT_API_KEY="your-clearbit-key"
export TWILIO_ACCOUNT_SID="your-twilio-sid"
export TWILIO_AUTH_TOKEN="your-twilio-token"
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
gunicorn -w 4 -b 0.0.0.0:5003 app_v06:app
```

### Nginx Configuration
```nginx
server {
    listen 80;
    server_name yourdomain.com;
    
    location / {
        proxy_pass http://127.0.0.1:5003;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Development

### Project Structure
```
Sales-Filter/
├── app.py                  # Current working version (v0.7)
├── app_v07.py              # Version 0.7 backup
├── app_v06.py              # Version 0.6 with API integrations
├── app_v05.py              # Version 0.5 without APIs
├── index.html              # Frontend interface
├── company_enrichment.py   # Company data enrichment module
├── phone_enrichment.py     # Phone lookup module
├── scoring_engine_v06.py   # Enhanced scoring with real data
├── models.py               # Database models
├── scoring_engine.py       # Base scoring logic
├── forms.py               # WTForms definitions
├── requirements.txt       # Python dependencies
├── .env.example          # API key template
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
└── sales_filter_v06.db   # SQLite database
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
Modify the scoring rules in the main application file:
- Update `FREE_PROVIDERS` set for new free email providers
- Modify `TELECOM_TLDS` for telecom-friendly TLDs  
- Adjust score values in `calculate_enhanced_score()` method
- Configure GitHub verification bonuses
- Add new sanctioned domains (currently `.ru`)
- Customize wildcard domain patterns

### API Rate Limits
The system includes built-in protection for API rate limits:
- **GitHub**: No authentication required, rate limited by IP (60 requests/hour)
- OpenCorporates: 500/month (free tier) - v0.6 feature
- Clearbit: 100/month (free tier) - v0.6 feature  
- Twilio: Pay-per-use with free trial credits - v0.6 feature
- Cache TTL: Built-in request throttling and error handling

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

5. **GitHub API Errors (v0.7)**
   - GitHub verification may hit rate limits (60/hour per IP)
   - System continues processing even if GitHub API fails
   - Check logs for GitHub API response codes

6. **Download Issues**
   - Fixed in v0.7: Downloads now work immediately after processing
   - Ensure processed files exist in `processed_files/` directory

### Debug Mode
Run with debug enabled:
```bash
export FLASK_DEBUG=1
python app.py  # v0.7
```

### API Troubleshooting (v0.6/v0.7)
- GitHub verification works without API keys (v0.7)
- Visit `/api-status` to check API configuration (v0.6)
- Review logs for specific API error messages
- Verify API keys are correctly formatted (v0.6)
- Check remaining API quotas on provider dashboards (v0.6)

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review application logs
3. Verify file format requirements
4. Check database permissions
5. Verify API key configuration

## License

This project is proprietary software. All rights reserved.

## Version History

### v0.7 (Current)
- GitHub profile verification and developer identification
- Enhanced free email detection with wildcard support
- Russian domain sanctions compliance (-50 points for .ru domains)
- Fixed post-processing download functionality
- Optimized processing (skip domain checks for free providers)
- Database schema updates with GitHub verification columns
- Comprehensive error handling and fallback mechanisms

### v0.6
- Real-time company enrichment via OpenCorporates and Clearbit
- Phone number discovery and validation via Twilio
- Enhanced scoring based on real company data
- API response caching to minimize costs
- Backwards compatible with v0.5 features

### v0.5
- User authentication system
- Enhanced scoring with industry lookup
- Date range filtering
- Modern UI with Tailwind CSS
- Real-time progress tracking
- Business domain statistics
- Permanent file storage

### Previous Versions
- v0.1-v0.4: Internal development versions
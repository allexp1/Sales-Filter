#!/bin/bash

# =============================================================================
# Sales Filter v0.8 - Digital Ocean Automated Installation Script
# =============================================================================
# Usage: curl -sSL https://raw.githubusercontent.com/YOUR_USERNAME/Sales-Filter/main/install-digitalocean.sh | bash
# Or: wget -qO- https://raw.githubusercontent.com/YOUR_USERNAME/Sales-Filter/main/install-digitalocean.sh | bash
# =============================================================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="sales-filter"
APP_USER="salesfilter"
APP_DIR="/opt/sales-filter"
GITHUB_REPO="https://github.com/YOUR_USERNAME/Sales-Filter.git"  # Update this with your actual repo
DOMAIN=""  # Will be prompted for or auto-detected
NGINX_AVAILABLE="/etc/nginx/sites-available"
NGINX_ENABLED="/etc/nginx/sites-enabled"

# Logging
LOG_FILE="/tmp/sales-filter-install.log"
exec > >(tee -a $LOG_FILE)
exec 2>&1

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Sales Filter v0.8 Installation${NC}"
echo -e "${BLUE}  Digital Ocean Production Setup${NC}"
echo -e "${BLUE}========================================${NC}"

# Function to print status messages
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        print_error "This script should not be run as root for security reasons."
        print_error "Please run as a regular user with sudo privileges."
        exit 1
    fi

    # Check if user has sudo privileges
    if ! sudo -n true 2>/dev/null; then
        print_error "This script requires sudo privileges."
        print_error "Please ensure your user can run sudo commands."
        exit 1
    fi
}

# Detect OS and version
detect_os() {
    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        OS=$ID
        OS_VERSION=$VERSION_ID
    else
        print_error "Cannot detect operating system."
        exit 1
    fi

    print_status "Detected OS: $OS $OS_VERSION"
    
    # Verify supported OS
    case $OS in
        ubuntu|debian)
            print_status "Supported OS detected."
            ;;
        *)
            print_error "Unsupported OS: $OS"
            print_error "This script supports Ubuntu and Debian only."
            exit 1
            ;;
    esac
}

# Update system packages
update_system() {
    print_status "Updating system packages..."
    sudo apt-get update -qq
    sudo apt-get upgrade -y -qq
}

# Install system dependencies
install_dependencies() {
    print_status "Installing system dependencies..."
    
    # Essential packages
    sudo apt-get install -y -qq \
        curl \
        wget \
        git \
        python3 \
        python3-pip \
        python3-venv \
        python3-dev \
        build-essential \
        nginx \
        supervisor \
        ufw \
        certbot \
        python3-certbot-nginx \
        htop \
        unzip \
        software-properties-common \
        apt-transport-https \
        ca-certificates \
        gnupg \
        lsb-release

    print_status "System dependencies installed successfully."
}

# Create application user
create_app_user() {
    if id "$APP_USER" &>/dev/null; then
        print_warning "User $APP_USER already exists."
    else
        print_status "Creating application user: $APP_USER"
        sudo adduser --system --group --disabled-password --shell /bin/bash --home /home/$APP_USER $APP_USER
        sudo usermod -aG www-data $APP_USER
    fi
}

# Create application directories
create_directories() {
    print_status "Creating application directories..."
    
    sudo mkdir -p $APP_DIR
    sudo mkdir -p /var/log/$APP_NAME
    sudo mkdir -p /var/run/$APP_NAME
    
    # Set ownership
    sudo chown -R $APP_USER:$APP_USER $APP_DIR
    sudo chown -R $APP_USER:www-data /var/log/$APP_NAME
    sudo chown -R $APP_USER:www-data /var/run/$APP_NAME
}

# Clone application code
clone_application() {
    print_status "Cloning Sales Filter application..."
    
    if [[ -d "$APP_DIR/.git" ]]; then
        print_status "Repository already exists, updating..."
        sudo -u $APP_USER git -C $APP_DIR pull origin main
    else
        print_status "Cloning repository..."
        # For now, we'll create the directory structure manually since we're working locally
        # In production, this would clone from GitHub
        sudo -u $APP_USER git clone $GITHUB_REPO $APP_DIR 2>/dev/null || {
            print_warning "Unable to clone from GitHub. Setting up local files..."
            sudo cp -r "$(pwd)"/* $APP_DIR/ 2>/dev/null || true
            sudo chown -R $APP_USER:$APP_USER $APP_DIR
        }
    fi
}

# Setup Python virtual environment
setup_python_env() {
    print_status "Setting up Python virtual environment..."
    
    cd $APP_DIR
    sudo -u $APP_USER python3 -m venv venv
    sudo -u $APP_USER $APP_DIR/venv/bin/pip install --upgrade pip
    
    # Install Python dependencies
    if [[ -f requirements.txt ]]; then
        print_status "Installing Python dependencies..."
        sudo -u $APP_USER $APP_DIR/venv/bin/pip install -r requirements.txt
    else
        print_warning "requirements.txt not found. Installing basic dependencies..."
        sudo -u $APP_USER $APP_DIR/venv/bin/pip install flask flask-sqlalchemy flask-login flask-wtf gunicorn requests python-dotenv openpyxl tldextract
    fi
}

# Setup environment configuration
setup_environment() {
    print_status "Setting up environment configuration..."
    
    # Create .env file if it doesn't exist
    if [[ ! -f "$APP_DIR/.env" ]]; then
        print_status "Creating environment configuration..."
        sudo -u $APP_USER tee "$APP_DIR/.env" > /dev/null <<EOF
# Sales Filter v0.8 Production Configuration

# Flask Configuration
SECRET_KEY=$(openssl rand -hex 32)
FLASK_ENV=production
DATABASE_URL=sqlite:///$APP_DIR/sales_filter_v08.db

# Application Settings
APP_NAME=Sales Filter v0.8
APP_URL=http://localhost:5001

# API Keys (Optional - Add your keys here)
OPENCORPORATES_API_KEY=
CLEARBIT_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
GITHUB_TOKEN=

# Security Settings
WTF_CSRF_ENABLED=True
SESSION_COOKIE_SECURE=True
SESSION_COOKIE_HTTPONLY=True
SESSION_COOKIE_SAMESITE=Lax

# File Upload Settings
MAX_CONTENT_LENGTH=16777216
UPLOAD_FOLDER=$APP_DIR/uploads
PROCESSED_FOLDER=$APP_DIR/processed_files

# Logging
LOG_LEVEL=INFO
LOG_FILE=/var/log/$APP_NAME/app.log
EOF
        print_status "Environment configuration created."
    else
        print_status "Environment configuration already exists."
    fi
}

# Setup database
setup_database() {
    print_status "Setting up database..."
    
    cd $APP_DIR
    # Initialize database if it doesn't exist
    if [[ ! -f "sales_filter_v08.db" ]]; then
        print_status "Creating database..."
        sudo -u $APP_USER $APP_DIR/venv/bin/python3 -c "
from app import app, db
with app.app_context():
    db.create_all()
    print('Database created successfully')
"
    else
        print_status "Database already exists."
    fi
}

# Get domain name
get_domain() {
    # Try to detect public IP
    PUBLIC_IP=$(curl -s ifconfig.me || curl -s ipinfo.io/ip || echo "")
    
    echo ""
    echo -e "${YELLOW}Domain Configuration${NC}"
    echo "Your server's public IP appears to be: ${PUBLIC_IP}"
    echo ""
    read -p "Enter your domain name (e.g., sales-filter.yourdomain.com) or press Enter to use IP: " input_domain
    
    if [[ -n "$input_domain" ]]; then
        DOMAIN="$input_domain"
        print_status "Using domain: $DOMAIN"
    else
        DOMAIN="$PUBLIC_IP"
        print_status "Using IP address: $DOMAIN"
    fi
}

# Setup Nginx
setup_nginx() {
    print_status "Configuring Nginx..."
    
    # Backup default config if it exists
    if [[ -f "$NGINX_ENABLED/default" ]]; then
        sudo mv "$NGINX_ENABLED/default" "$NGINX_ENABLED/default.bak" 2>/dev/null || true
    fi
    
    # Create Nginx configuration
    sudo tee "$NGINX_AVAILABLE/$APP_NAME" > /dev/null <<EOF
upstream sales_filter_app {
    server 127.0.0.1:5001 fail_timeout=0;
}

server {
    listen 80;
    server_name $DOMAIN;
    client_max_body_size 16M;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript;

    location / {
        proxy_pass http://sales_filter_app;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_redirect off;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Static files (if any)
    location /static/ {
        alias $APP_DIR/static/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Favicon
    location /favicon.ico {
        alias $APP_DIR/static/favicon.ico;
        expires 1y;
    }

    # Health check
    location /health {
        access_log off;
        return 200 "healthy\\n";
        add_header Content-Type text/plain;
    }
}
EOF

    # Enable site
    sudo ln -sf "$NGINX_AVAILABLE/$APP_NAME" "$NGINX_ENABLED/$APP_NAME"
    
    # Test Nginx configuration
    if sudo nginx -t; then
        print_status "Nginx configuration is valid."
        sudo systemctl reload nginx
    else
        print_error "Nginx configuration is invalid."
        exit 1
    fi
}

# Setup systemd service
setup_systemd() {
    print_status "Creating systemd service..."
    
    sudo tee "/etc/systemd/system/$APP_NAME.service" > /dev/null <<EOF
[Unit]
Description=Sales Filter v0.8 - Advanced Lead Scoring Engine
After=network.target

[Service]
Type=notify
User=$APP_USER
Group=www-data
WorkingDirectory=$APP_DIR
Environment=PATH=$APP_DIR/venv/bin
ExecStart=$APP_DIR/venv/bin/gunicorn --bind 127.0.0.1:5001 --workers 3 --timeout 120 --keep-alive 2 --max-requests 1000 --max-requests-jitter 100 --preload app:app
ExecReload=/bin/kill -s HUP \$MAINPID
KillMode=mixed
TimeoutStopSec=5
PrivateTmp=true
RuntimeDirectory=$APP_NAME
PIDFile=/var/run/$APP_NAME/$APP_NAME.pid

# Security settings
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$APP_DIR /var/log/$APP_NAME /var/run/$APP_NAME

# Resource limits
LimitNOFILE=65536
MemoryMax=1G

[Install]
WantedBy=multi-user.target
EOF

    # Reload systemd and enable service
    sudo systemctl daemon-reload
    sudo systemctl enable $APP_NAME.service
}

# Setup firewall
setup_firewall() {
    print_status "Configuring firewall..."
    
    # Check if UFW is active
    if sudo ufw status | grep -q "Status: active"; then
        print_status "UFW is already active."
    else
        # Configure UFW
        sudo ufw --force reset
        sudo ufw default deny incoming
        sudo ufw default allow outgoing
        
        # Allow SSH (be careful not to lock yourself out)
        sudo ufw allow ssh
        sudo ufw allow 22/tcp
        
        # Allow HTTP and HTTPS
        sudo ufw allow 80/tcp
        sudo ufw allow 443/tcp
        
        # Enable firewall
        sudo ufw --force enable
        print_status "Firewall configured and enabled."
    fi
}

# Setup SSL with Let's Encrypt (optional)
setup_ssl() {
    if [[ "$DOMAIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        print_warning "SSL setup skipped for IP address. Use a domain name for SSL."
        return
    fi
    
    echo ""
    read -p "Do you want to setup SSL with Let's Encrypt? (y/n): " setup_ssl_choice
    
    if [[ "$setup_ssl_choice" =~ ^[Yy]$ ]]; then
        print_status "Setting up SSL certificate..."
        
        # Get email for Let's Encrypt
        read -p "Enter your email address for Let's Encrypt: " letsencrypt_email
        
        if [[ -n "$letsencrypt_email" ]]; then
            sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "$letsencrypt_email"
            
            # Setup auto-renewal
            sudo systemctl enable certbot.timer
            print_status "SSL certificate installed and auto-renewal configured."
        else
            print_warning "Email required for Let's Encrypt. SSL setup skipped."
        fi
    fi
}

# Create startup directories
create_app_directories() {
    print_status "Creating application directories..."
    
    sudo -u $APP_USER mkdir -p "$APP_DIR/uploads"
    sudo -u $APP_USER mkdir -p "$APP_DIR/processed_files"
    sudo -u $APP_USER mkdir -p "$APP_DIR/static"
    sudo -u $APP_USER mkdir -p "$APP_DIR/templates"
}

# Start services
start_services() {
    print_status "Starting services..."
    
    # Start and enable Nginx
    sudo systemctl enable nginx
    sudo systemctl start nginx
    
    # Start Sales Filter application
    sudo systemctl start $APP_NAME.service
    
    # Check service status
    if sudo systemctl is-active --quiet $APP_NAME.service; then
        print_status "Sales Filter service started successfully."
    else
        print_error "Failed to start Sales Filter service."
        print_error "Check logs: sudo journalctl -u $APP_NAME.service -f"
        exit 1
    fi
}

# Display completion message
show_completion() {
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  Installation Complete!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "${GREEN}Sales Filter v0.8 has been successfully installed!${NC}"
    echo ""
    echo "🌐 Application URL: http://$DOMAIN"
    echo "📁 Application Directory: $APP_DIR"
    echo "👤 Application User: $APP_USER"
    echo "📋 Log File: $LOG_FILE"
    echo ""
    echo -e "${YELLOW}Important Commands:${NC}"
    echo "• Check service status: sudo systemctl status $APP_NAME"
    echo "• View application logs: sudo journalctl -u $APP_NAME -f"
    echo "• Restart application: sudo systemctl restart $APP_NAME"
    echo "• Nginx status: sudo systemctl status nginx"
    echo ""
    echo -e "${YELLOW}Configuration:${NC}"
    echo "• Environment file: $APP_DIR/.env"
    echo "• Add your API keys to the .env file for enhanced features"
    echo "• Database location: $APP_DIR/sales_filter_v08.db"
    echo ""
    echo -e "${YELLOW}Security:${NC}"
    echo "• Firewall configured with UFW"
    echo "• Application runs as non-root user ($APP_USER)"
    echo "• Nginx reverse proxy configured"
    echo ""
    echo -e "${GREEN}You can now access your Sales Filter application!${NC}"
    echo ""
}

# Main installation function
main() {
    print_status "Starting Sales Filter v0.8 installation..."
    
    check_root
    detect_os
    update_system
    install_dependencies
    create_app_user
    create_directories
    clone_application
    setup_python_env
    create_app_directories
    setup_environment
    setup_database
    get_domain
    setup_nginx
    setup_systemd
    setup_firewall
    setup_ssl
    start_services
    show_completion
}

# Handle script interruption
trap 'print_error "Installation interrupted. Check $LOG_FILE for details."; exit 1' INT TERM

# Run main installation
main "$@"
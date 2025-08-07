#!/bin/bash

# =============================================================================
# Sales Filter v0.8 - Quick Deployment Script
# =============================================================================
# This script helps deploy updates to an existing installation
# =============================================================================

set -e

# Configuration
APP_NAME="sales-filter"
APP_USER="salesfilter"
APP_DIR="/opt/sales-filter"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

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
if [[ $EUID -eq 0 ]]; then
    print_error "This script should not be run as root."
    exit 1
fi

# Check if installation exists
if [[ ! -d "$APP_DIR" ]]; then
    print_error "Sales Filter installation not found at $APP_DIR"
    print_error "Please run the installation script first."
    exit 1
fi

print_status "Deploying Sales Filter v0.8 updates..."

# Backup current version
print_status "Creating backup..."
sudo -u $APP_USER cp -r $APP_DIR $APP_DIR.backup.$(date +%Y%m%d_%H%M%S)

# Stop application
print_status "Stopping application..."
sudo systemctl stop $APP_NAME.service

# Update code (if using git)
if [[ -d "$APP_DIR/.git" ]]; then
    print_status "Updating code from repository..."
    sudo -u $APP_USER git -C $APP_DIR pull origin main
else
    print_warning "No git repository found. Please manually update your code."
fi

# Update Python dependencies
print_status "Updating Python dependencies..."
sudo -u $APP_USER $APP_DIR/venv/bin/pip install --upgrade -r $APP_DIR/requirements.txt

# Run database migrations (if any)
print_status "Checking database..."
cd $APP_DIR
sudo -u $APP_USER $APP_DIR/venv/bin/python3 -c "
from app import app, db
with app.app_context():
    db.create_all()
    print('Database updated successfully')
" 2>/dev/null || print_warning "Database update may have issues"

# Restart application
print_status "Starting application..."
sudo systemctl start $APP_NAME.service

# Check status
if sudo systemctl is-active --quiet $APP_NAME.service; then
    print_status "Deployment successful!"
    print_status "Application is running at: http://$(curl -s ifconfig.me)"
else
    print_error "Deployment failed. Check logs:"
    print_error "sudo journalctl -u $APP_NAME.service -f"
    exit 1
fi

print_status "Deployment completed successfully!"
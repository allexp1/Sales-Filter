# Sales Filter v0.8 - Digital Ocean Deployment Guide

## Quick One-Command Installation

For a fresh Digital Ocean Ubuntu/Debian server, run this single command:

```bash
curl -sSL https://raw.githubusercontent.com/YOUR_USERNAME/Sales-Filter/main/install-digitalocean.sh | bash
```

**Alternative download methods:**
```bash
# Using wget
wget -qO- https://raw.githubusercontent.com/YOUR_USERNAME/Sales-Filter/main/install-digitalocean.sh | bash

# Or download and inspect first (recommended)
curl -sSL https://raw.githubusercontent.com/YOUR_USERNAME/Sales-Filter/main/install-digitalocean.sh -o install.sh
chmod +x install.sh
./install.sh
```

## What the Installation Script Does

### 🔧 System Setup
- Updates all system packages
- Installs Python 3, pip, nginx, supervisor, and other dependencies
- Creates dedicated `salesfilter` user for security
- Sets up proper directory structure with correct permissions

### 🚀 Application Deployment
- Clones/downloads the Sales Filter v0.8 code
- Creates Python virtual environment
- Installs all Python dependencies
- Sets up production database (SQLite by default)
- Creates secure environment configuration

### 🌐 Web Server Configuration
- Configures Nginx as reverse proxy
- Sets up SSL-ready configuration
- Implements security headers and gzip compression
- Creates systemd service for auto-startup

### 🔒 Security Hardening
- Configures UFW firewall (allows SSH, HTTP, HTTPS)
- Runs application as non-root user
- Sets up proper file permissions
- Implements security best practices

### 📋 Production Features
- Automatic service restart on failure
- Log rotation and management
- Performance optimization with Gunicorn
- Health check endpoints

## Pre-Installation Requirements

### Digital Ocean Droplet
- **Minimum**: 1 GB RAM, 1 vCPU, 25 GB SSD
- **Recommended**: 2 GB RAM, 2 vCPU, 50 GB SSD
- **OS**: Ubuntu 20.04/22.04 LTS or Debian 11/12

### Domain Setup (Optional but Recommended)
1. Point your domain/subdomain to your droplet's IP address
2. Create an A record: `sales-filter.yourdomain.com` → `YOUR_DROPLET_IP`

## Installation Process

### Step 1: Create Digital Ocean Droplet
```bash
# Using doctl (Digital Ocean CLI)
doctl compute droplet create sales-filter-v08 \
  --region nyc1 \
  --size s-1vcpu-2gb \
  --image ubuntu-22-04-x64 \
  --ssh-keys YOUR_SSH_KEY_ID
```

### Step 2: Connect to Your Server
```bash
ssh root@YOUR_DROPLET_IP
```

### Step 3: Create Non-Root User (Security Best Practice)
```bash
adduser deploy
usermod -aG sudo deploy
su - deploy
```

### Step 4: Run Installation Script
```bash
curl -sSL https://raw.githubusercontent.com/YOUR_USERNAME/Sales-Filter/main/install-digitalocean.sh | bash
```

### Step 5: Follow Interactive Prompts
The script will ask for:
- Your domain name (or use IP address)
- Email for SSL certificate (if using domain)
- Confirmation for SSL setup

## Post-Installation Configuration

### Add API Keys (Optional)
Edit the environment file to add your API keys:
```bash
sudo nano /opt/sales-filter/.env
```

Add your API keys:
```bash
OPENCORPORATES_API_KEY=your_key_here
CLEARBIT_API_KEY=your_key_here
TWILIO_ACCOUNT_SID=your_sid_here
TWILIO_AUTH_TOKEN=your_token_here
```

Then restart the service:
```bash
sudo systemctl restart sales-filter
```

### Database Configuration (Advanced)
For high-traffic deployments, consider PostgreSQL:

```bash
# Install PostgreSQL
sudo apt install postgresql postgresql-contrib

# Create database
sudo -u postgres createdb sales_filter_db
sudo -u postgres createuser sales_filter_user

# Update .env file
DATABASE_URL=postgresql://sales_filter_user:password@localhost:5432/sales_filter_db
```

## Service Management

### Check Application Status
```bash
sudo systemctl status sales-filter
```

### View Application Logs
```bash
sudo journalctl -u sales-filter -f
```

### Restart Application
```bash
sudo systemctl restart sales-filter
```

### Check Nginx Status
```bash
sudo systemctl status nginx
```

## SSL Certificate Setup

### Automatic (Recommended)
The installation script will offer to set up SSL automatically with Let's Encrypt.

### Manual Setup
```bash
sudo certbot --nginx -d your-domain.com
```

### Auto-Renewal Test
```bash
sudo certbot renew --dry-run
```

## Performance Optimization

### For High Traffic
1. **Increase Gunicorn Workers**:
   ```bash
   sudo nano /etc/systemd/system/sales-filter.service
   # Modify ExecStart to include more workers:
   # --workers 4 (for 2 CPU cores)
   ```

2. **Add Redis Caching**:
   ```bash
   sudo apt install redis-server
   # Update .env file:
   REDIS_URL=redis://localhost:6379/0
   ```

3. **Database Optimization**:
   ```bash
   # For PostgreSQL
   sudo apt install postgresql
   # Configure connection pooling and indexing
   ```

## Monitoring and Maintenance

### Log Files Location
- Application logs: `/var/log/sales-filter/`
- Nginx logs: `/var/log/nginx/`
- Installation log: `/tmp/sales-filter-install.log`

### Backup Database
```bash
# SQLite backup
sudo -u salesfilter cp /opt/sales-filter/sales_filter_v08.db /backup/

# PostgreSQL backup
pg_dump sales_filter_db > backup.sql
```

### Update Application
```bash
cd /opt/sales-filter
sudo -u salesfilter git pull origin main
sudo systemctl restart sales-filter
```

## Troubleshooting

### Common Issues

1. **Service Won't Start**:
   ```bash
   sudo journalctl -u sales-filter -n 50
   ```

2. **Permission Errors**:
   ```bash
   sudo chown -R salesfilter:www-data /opt/sales-filter
   ```

3. **Port Already In Use**:
   ```bash
   sudo lsof -i :5001
   sudo kill -9 PID
   ```

4. **Database Issues**:
   ```bash
   cd /opt/sales-filter
   sudo -u salesfilter /opt/sales-filter/venv/bin/python3 -c "from app import db; db.create_all()"
   ```

### Health Checks
```bash
# Application health
curl http://localhost:5001/health

# Service status
sudo systemctl is-active sales-filter

# Disk space
df -h

# Memory usage
free -m
```

## Security Considerations

### Firewall Status
```bash
sudo ufw status verbose
```

### SSL Certificate Status
```bash
sudo certbot certificates
```

### File Permissions Audit
```bash
sudo find /opt/sales-filter -type f -perm /o+w
```

### Update System Packages
```bash
sudo apt update && sudo apt upgrade -y
```

## Scaling and Performance

### Horizontal Scaling
- Use load balancer (DigitalOcean Load Balancer)
- Deploy multiple droplets
- Shared database (PostgreSQL cluster)

### Vertical Scaling
```bash
# Resize droplet using doctl
doctl compute droplet-action resize DROPLET_ID --size s-2vcpu-4gb
```

### CDN Integration
- Use DigitalOcean Spaces + CDN for static files
- Configure Nginx to serve static content

## Backup Strategy

### Automated Backups
```bash
# Add to crontab
0 2 * * * /opt/sales-filter/backup.sh
```

### DigitalOcean Snapshots
```bash
doctl compute droplet-action snapshot DROPLET_ID --snapshot-name sales-filter-backup-$(date +%Y%m%d)
```

## Cost Optimization

### Resource Monitoring
```bash
htop
iotop
nethogs
```

### Droplet Sizing Guidelines
- **Development**: 1GB RAM ($6/month)
- **Small Production**: 2GB RAM ($12/month)  
- **Medium Production**: 4GB RAM ($24/month)
- **High Traffic**: 8GB RAM ($48/month)

## Support and Maintenance

### Regular Maintenance Tasks
1. Weekly: Check logs for errors
2. Monthly: Update system packages
3. Quarterly: Review security updates
4. Annually: SSL certificate renewal (automatic)

### Emergency Response
1. Check service status
2. Review recent logs
3. Restart services if needed
4. Scale up resources if required

---

## Quick Commands Reference

```bash
# Installation
curl -sSL https://raw.githubusercontent.com/YOUR_USERNAME/Sales-Filter/main/install-digitalocean.sh | bash

# Service management
sudo systemctl [start|stop|restart|status] sales-filter

# View logs
sudo journalctl -u sales-filter -f

# Update application
cd /opt/sales-filter && sudo -u salesfilter git pull origin main && sudo systemctl restart sales-filter

# SSL renewal
sudo certbot renew

# Backup database
sudo -u salesfilter cp /opt/sales-filter/sales_filter_v08.db /backup/db-$(date +%Y%m%d).db
```

For additional support, check the application logs and GitHub repository issues.
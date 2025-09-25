# CAOS CRM Deployment Guide

Complete production deployment guide for CAOS CRM system.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Quick Start](#quick-start)
4. [Production Deployment](#production-deployment)
5. [Configuration](#configuration)
6. [Monitoring](#monitoring)
7. [Backup & Recovery](#backup--recovery)
8. [Security](#security)
9. [Troubleshooting](#troubleshooting)
10. [Maintenance](#maintenance)

## Overview

CAOS CRM is a comprehensive Customer Relationship Management system built with:

- **Backend**: Node.js, Express.js
- **Database**: MySQL 8.0
- **Cache**: Redis
- **Web Server**: Nginx
- **Container**: Docker & Docker Compose
- **Mobile**: Progressive Web App (PWA)

### Architecture

```
Internet → Nginx → Node.js App → MySQL
                              → Redis
```

## Prerequisites

### System Requirements

- **OS**: Linux (Ubuntu 20.04+ recommended), macOS, or Windows with WSL
- **RAM**: 4GB minimum, 8GB recommended
- **Storage**: 20GB minimum, 50GB recommended
- **Network**: Internet access for Docker images

### Software Dependencies

- Docker (20.10+)
- Docker Compose (1.29+)
- Git (for version control)
- curl (for health checks)

### Installation Commands

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install docker.io docker-compose git curl

# Enable Docker service
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker $USER

# CentOS/RHEL
sudo yum install docker docker-compose git curl
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker $USER

# macOS (with Homebrew)
brew install docker docker-compose git

# Verify installation
docker --version
docker-compose --version
```

## Quick Start

### 1. Clone Repository

```bash
git clone <repository-url>
cd caos-crm
```

### 2. Environment Setup

```bash
# Copy environment template
cp .env.production.template .env.production

# Edit with your values
nano .env.production
```

**Critical Environment Variables:**
```bash
DB_PASSWORD=your-secure-password-here
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
CORS_ORIGIN=https://your-domain.com
```

### 3. Deploy

```bash
# Make scripts executable
chmod +x deployment/*.sh

# Deploy with automated script
./deployment/deploy.sh
```

### 4. Verify Installation

```bash
# Check container status
docker-compose ps

# Health check
./deployment/monitor.sh

# Access application
curl http://localhost/api/health
```

## Production Deployment

### 1. Server Preparation

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Create application user
sudo useradd -m -s /bin/bash caoscrm
sudo usermod -aG docker caoscrm

# Create application directory
sudo mkdir -p /opt/caos-crm
sudo chown caoscrm:caoscrm /opt/caos-crm

# Switch to application user
sudo su - caoscrm
cd /opt/caos-crm
```

### 2. SSL Certificate Setup

```bash
# Create SSL directory
mkdir -p deployment/ssl

# Option 1: Let's Encrypt (recommended)
sudo apt install certbot
sudo certbot certonly --standalone -d your-domain.com

# Copy certificates
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem deployment/ssl/cert.pem
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem deployment/ssl/key.pem
sudo chown caoscrm:caoscrm deployment/ssl/*

# Option 2: Self-signed (development only)
openssl req -x509 -newkey rsa:4096 -keyout deployment/ssl/key.pem \
    -out deployment/ssl/cert.pem -days 365 -nodes
```

### 3. Production Environment

```bash
# Configure production environment
cat > .env.production << 'EOF'
NODE_ENV=production
PORT=3001
APP_URL=https://your-domain.com

# Database
DB_HOST=mysql
DB_PORT=5432
DB_NAME=caos_crm
DB_USER=caos_user
DB_PASSWORD=your-super-secure-database-password-change-this

# Security
JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters-change-this
JWT_REFRESH_SECRET=your-super-secret-refresh-key-minimum-32-characters-change-this
CORS_ORIGIN=https://your-domain.com

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=your-secure-redis-password-change-this

# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EOF

chmod 600 .env.production
```

### 4. Deploy to Production

```bash
# Deploy with backup
./deployment/deploy.sh --with-backup

# Verify deployment
./deployment/monitor.sh
```

### 5. Domain Configuration

Update your DNS to point to the server:

```
A    your-domain.com      → your-server-ip
CNAME www.your-domain.com → your-domain.com
```

## Configuration

### Environment Variables Reference

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NODE_ENV` | Environment mode | `production` | Yes |
| `PORT` | Application port | `3001` | No |
| `DB_PASSWORD` | Database password | - | Yes |
| `JWT_SECRET` | JWT signing key | - | Yes |
| `CORS_ORIGIN` | Allowed origins | - | Yes |
| `REDIS_PASSWORD` | Redis password | - | Yes |

### Docker Compose Configuration

**Standard Configuration (docker-compose.yml):**
- Application + Database + Redis + Nginx
- Automatic health checks
- Data persistence
- Network isolation

**Development Override:**
```bash
# Create docker-compose.override.yml for development
cat > docker-compose.override.yml << 'EOF'
version: '3.8'
services:
  caos-crm:
    environment:
      - NODE_ENV=development
      - DEBUG_MODE=true
    volumes:
      - .:/app
    ports:
      - "3001:3001"
EOF
```

## Monitoring

### Health Monitoring

```bash
# Manual health check
./deployment/monitor.sh

# View detailed logs
docker-compose logs -f

# Container stats
docker stats
```

### Automated Monitoring

```bash
# Install monitoring cron jobs
crontab deployment/crontab.example

# Edit cron jobs
crontab -e
```

**Monitoring Schedule:**
- Health checks: Every 15 minutes
- Backups: Daily at 2 AM
- Log rotation: Weekly
- System cleanup: Monthly

### Log Management

```bash
# View application logs
docker-compose logs caos-crm

# View specific service logs
docker-compose logs nginx
docker-compose logs mysql
docker-compose logs redis

# Follow logs in real-time
docker-compose logs -f --tail=100

# Log files location
ls -la logs/
```

## Backup & Recovery

### Automated Backups

```bash
# Manual backup
./deployment/backup.sh

# View backups
ls -la backups/

# Automated backup schedule (cron)
0 2 * * * cd /opt/caos-crm && ./deployment/backup.sh
```

### Backup Components

1. **Database**: MySQL dump (compressed)
2. **Files**: User uploads and documents
3. **Configuration**: Docker compose and environment templates

### Recovery Process

```bash
# Stop services
docker-compose down

# Restore database
gunzip -c backups/database-backup-YYYYMMDD-HHMMSS.sql.gz | \
    docker exec -i caos-crm-db mysql -u caos_user -p caos_crm

# Restore files
tar -xzf backups/files-backup-YYYYMMDD-HHMMSS.tar.gz

# Restart services
docker-compose up -d
```

### Disaster Recovery

1. **Full System Backup**: Include entire Docker volumes
2. **Off-site Storage**: Store backups in cloud storage
3. **Recovery Testing**: Regular recovery drills
4. **Documentation**: Maintain recovery procedures

```bash
# Full system backup
docker run --rm -v caos-crm_mysql_data:/data -v $(pwd)/backups:/backup \
    alpine tar czf /backup/mysql-volume-$(date +%Y%m%d).tar.gz -C /data .

docker run --rm -v caos-crm_redis_data:/data -v $(pwd)/backups:/backup \
    alpine tar czf /backup/redis-volume-$(date +%Y%m%d).tar.gz -C /data .
```

## Security

### Security Checklist

- [ ] Strong passwords for all services
- [ ] JWT secrets changed from defaults
- [ ] SSL/TLS certificates installed
- [ ] Firewall configured
- [ ] Regular security updates
- [ ] Access logs monitored
- [ ] Database access restricted

### Firewall Configuration

```bash
# Ubuntu UFW
sudo ufw enable
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw deny 3001  # Block direct API access
sudo ufw deny 5432  # Block direct DB access
sudo ufw deny 6379  # Block direct Redis access

# Check status
sudo ufw status verbose
```

### SSL/TLS Configuration

The included nginx configuration includes:
- Modern TLS protocols (TLSv1.3)
- Strong cipher suites
- HSTS headers (optional)
- Security headers

### Access Control

```bash
# Database user permissions (production)
docker exec -it caos-crm-db mysql -u root -p -e "
    REVOKE ALL ON caos_crm.* FROM 'caos_user'@'%';
    GRANT ALL PRIVILEGES ON caos_crm.* TO 'caos_user'@'%';
    FLUSH PRIVILEGES;
"

# File permissions
find . -type f -name "*.sh" -exec chmod 755 {} \;
find . -type f -name ".env*" -exec chmod 600 {} \;
```

## Troubleshooting

### Common Issues

#### 1. Containers Won't Start

```bash
# Check container logs
docker-compose logs

# Check resource usage
docker system df

# Recreate containers
docker-compose down
docker-compose up -d --force-recreate
```

#### 2. Database Connection Issues

```bash
# Check database container
docker-compose logs mysql

# Test database connection
docker exec caos-crm-db mysqladmin ping -h localhost -u caos_user -p

# Reset database (CAUTION: Data loss)
docker-compose down -v
docker-compose up -d
```

#### 3. Performance Issues

```bash
# Check container resources
docker stats

# Check disk space
df -h

# Check memory usage
free -h

# Optimize containers
docker system prune -f
```

#### 4. SSL Certificate Issues

```bash
# Check certificate validity
openssl x509 -in deployment/ssl/cert.pem -text -noout

# Test SSL connection
curl -I https://your-domain.com

# Renew Let's Encrypt certificate
sudo certbot renew
```

### Debug Mode

```bash
# Enable debug mode
echo "DEBUG_MODE=true" >> .env.production

# Restart with debug logs
docker-compose restart caos-crm

# View debug logs
docker-compose logs -f caos-crm | grep DEBUG
```

## Maintenance

### Regular Maintenance Tasks

#### Daily
- Monitor system health
- Review error logs
- Check backup completion

#### Weekly
- Update security patches
- Review performance metrics
- Clean log files

#### Monthly
- Full system backup
- Update Docker images
- Security audit

### Update Procedures

```bash
# 1. Backup before update
./deployment/backup.sh

# 2. Pull latest code
git pull origin main

# 3. Update containers
docker-compose pull
docker-compose up -d

# 4. Verify update
./deployment/monitor.sh
```

### Performance Optimization

```bash
# Database optimization
docker exec caos-crm-db mysql -u caos_user -p caos_crm -e "ANALYZE TABLE users, leads, campaigns, products, tasks;"

# Container resource limits
# Edit docker-compose.yml to add:
services:
  caos-crm:
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '0.5'
```

## Support

### Getting Help

1. **Check Logs**: Always start with application and container logs
2. **Health Check**: Run `./deployment/monitor.sh` for system status
3. **Documentation**: Review this guide and inline code comments
4. **Community**: Check project repository for issues and discussions

### Useful Commands

```bash
# Quick status overview
docker-compose ps && ./deployment/monitor.sh

# Full system information
docker system df && docker system events --since 1h

# Container resource usage
docker stats --no-stream

# Application endpoints test
curl -s http://localhost/api/health | jq .
```

### Log Locations

- Application: `docker-compose logs caos-crm`
- Database: `docker-compose logs mysql`
- Web Server: `docker-compose logs nginx`
- System: `logs/monitoring.log`
- Cron: `logs/cron.log`

---

## Quick Reference

### Essential Commands
```bash
# Deploy
./deployment/deploy.sh

# Monitor
./deployment/monitor.sh

# Backup
./deployment/backup.sh

# View logs
docker-compose logs -f

# Restart
docker-compose restart

# Stop/Start
docker-compose down
docker-compose up -d
```

### Default Credentials
- **Admin User**: `admin@caoscrm.com`
- **Admin Password**: `admin123` (⚠️ Change immediately)

### Default URLs
- **Application**: http://localhost
- **Dashboard**: http://localhost/components/dashboard/Dashboard.html
- **Mobile App**: http://localhost/components/mobile/Mobile.html
- **API Health**: http://localhost/api/health

---

*This deployment guide covers the complete production setup of CAOS CRM. For development setup, refer to the README.md file.*
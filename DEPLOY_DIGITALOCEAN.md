# Digital Ocean Deployment Guide for CAOS CRM

## Deployment Options

### Option 1: Docker Droplet (Recommended)

1. **Create a Docker Droplet**
   ```bash
   # Choose: Marketplace > Docker on Ubuntu 22.04
   # Size: Minimum 2GB RAM / 1 vCPU ($12/month)
   # Region: Choose closest to your users
   ```

2. **SSH into your droplet**
   ```bash
   ssh root@your_droplet_ip
   ```

3. **Clone the repository**
   ```bash
   git clone https://github.com/Uptivity/caos.git
   cd caos
   ```

4. **Configure environment**
   ```bash
   cp .env.example .env
   nano .env  # Update all production values
   ```

5. **Run with Docker Compose**
   ```bash
   docker-compose up -d
   ```

6. **Setup SSL (optional but recommended)**
   ```bash
   apt update && apt install certbot
   certbot certonly --standalone -d yourdomain.com
   # Update nginx.conf with SSL certificates
   docker-compose restart nginx
   ```

### Option 2: Digital Ocean App Platform

1. **Fork/Import to GitHub**
   - Repository: https://github.com/Uptivity/caos

2. **Create App in DO App Platform**
   - Source: GitHub repository
   - Type: Web Service
   - Build Command: `npm ci --only=production`
   - Run Command: `node backend/server.js`

3. **Configure Environment Variables**
   ```
   NODE_ENV=production
   PORT=3001
   JWT_SECRET=[generate-secure-key]
   JWT_REFRESH_SECRET=[generate-secure-key]
   DATABASE_URL=[managed-database-url]
   REDIS_URL=[managed-redis-url]
   ```

4. **Add Managed Database**
   - MySQL 8.0
   - Connect to app
   - Run init.sql from deployment/

### Option 3: Kubernetes (DO Managed K8s)

1. **Create Kubernetes cluster**
   ```bash
   doctl kubernetes cluster create caos-crm-cluster
   ```

2. **Apply Kubernetes manifests**
   ```bash
   kubectl apply -f deployment/k8s/
   ```

## Post-Deployment Steps

1. **Verify Health**
   ```bash
   curl http://your-server/api/health
   ```

2. **Create Admin User**
   ```bash
   # Access the app and register first user
   # First user automatically gets admin privileges
   ```

3. **Setup Monitoring**
   - Prometheus metrics: `/api/metrics`
   - Health check: `/api/health`
   - Configure alerts in DO monitoring

4. **Configure Backups**
   ```bash
   # For Docker deployment
   ./deployment/backup.sh

   # Setup cron for automated backups
   crontab -e
   0 2 * * * /root/caos/deployment/backup.sh
   ```

## Security Checklist

- [ ] Change all default passwords in .env
- [ ] Generate strong JWT secrets
- [ ] Enable firewall (ufw or DO firewall)
- [ ] Setup SSL certificates
- [ ] Configure backup retention
- [ ] Enable monitoring alerts
- [ ] Review CORS settings
- [ ] Test rate limiting

## Scaling

- **Vertical**: Resize droplet/increase resources
- **Horizontal**: Use load balancer with multiple app instances
- **Database**: Enable read replicas for MySQL
- **Caching**: Redis is already configured

## Support

For issues or questions:
- GitHub Issues: https://github.com/Uptivity/caos/issues
- Documentation: See README.md and CLAUDE.md
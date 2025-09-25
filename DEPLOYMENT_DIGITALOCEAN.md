# Digital Ocean Deployment Guide for CAOS CRM

This guide provides comprehensive instructions for deploying CAOS CRM to Digital Ocean using App Platform, Droplets, or Kubernetes.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Option 1: App Platform (Recommended)](#option-1-app-platform-recommended)
- [Option 2: Droplet with Docker](#option-2-droplet-with-docker)
- [Option 3: Managed Kubernetes](#option-3-managed-kubernetes)
- [GitHub Actions CI/CD](#github-actions-cicd)
- [Post-Deployment](#post-deployment)

## Prerequisites

1. **Digital Ocean Account**: Sign up at [digitalocean.com](https://digitalocean.com)
2. **Domain Name**: Optional but recommended for production
3. **GitHub Repository**: Push your code to GitHub
4. **Environment Variables**: Prepare your production configuration

## Option 1: App Platform (Recommended)

Digital Ocean App Platform provides the easiest deployment with automatic scaling and managed infrastructure.

### Step 1: Prepare Your Repository

1. Ensure your repository is on GitHub
2. Add a `package.json` in the root directory:

```json
{
  "name": "caos-crm",
  "version": "1.0.0",
  "scripts": {
    "build": "echo 'No build required for static files'",
    "start": "cd backend && npm start"
  },
  "engines": {
    "node": "18.x"
  }
}
```

### Step 2: Create App on Digital Ocean

1. Go to [Digital Ocean App Platform](https://cloud.digitalocean.com/apps)
2. Click "Create App"
3. Choose "GitHub" and authorize Digital Ocean
4. Select your repository: `Uptivity/caos`
5. Select branch: `main`

### Step 3: Configure App Components

#### Backend Service
- **Type**: Web Service
- **Source Directory**: `/backend`
- **Build Command**: `npm install`
- **Run Command**: `npm start`
- **HTTP Port**: 3001
- **Instance Size**: Basic ($5/month) or Professional ($12/month)

#### Static Site (Frontend)
- **Type**: Static Site
- **Source Directory**: `/`
- **Output Directory**: `/`
- **Build Command**: Leave empty

#### Database (MySQL)
- **Add Component**: Database
- **Engine**: MySQL 8
- **Size**: Basic ($15/month) or Professional ($60/month)
- **Name**: `caos-db`

#### Redis Cache
- **Add Component**: Database
- **Engine**: Redis
- **Size**: Basic ($15/month)

### Step 4: Configure Environment Variables

Add these environment variables in App Settings:

```env
NODE_ENV=production
PORT=3001
JWT_SECRET=your-secure-jwt-secret-here

# Database (automatically set by DO)
DATABASE_HOST=${caos-db.HOSTNAME}
DATABASE_PORT=${caos-db.PORT}
DATABASE_NAME=${caos-db.DATABASE}
DATABASE_USER=${caos-db.USERNAME}
DATABASE_PASSWORD=${caos-db.PASSWORD}

# Redis (automatically set by DO)
REDIS_HOST=${redis.HOSTNAME}
REDIS_PORT=${redis.PORT}
REDIS_PASSWORD=${redis.PASSWORD}

# App URLs
APP_URL=https://your-app.ondigitalocean.app
API_URL=https://your-app.ondigitalocean.app/api

# SMTP (optional)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
```

### Step 5: Deploy

1. Click "Next" and review settings
2. Click "Create Resources"
3. Wait for deployment (5-10 minutes)
4. Your app will be available at: `https://your-app-name.ondigitalocean.app`

## Option 2: Droplet with Docker

For more control, deploy to a Droplet using Docker Compose.

### Step 1: Create Droplet

1. Go to [Digital Ocean Droplets](https://cloud.digitalocean.com/droplets)
2. Click "Create Droplet"
3. Choose:
   - **Image**: Ubuntu 22.04 LTS
   - **Plan**: Basic, $12/month (2GB RAM minimum)
   - **Datacenter**: Choose nearest to your users
   - **Authentication**: SSH keys (recommended)
   - **Hostname**: `caos-crm`

### Step 2: Initial Server Setup

SSH into your droplet:

```bash
ssh root@your-droplet-ip
```

Run initial setup:

```bash
# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install Docker Compose
apt install docker-compose -y

# Install Nginx
apt install nginx -y

# Install Certbot for SSL
apt install certbot python3-certbot-nginx -y

# Create app user
adduser --disabled-password --gecos "" caosapp
usermod -aG docker caosapp

# Switch to app user
su - caosapp
```

### Step 3: Clone and Configure

```bash
# Clone repository
git clone https://github.com/Uptivity/caos.git
cd caos

# Create production env file
cp .env.production.template .env
nano .env  # Edit with your configuration

# Create docker override for production
cat > docker-compose.override.yml <<EOF
version: '3.8'

services:
  app:
    restart: always
    environment:
      - NODE_ENV=production

  mysql:
    restart: always
    volumes:
      - mysql_data:/var/lib/mysql

  redis:
    restart: always
    volumes:
      - redis_data:/data

volumes:
  mysql_data:
  redis_data:
EOF
```

### Step 4: Deploy with Docker

```bash
# Build and start services
docker-compose up -d --build

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

### Step 5: Configure Nginx

Create Nginx configuration:

```bash
sudo nano /etc/nginx/sites-available/caos-crm
```

Add configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable site:

```bash
sudo ln -s /etc/nginx/sites-available/caos-crm /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Step 6: Setup SSL

```bash
sudo certbot --nginx -d your-domain.com
```

## Option 3: Managed Kubernetes

For enterprise-scale deployment with Kubernetes.

### Step 1: Create Kubernetes Cluster

1. Go to [Digital Ocean Kubernetes](https://cloud.digitalocean.com/kubernetes)
2. Click "Create Cluster"
3. Choose:
   - **Version**: Latest stable
   - **Datacenter**: Your preferred region
   - **Node Pool**: 2 nodes, $24/month each (minimum)

### Step 2: Install Prerequisites

```bash
# Install kubectl
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
chmod +x kubectl
sudo mv kubectl /usr/local/bin/

# Install Helm
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# Download cluster config
doctl kubernetes cluster kubeconfig save your-cluster-name
```

### Step 3: Create Kubernetes Manifests

Create `k8s/` directory with deployment files:

```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: caos-crm

---
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: caos-crm
  namespace: caos-crm
spec:
  replicas: 3
  selector:
    matchLabels:
      app: caos-crm
  template:
    metadata:
      labels:
        app: caos-crm
    spec:
      containers:
      - name: app
        image: your-registry/caos-crm:latest
        ports:
        - containerPort: 3001
        env:
        - name: NODE_ENV
          value: "production"
        - name: DATABASE_HOST
          valueFrom:
            secretKeyRef:
              name: caos-secrets
              key: db-host

---
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: caos-crm-service
  namespace: caos-crm
spec:
  type: LoadBalancer
  ports:
  - port: 80
    targetPort: 3001
  selector:
    app: caos-crm
```

### Step 4: Deploy to Kubernetes

```bash
# Create namespace
kubectl apply -f k8s/namespace.yaml

# Create secrets
kubectl create secret generic caos-secrets \
  --from-literal=db-host=your-db-host \
  --from-literal=db-password=your-db-password \
  --from-literal=jwt-secret=your-jwt-secret \
  -n caos-crm

# Deploy application
kubectl apply -f k8s/

# Check status
kubectl get pods -n caos-crm
kubectl get services -n caos-crm
```

## GitHub Actions CI/CD

Automate deployment with GitHub Actions.

### Step 1: Create GitHub Action

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Digital Ocean

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: |
          cd backend
          npm ci

      - name: Run tests
        run: |
          cd backend
          npm test

      - name: Run linter
        run: |
          cd backend
          npm run lint || true

  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'

    steps:
      - uses: actions/checkout@v3

      - name: Deploy to Digital Ocean App Platform
        uses: digitalocean/app_action@v2
        with:
          app_name: caos-crm
          token: ${{ secrets.DIGITALOCEAN_ACCESS_TOKEN }}

      # OR for Docker deployment
      - name: Build and push Docker image
        env:
          REGISTRY: registry.digitalocean.com
          IMAGE_NAME: caos-crm
        run: |
          echo ${{ secrets.DIGITALOCEAN_ACCESS_TOKEN }} | docker login $REGISTRY -u ${{ secrets.DIGITALOCEAN_ACCESS_TOKEN }} --password-stdin
          docker build -t $REGISTRY/${{ secrets.DIGITALOCEAN_REGISTRY }}/$IMAGE_NAME:$GITHUB_SHA .
          docker push $REGISTRY/${{ secrets.DIGITALOCEAN_REGISTRY }}/$IMAGE_NAME:$GITHUB_SHA
```

### Step 2: Configure Secrets

In GitHub repository settings, add secrets:

1. Go to Settings > Secrets > Actions
2. Add:
   - `DIGITALOCEAN_ACCESS_TOKEN`: Your DO API token
   - `DIGITALOCEAN_REGISTRY`: Your DO container registry name

### Step 3: Enable Actions

1. Go to Actions tab in your repository
2. Enable GitHub Actions
3. Push to main branch to trigger deployment

## Post-Deployment

### 1. Database Migration

```bash
# SSH into your server or use DO console
cd caos

# Run database migrations
docker-compose exec app npm run migrate

# Or for App Platform, use console:
npm run migrate
```

### 2. Create Admin User

```bash
# Connect to your app
docker-compose exec app node

# Or use DO App Platform console
> const bcrypt = require('bcryptjs');
> const db = require('./config/database');
>
> const adminPassword = await bcrypt.hash('your-admin-password', 12);
> await db.query(
>   'INSERT INTO users (email, password, role) VALUES (?, ?, ?)',
>   ['admin@example.com', adminPassword, 'admin']
> );
```

### 3. Configure Monitoring

1. **Enable Monitoring in DO**:
   - Go to your app/droplet
   - Click "Monitoring"
   - Enable enhanced monitoring

2. **Setup Alerts**:
   - CPU usage > 80%
   - Memory usage > 80%
   - Response time > 1s
   - Error rate > 1%

3. **Configure Logging**:
   ```bash
   # For App Platform, logs are automatic

   # For Droplet, setup log aggregation:
   docker-compose logs -f > /var/log/caos-crm/app.log
   ```

### 4. Configure Backups

1. **Database Backups**:
   - In DO, go to Databases
   - Enable automated backups
   - Set retention period (7-30 days)

2. **Application Backups**:
   ```bash
   # Create backup script
   cat > /home/caosapp/backup.sh <<EOF
   #!/bin/bash
   DATE=$(date +%Y%m%d_%H%M%S)
   docker-compose exec mysql mysqldump -u root -p\$MYSQL_ROOT_PASSWORD caos_crm > backups/db_\$DATE.sql
   tar -czf backups/files_\$DATE.tar.gz uploads/
   # Upload to DO Spaces
   s3cmd put backups/db_\$DATE.sql s3://your-space/backups/
   EOF

   chmod +x /home/caosapp/backup.sh

   # Add to crontab
   crontab -e
   # Add: 0 2 * * * /home/caosapp/backup.sh
   ```

### 5. Setup CDN (Optional)

1. Go to Spaces > Create Space
2. Enable CDN
3. Update frontend to use CDN URLs for static assets

### 6. Configure Custom Domain

1. **Add Domain to Digital Ocean**:
   - Go to Networking > Domains
   - Add your domain
   - Point nameservers to DO

2. **Configure DNS**:
   - Add A record pointing to your app/droplet IP
   - Add CNAME for www subdomain

3. **Update App Settings**:
   - In App Platform or Nginx config
   - Add your custom domain

## Monitoring & Maintenance

### Health Checks

Your app includes built-in health checks:
- `https://your-domain.com/api/health` - Basic health
- `https://your-domain.com/api/health/ready` - Readiness
- `https://your-domain.com/api/metrics` - Prometheus metrics

### Scaling

**App Platform**:
- Automatic scaling based on metrics
- Configure in App Settings > Scaling

**Droplet**:
- Vertical: Resize droplet
- Horizontal: Add load balancer + more droplets

**Kubernetes**:
- Configure HPA (Horizontal Pod Autoscaler)
- `kubectl autoscale deployment caos-crm --min=2 --max=10 --cpu-percent=80`

### Security Updates

```bash
# Regular updates
apt update && apt upgrade -y

# Docker updates
docker-compose pull
docker-compose up -d

# Node dependencies
cd backend && npm audit fix
```

## Troubleshooting

### Common Issues

1. **502 Bad Gateway**:
   - Check if app is running: `docker-compose ps`
   - Check logs: `docker-compose logs app`
   - Verify port configuration

2. **Database Connection Failed**:
   - Verify environment variables
   - Check database is running
   - Test connection manually

3. **High Memory Usage**:
   - Check for memory leaks: `docker stats`
   - Increase swap: `fallocate -l 4G /swapfile`
   - Scale horizontally

### Support Resources

- [Digital Ocean Documentation](https://docs.digitalocean.com)
- [Digital Ocean Community](https://www.digitalocean.com/community)
- [GitHub Issues](https://github.com/Uptivity/caos/issues)

---

## Cost Estimation

### App Platform (Recommended)
- **Basic**: ~$27/month
  - App: $5
  - Database: $15
  - Redis: $7

- **Professional**: ~$87/month
  - App: $12 x 2 instances
  - Database: $60
  - Redis: $15

### Droplet + Managed Database
- **Basic**: ~$42/month
  - Droplet: $12 (2GB)
  - Database: $15
  - Backups: $2
  - Snapshots: $1

- **Professional**: ~$135/month
  - Droplet: $48 (8GB)
  - Database: $60
  - Redis: $15
  - Load Balancer: $12

### Kubernetes
- **Minimum**: ~$84/month
  - 2 nodes: $24 x 2
  - Load Balancer: $12
  - Database: $15
  - Container Registry: $5

---

**Deployment Complete!** 🚀

Your CAOS CRM is now running on Digital Ocean. Access it at your configured domain or the provided Digital Ocean URL.
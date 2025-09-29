# CI/CD Setup Instructions

## Current Status
✅ **CI Pipeline Active**: Tests, linting, and Docker build validation
❌ **CD Pipeline Disabled**: Requires secrets configuration

## GitHub Secrets Required for Full Deployment

To enable the full CI/CD pipeline with deployment, configure these secrets in your GitHub repository:

### Repository Settings > Secrets and Variables > Actions

#### Digital Ocean Secrets
```
DIGITALOCEAN_ACCESS_TOKEN     # Your DO API token
DIGITALOCEAN_REGISTRY_NAME    # Your DO container registry name
```

#### Droplet Deployment (Optional)
```
DROPLET_HOST                  # IP address of your droplet
DROPLET_USER                  # SSH username (usually root)
DROPLET_SSH_KEY              # Private SSH key for droplet access
```

#### Kubernetes Deployment (Optional)
```
K8S_CLUSTER_NAME             # Name of your DO Kubernetes cluster
```

## Enabling Deployment Workflows

Once secrets are configured, edit `.github/workflows/deploy.yml`:

### 1. Enable Docker Build
```yaml
# Change line 57 from:
if: github.event_name == 'push' && false
# To:
if: github.event_name == 'push'
```

### 2. Enable App Platform Deployment
```yaml
# Change line 102 from:
if: github.ref == 'refs/heads/main' && false
# To:
if: github.ref == 'refs/heads/main'
```

### 3. Enable Health Checks
```yaml
# Change line 176 from:
if: github.ref == 'refs/heads/main' && false
# To:
if: github.ref == 'refs/heads/main'
```

### 4. Update Notification Dependencies
```yaml
# Change line 201 from:
needs: [test]
# To:
needs: [health-check]
```

## Deployment Options

### Option 1: Digital Ocean App Platform (Recommended)
- Automatic deployment from GitHub
- Managed database and Redis
- SSL certificates included
- Auto-scaling

### Option 2: Docker Droplet
- Manual server management
- Docker Compose deployment
- Custom SSL setup required
- Fixed resources

### Option 3: Kubernetes
- Enterprise-grade scaling
- Advanced monitoring
- Complex setup required
- Higher costs

## Testing the Pipeline

1. **Local Testing**
   ```bash
   cd backend
   npm test
   npm run lint
   npm audit
   ```

2. **Docker Testing**
   ```bash
   docker build -t caos-crm .
   docker run -p 3001:3001 caos-crm
   ```

3. **GitHub Actions Testing**
   - Push changes to `main` or `develop` branch
   - Check Actions tab for build status
   - Review logs for any failures

## Monitoring

Once deployed, monitor your application:

- **Health Endpoint**: `https://your-app.com/api/health`
- **Metrics**: `https://your-app.com/api/metrics`
- **Logs**: Check Digital Ocean App Platform logs

## Troubleshooting

### Common Issues

1. **Test Failures**
   - Check database connection in tests
   - Verify environment variables
   - Review test output in Actions tab

2. **Docker Build Failures**
   - Check Dockerfile syntax
   - Verify file paths and permissions
   - Review build logs

3. **Deployment Failures**
   - Verify all secrets are set correctly
   - Check Digital Ocean account permissions
   - Review deployment logs

### Getting Help

- GitHub Issues: https://github.com/Uptivity/caos/issues
- Digital Ocean Docs: https://docs.digitalocean.com/
- Docker Docs: https://docs.docker.com/

## Security Best Practices

- Rotate access tokens regularly
- Use least-privilege access for secrets
- Monitor deployment logs for anomalies
- Keep dependencies updated
- Enable branch protection rules
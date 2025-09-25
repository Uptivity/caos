# CAOS CRM Performance Monitoring & Alerting System

## Overview

The CAOS CRM backend now includes a comprehensive performance monitoring and alerting system designed to provide visibility into application performance, system health, and proactive issue detection.

## Features

### 🗂️ Structured Logging
- **Winston-based JSON logging** with configurable levels
- **Sensitive data sanitization** for security compliance
- **Request tracking** with unique request IDs
- **Performance timing** for all operations
- **File rotation** and retention policies

### 📊 Performance Monitoring
- **Real-time API response time tracking**
- **Database query performance monitoring**
- **Core Web Vitals** equivalent metrics
- **Request/response size tracking**
- **Error rate monitoring**

### 📈 Prometheus Metrics
- **HTTP request metrics** (duration, count, size)
- **Database performance metrics**
- **System resource metrics** (memory, CPU, connections)
- **Business metrics** (authentication events, business operations)
- **Custom metrics** support

### 🏥 Health Monitoring
- **Comprehensive health checks** (database, memory, CPU, disk)
- **Readiness and liveness probes**
- **Health history tracking**
- **Dependency health monitoring**

### 🚨 Alerting System
- **Configurable thresholds** for all monitored metrics
- **Multiple notification channels** (email, webhook, Slack)
- **Alert suppression** to prevent spam
- **Alert history and statistics**

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

All monitoring dependencies are included in package.json:
- `winston` - Structured logging
- `prom-client` - Prometheus metrics
- `response-time` - Response time tracking

### 2. Configure Environment
Copy the monitoring configuration example:
```bash
cp .env.monitoring.example .env
```

Edit `.env` with your specific configuration:
```bash
# Basic setup
LOG_LEVEL=info
SLOW_REQUEST_THRESHOLD=1000
ERROR_RATE_WARNING_THRESHOLD=5.0

# Enable Slack alerts (optional)
ENABLE_SLACK_ALERTS=true
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
SLACK_CHANNEL=#alerts
```

### 3. Start the Server
```bash
npm start
```

The server will start with all monitoring features enabled.

## Monitoring Endpoints

### Health Checks
- `GET /api/health` - Comprehensive health check
- `GET /api/health/ready` - Kubernetes readiness probe
- `GET /api/health/live` - Kubernetes liveness probe
- `GET /api/health?check=database` - Specific health check

### Metrics
- `GET /api/metrics` - Prometheus metrics endpoint
- `GET /api/performance` - Performance summary and Core Web Vitals

### Alerts
- `GET /api/alerts/active` - Current active alerts
- `GET /api/alerts/history` - Alert history
- `GET /api/alerts/stats` - Alert statistics
- `POST /api/alerts/:alertId/resolve` - Resolve an alert

## Configuration

### Log Levels
- `error` - Only errors
- `warn` - Warnings and errors
- `info` - General information (recommended for production)
- `http` - HTTP request logs
- `verbose` - Detailed operational information
- `debug` - Debug information (development only)
- `silly` - Everything

### Performance Thresholds
```bash
SLOW_REQUEST_THRESHOLD=1000      # ms - API requests
SLOW_QUERY_THRESHOLD=100         # ms - Database queries
ERROR_RATE_WARNING_THRESHOLD=5.0 # % - HTTP error rate
```

### Alert Thresholds
```bash
# Response Times
RESPONSE_TIME_WARNING_THRESHOLD=1000   # ms
RESPONSE_TIME_CRITICAL_THRESHOLD=2000  # ms

# System Resources
MEMORY_WARNING_THRESHOLD=80            # %
MEMORY_CRITICAL_THRESHOLD=90           # %
CPU_WARNING_THRESHOLD=75               # %
CPU_CRITICAL_THRESHOLD=90              # %

# Database
DB_CONNECTION_WARNING_THRESHOLD=80     # %
DB_CONNECTION_CRITICAL_THRESHOLD=90    # %
```

## Monitoring Integration

### Prometheus Integration
The system exposes Prometheus-compatible metrics at `/api/metrics`:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'caos-crm-backend'
    static_configs:
      - targets: ['localhost:3001']
    metrics_path: '/api/metrics'
    scrape_interval: 15s
```

### Grafana Dashboard
Example dashboard configuration is available in the `monitoring/` directory.

### Kubernetes Deployment
```yaml
apiVersion: v1
kind: Service
metadata:
  name: caos-crm-backend
  annotations:
    prometheus.io/scrape: 'true'
    prometheus.io/path: '/api/metrics'
    prometheus.io/port: '3001'

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: caos-crm-backend
spec:
  template:
    spec:
      containers:
      - name: caos-crm-backend
        livenessProbe:
          httpGet:
            path: /api/health/live
            port: 3001
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /api/health/ready
            port: 3001
          initialDelaySeconds: 5
          periodSeconds: 5
```

## Alert Notifications

### Slack Integration
```bash
ENABLE_SLACK_ALERTS=true
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
SLACK_CHANNEL=#alerts
```

### Email Alerts
```bash
ENABLE_EMAIL_ALERTS=true
ALERT_EMAIL_FROM=alerts@company.com
ALERT_EMAIL_TO=admin@company.com,ops@company.com
```

### Webhook Integration
```bash
ENABLE_WEBHOOK_ALERTS=true
ALERT_WEBHOOK_URL=https://your-alerting-system.com/webhook
```

## Performance Metrics

### Core Web Vitals Equivalent
- **Average Response Time** - Equivalent to Largest Contentful Paint (LCP)
- **Response Time Percentiles** - P50, P75, P95, P99
- **Error Rate** - Stability metric
- **Request Volume** - Traffic analysis

### Database Performance
- **Query Execution Time** - Per query type and table
- **Connection Pool Usage** - Pool utilization and queue length
- **Slow Query Detection** - Configurable thresholds

### System Resources
- **Memory Usage** - Heap and system memory
- **CPU Utilization** - Load average and process usage
- **Disk Space** - Available storage
- **Network I/O** - Request/response sizes

## Alert Types

### Performance Alerts
- High API response times
- High error rates
- Slow database queries
- High resource usage

### System Alerts
- Database connection issues
- Memory exhaustion
- High CPU usage
- Disk space warnings

### Security Alerts
- Failed authentication attempts
- Rate limit violations
- Suspicious activity patterns

### Business Alerts
- API usage anomalies
- Critical business operation failures

## Troubleshooting

### High Memory Usage
1. Check `/api/health` for memory metrics
2. Review application logs for memory leaks
3. Monitor garbage collection metrics in Prometheus

### Slow Database Queries
1. Check `/api/performance` for slow query statistics
2. Review database query logs
3. Consider adding indexes or optimizing queries

### Alert Fatigue
1. Adjust alert thresholds in `.env`
2. Increase `ALERT_SUPPRESSION_WINDOW`
3. Review and resolve recurring alerts

### Missing Metrics
1. Verify Prometheus configuration
2. Check `/api/metrics` endpoint accessibility
3. Review application logs for metric collection errors

## Security Considerations

### Metrics Security
- Consider IP whitelisting for monitoring endpoints
- Use authentication tokens for sensitive metrics
- Avoid exposing monitoring endpoints publicly

### Data Privacy
- All sensitive data is automatically sanitized in logs
- Personal information is masked in monitoring data
- Database queries are sanitized for logging

## Production Recommendations

### Resource Allocation
- **Memory**: Minimum 512MB for monitoring overhead
- **CPU**: 10-15% additional CPU usage expected
- **Disk**: 1-5GB for log storage and metrics

### Configuration
```bash
# Production optimized settings
LOG_LEVEL=info
SLOW_REQUEST_THRESHOLD=800
ERROR_RATE_WARNING_THRESHOLD=3.0
RESPONSE_TIME_WARNING_THRESHOLD=800
ALERT_CHECK_INTERVAL=30000  # 30 seconds
METRICS_RETENTION=86400000  # 24 hours
```

### Monitoring Retention
- **Logs**: 30 days (configured in Winston)
- **Metrics**: 24 hours (in-memory, use Prometheus for long-term storage)
- **Alerts**: 7 days history

## API Usage Examples

### Check System Health
```bash
curl http://localhost:3001/api/health
```

### Get Performance Metrics
```bash
curl http://localhost:3001/api/performance
```

### View Active Alerts
```bash
curl http://localhost:3001/api/alerts/active
```

### Get Prometheus Metrics
```bash
curl http://localhost:3001/api/metrics
```

## Support

For questions or issues with the monitoring system:

1. Check application logs at `/logs/` directory (production)
2. Review monitoring endpoint responses
3. Verify environment configuration
4. Check alert history for patterns

The monitoring system is designed to be lightweight and non-intrusive while providing comprehensive visibility into your CAOS CRM system's performance and health.
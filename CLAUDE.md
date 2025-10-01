# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
# Backend server
cd backend
npm install          # Install dependencies
npm start            # Run server on port 3001
npm run dev          # Run with nodemon (auto-restart)

# Frontend
# Open components/dashboard/Dashboard.html in browser
```

### Testing
```bash
cd backend
npm test                    # Run all tests
npm run test:watch          # Watch mode
npm run test:coverage       # Generate coverage report
npm test -- auth.test.js    # Run specific test file
```

### Linting & Security
```bash
cd backend
npm run lint                # Check code style
npm run lint:fix            # Auto-fix linting issues
npm run security:audit      # Check for vulnerabilities
npm run security:fix        # Auto-fix vulnerabilities
```

### Docker Deployment
```bash
docker-compose up -d        # Start all services (app, MySQL, Redis, Nginx)
docker-compose down         # Stop all services
docker-compose logs -f      # View logs
docker-compose ps           # Check service status
```

## Architecture Overview

### Multi-Layer Architecture
- **Frontend**: Vanilla JavaScript + HTML5 + SnowUI CSS framework (no build step)
- **Backend**: Express.js REST API with JWT authentication
- **Data Layer**: MySQL 8.0 (production) with in-memory fallback (development)
- **Cache**: Redis 7 for session storage
- **Reverse Proxy**: Nginx (production)

### Key Backend Components

#### Services Layer (`backend/services/`)
Business logic is centralized in service classes:
- **AuthService.js**: User authentication, JWT token management, password hashing
- **DatabaseService.js**: Database connection pooling, query execution, health checks
- **GDPRService.js**: Data export (JSON/CSV/XML), right to be forgotten
- **ConsentService.js**: Cookie/marketing consent tracking
- **DataRetentionService.js**: Automated data cleanup policies
- **LeadsService.js**: Lead management business logic

#### Middleware Stack (`backend/middleware/`)
Request processing pipeline includes:
1. **Security**: Helmet.js (CSP, XSS protection), CORS
2. **Rate Limiting**: 5 requests/15min (auth), 100 requests/15min (general)
3. **PII Protection**: Sanitizes logs to remove sensitive data (passwords, tokens, SSN)
4. **Performance Monitoring**: Tracks request duration, slow queries
5. **Metrics Collection**: Prometheus-compatible metrics
6. **Health Monitoring**: Checks database, Redis, memory, disk
7. **Alerting**: Configurable thresholds for errors, latency, memory

#### Authentication Flow
1. User registers/logs in via `/api/auth/register` or `/api/auth/login`
2. AuthService validates credentials with bcrypt (12 rounds)
3. JWT tokens issued (access + refresh) with configurable expiry
4. Protected routes use `authMiddleware.js` to verify JWT
5. Tokens stored client-side; refresh endpoint extends sessions

#### Database Architecture
- **Connection**: MySQL2 connection pooling (10 connections default)
- **Initialization**: `backend/config/database.js` manages pool lifecycle
- **Fallback Mode**: In-memory storage when MySQL unavailable (development only)
- **Health Checks**: Periodic connection tests, automatic reconnection
- **Schema**: SQL initialization script at `deployment/init.sql`

### API Routing Structure
All routes mounted in `backend/server.js`:
```
/api/auth/*         - Authentication (register, login, refresh, logout)
/api/leads/*        - Lead management (CRUD, import, export)
/api/campaigns/*    - Marketing campaigns
/api/products/*     - Product catalog
/api/tasks/*        - Task management
/api/calendar/*     - Events and scheduling
/api/email/*        - Email integration
/api/reports/*      - Analytics and reporting
/api/teams/*        - Team collaboration
/api/documents/*    - Document storage
/api/gdpr/*         - GDPR compliance endpoints
/api/health         - Health check
/api/health/ready   - Readiness probe (K8s)
/api/health/live    - Liveness probe (K8s)
/api/metrics        - Prometheus metrics
```

### Monitoring & Observability

#### Logging (Winston)
- **Structured JSON logs** with correlation IDs
- **PII Protection**: Automatically redacts passwords, tokens, credit cards, SSNs
- **Log Levels**: error, warn, info, debug
- **Outputs**: Console + file (`logs/combined.log`, `logs/error.log`)

#### Metrics (Prometheus)
Exposed at `/api/metrics`:
- HTTP request duration histogram
- Total requests counter by method/route/status
- Active connections gauge
- Database query duration
- Error rate by type

#### Health Checks
Three endpoints for different use cases:
- `/api/health`: Overall system health (database, Redis, disk, memory)
- `/api/health/ready`: Readiness for traffic (K8s readiness probe)
- `/api/health/live`: Process liveness (K8s liveness probe)

### GDPR Compliance Architecture
Implements EU data privacy regulations:
- **Article 20 (Data Portability)**: `/api/gdpr/export` returns user data in JSON/CSV/XML
- **Article 17 (Right to Erasure)**: `/api/gdpr/delete` anonymizes/removes user data
- **Consent Management**: Tracks marketing/analytics/functional consent per user
- **Audit Trails**: All data access logged with timestamps, IP, user ID
- **Data Retention**: Configurable policies auto-delete old data

### Testing Infrastructure
- **Framework**: Jest with Supertest for API testing
- **Test Structure**: `backend/__tests__/` directory
- **Mock Data**: `setup.js` provides test fixtures
- **Coverage Targets**: 80%+ for production-ready modules
- **Test Types**: Unit (services), integration (routes), security (vulnerabilities)

### Environment Configuration
Required environment variables:
```bash
# Database
DB_HOST=localhost
DB_PORT=3306
DB_NAME=caos_crm
DB_USER=caos_user
DB_PASSWORD=changeme123

# Authentication
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_REFRESH_SECRET=your-refresh-secret-key

# Server
PORT=3001
NODE_ENV=production
CORS_ORIGIN=http://localhost:3000

# Rate Limiting
RATE_LIMIT_WINDOW=900000  # 15 minutes in ms
RATE_LIMIT_MAX=100
```

### Frontend Architecture
- **Entry Point**: `components/dashboard/Dashboard.html`
- **No Build Step**: Pure vanilla JS, served as static files
- **CSS Framework**: SnowUI (`styles/` directory)
- **PWA**: Service worker for offline support
- **Accessibility**: WCAG AA compliant, keyboard navigation, ARIA labels
- **Module Pattern**: Each business module has its own component directory

### Error Handling Pattern
1. Services throw descriptive errors with HTTP status codes
2. Route handlers catch errors and return JSON responses
3. Global error middleware logs and sanitizes error details
4. PII protection middleware prevents sensitive data leakage
5. Client receives safe error messages without internal details

### Security Layers
1. **Transport**: HTTPS/TLS in production (Nginx)
2. **Headers**: Helmet.js sets secure HTTP headers
3. **Authentication**: JWT with refresh tokens
4. **Authorization**: Role-based access control (RBAC) ready
5. **Input Validation**: Express-validator on all routes
6. **Rate Limiting**: IP-based throttling
7. **Password Storage**: Bcrypt with 12 rounds
8. **Audit Logging**: All sensitive operations tracked

## Important Notes
- **Legacy Code**: `old/` directory is gitignored - do not use
- **Database Fallback**: System uses in-memory storage if MySQL unavailable (dev only)
- **Test Coverage**: AuthService has 91.52% coverage - maintain this standard for new modules
- **Logging Best Practices**: Always use `logger` from `utils/logger.js`, never `console.log`
- **Middleware Order**: Security → Rate Limiting → Body Parsing → PII Protection → Routes
- **GDPR Compliance**: All user data operations must include audit logging

## Deployment Lessons Learned (Sep 2025)

### Critical Issues Found During Production Deployment

**Issue #1: Missing Module Exports**
- **Problem**: `backend/reports/reportsRoutes.js` was missing `module.exports = router;` at the end
- **Symptom**: Express received `undefined` instead of router, causing crash on startup with error: `Router.use() requires a middleware function but got a Object`
- **Fix**: Always verify all route files export their router
- **Prevention**: Add linting rule or test to verify module exports

**Issue #2: Middleware Binding Bug**
- **Problem**: PII Protection middleware (`backend/middleware/piiProtectionMiddleware.js`) had incorrect `this` binding when overriding `res.json()`
- **Code**: Used `.bind(this)` which broke Express's internal response object context
- **Symptom**: Health check endpoint crashed with `Cannot read properties of undefined (reading 'get')`
- **Fix**: Store middleware instance in closure variable (`const self = this`) and explicitly use `res` for response context
- **Prevention**: Test all middleware with various response methods

**Issue #3: HTTPS Not Configured for Cloudflare**
- **Problem**: Nginx HTTPS server block was commented out, causing Cloudflare Full (strict) SSL mode to fail with HTTP 521/526 errors
- **Symptom**: Website showed "Web server is down" when accessed via HTTPS
- **Fix**: Enable HTTPS server block in Nginx with Cloudflare Origin Certificate
- **Prevention**: Document SSL/TLS requirements in deployment guide

### Pre-Deployment Checklist

Before deploying to production, ensure:

1. **Code Verification**
   - [ ] All route files have `module.exports = router;` at the end
   - [ ] Run `npm test` and verify all tests pass
   - [ ] Run `npm run lint` and fix all errors
   - [ ] Test application locally with `npm start` before Docker build

2. **Docker Testing**
   - [ ] Build Docker image locally: `docker-compose build`
   - [ ] Test full stack locally: `docker-compose up`
   - [ ] Verify all containers start without crashes: `docker ps`
   - [ ] Check logs for errors: `docker-compose logs`
   - [ ] Test API endpoints: `curl http://localhost/api/health`

3. **Configuration Review**
   - [ ] Verify `.env` file has all required variables
   - [ ] Check database connection settings match docker-compose services
   - [ ] Ensure Nginx configuration includes both HTTP (80) and HTTPS (443)
   - [ ] Verify SSL certificates are present if using HTTPS

4. **Security Configuration**
   - [ ] Change default passwords in `.env`
   - [ ] Use strong JWT secrets (minimum 64 characters)
   - [ ] Configure Cloudflare SSL/TLS mode (Full or Full strict)
   - [ ] Set up Cloudflare Origin Certificate for Full (strict) mode

5. **Post-Deployment Verification**
   - [ ] Check all containers are running: `docker ps`
   - [ ] Test health endpoint: `curl https://yourdomain.com/api/health`
   - [ ] Verify database connectivity in health check response
   - [ ] Monitor logs for first 10 minutes: `docker-compose logs -f`

### Common Deployment Errors

**"Router.use() requires a middleware function but got a Object"**
- **Cause**: Route file missing `module.exports = router;`
- **Solution**: Add export statement to all route files

**"Cannot read properties of undefined (reading 'get')"**
- **Cause**: Middleware binding issue with `res` object
- **Solution**: Use closure variables instead of `.bind(this)` for middleware context

**"Web Server Is Down" (HTTP 521/526)**
- **Cause**: Cloudflare cannot connect to origin server via HTTPS
- **Solution**: Enable HTTPS in Nginx and configure SSL certificate

**Container keeps restarting**
- **Cause**: Application crashes immediately on startup
- **Solution**: Check logs with `docker logs <container-name>` to find root cause
- **Common causes**: Missing exports, syntax errors, configuration errors

### Testing Middleware Properly

When writing custom middleware:
```javascript
// BAD - breaks response context
res.json = function(obj) {
    const sanitized = this.sanitize(obj);
    return originalJson.call(this, sanitized);
}.bind(this);

// GOOD - preserves response context
const self = this;
res.json = function(obj) {
    const sanitized = self.sanitize(obj);
    return originalJson.call(res, sanitized);
};
```

### SSL/TLS Configuration for Cloudflare

**Option 1: Full mode (self-signed certificate)**
- Generate self-signed cert on server
- Set Cloudflare SSL/TLS to "Full"
- Less secure but quick setup

**Option 2: Full (strict) mode (recommended)**
- Generate Cloudflare Origin Certificate in dashboard
- Install on server in `/deployment/ssl/`
- Set Cloudflare SSL/TLS to "Full (strict)"
- Most secure option
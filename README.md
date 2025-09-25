# CAOS CRM - Enterprise Customer Relationship Management System

[![Production Ready](https://img.shields.io/badge/Status-Production%20Ready-green)](https://github.com/Uptivity/caos)
[![Quality Score](https://img.shields.io/badge/Quality-95%25-brightgreen)](https://github.com/Uptivity/caos)
[![WCAG AA](https://img.shields.io/badge/Accessibility-WCAG%20AA-blue)](https://github.com/Uptivity/caos)
[![GDPR Compliant](https://img.shields.io/badge/GDPR-Compliant-blue)](https://github.com/Uptivity/caos)

A comprehensive, production-ready CRM system built with modern web technologies, featuring enterprise-grade security, monitoring, and compliance.

## 🚀 Features

- **240+ API Endpoints** - Complete business functionality
- **18 Business Modules** - Leads, Campaigns, Tasks, Calendar, Email, Documents, and more
- **Enterprise Security** - JWT authentication, rate limiting, audit trails
- **GDPR Compliant** - Full data privacy rights implementation
- **WCAG AA Accessible** - Complete keyboard navigation and screen reader support
- **Real-time Monitoring** - Prometheus metrics, health checks, alerting
- **Mobile Ready** - Progressive Web App with offline support
- **Docker Deployment** - Production-ready containerization

## 🛠️ Tech Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript, PWA
- **Backend**: Node.js, Express.js
- **Database**: MySQL 8.0
- **Cache**: Redis 7
- **Container**: Docker & Docker Compose
- **Monitoring**: Winston, Prometheus

## 📦 Quick Start

### Prerequisites

- Node.js 18+
- MySQL 8.0
- Redis 7
- Docker (optional)

### Development Setup

```bash
# Clone the repository
git clone https://github.com/Uptivity/caos.git
cd caos

# Install backend dependencies
cd backend
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Start the backend server
npm start  # Runs on http://localhost:3001

# Open frontend in browser
# Open components/dashboard/Dashboard.html
```

### Production with Docker

```bash
# Build and run with Docker Compose
docker-compose up -d

# Application will be available at:
# - Frontend: http://localhost
# - Backend API: http://localhost/api
# - Health Check: http://localhost/api/health
# - Metrics: http://localhost/api/metrics
```

## 🔐 Security

- JWT authentication with secure secret management
- Rate limiting (5 auth/15min, 100 general/15min)
- Bcrypt password hashing (12 rounds)
- PII protection in logging
- Comprehensive audit trails
- CORS and Helmet.js protection

## 📊 API Documentation

The API follows RESTful conventions with the following structure:

- `/api/auth/*` - Authentication endpoints
- `/api/leads/*` - Lead management
- `/api/campaigns/*` - Campaign management
- `/api/tasks/*` - Task management
- `/api/calendar/*` - Calendar and events
- `/api/documents/*` - Document management
- `/api/teams/*` - Team collaboration
- `/api/gdpr/*` - Privacy and compliance
- `/api/health` - Health monitoring
- `/api/metrics` - Prometheus metrics

## 🧪 Testing

```bash
# Run test suite
cd backend
npm test

# Run with coverage
npm run test:coverage

# Run specific tests
npm test -- auth.test.js
```

## 📈 Monitoring

- **Health Checks**: `/api/health`, `/api/health/ready`, `/api/health/live`
- **Metrics**: Prometheus format at `/api/metrics`
- **Logging**: Structured JSON logs with Winston
- **Alerts**: Configurable thresholds and notifications

## ♿ Accessibility

- WCAG AA compliant
- Full keyboard navigation
- Screen reader optimized
- High contrast mode support
- Focus management

## 🔒 GDPR Compliance

- User data export (JSON/CSV/XML)
- Right to be forgotten
- Consent management
- Audit trails
- Data retention policies

## 📝 Documentation

- [Deployment Guide](DEPLOYMENT.md)
- [API Documentation](docs/API.md)
- [Security Guide](docs/SECURITY.md)
- [Contributing Guide](CONTRIBUTING.md)

## 🚀 Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment instructions including:
- Digital Ocean deployment
- AWS deployment
- Docker deployment
- Kubernetes deployment

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

Built with ❤️ by [Uptivity](https://github.com/Uptivity)

---

**Status**: Production Ready | **Version**: 1.0.0 | **Last Updated**: January 2025

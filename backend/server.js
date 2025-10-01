// CAOS CRM Backend Server - Main Entry Point
// Module 04: Auth Backend Implementation

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { logger } = require('./utils/logger');
const { performanceMonitor } = require('./middleware/performanceMiddleware');
const { metricsCollector } = require('./middleware/metricsMiddleware');
const { healthMonitor } = require('./middleware/healthMiddleware');
const { alertingSystem } = require('./middleware/alertingMiddleware');

// GDPR Compliance imports
const GDPRService = require('./services/GDPRService');
const ConsentService = require('./services/ConsentService');
const DataRetentionService = require('./services/DataRetentionService');
const AuditLogger = require('./utils/AuditLogger');
const { requestLoggingProtection, responseSanitization } = require('./middleware/piiProtectionMiddleware');

require('dotenv').config();

// Initialize database connection
const database = require('./config/database');
database.initialize().catch(error => {
    logger.error('CRITICAL: Database initialization failed', {
        error: error.message,
        stack: error.stack,
        fatal: true
    });
    process.exit(1);
});

// Initialize GDPR services
const initializeGDPRServices = async () => {
    try {
        await GDPRService.initialize();
        await ConsentService.initialize();
        await DataRetentionService.initialize();
        await AuditLogger.initialize();
        logger.info('GDPR compliance services initialized successfully');
    } catch (error) {
        logger.error('GDPR services initialization failed', {
            error: error.message,
            stack: error.stack
        });
        // Don't exit - allow app to continue with limited GDPR functionality
    }
};

// Initialize GDPR services after database
initializeGDPRServices();

const { router: authRouter, generalLimiter } = require('./auth/auth');
const leadRouter = require('./leads/leadRoutes');
const campaignRouter = require('./campaigns/campaignRoutes');
const productRouter = require('./products/productRoutes');
const settingsRouter = require('./settings/settingsRoutes');
const analyticsRouter = require('./analytics/analyticsRoutes');
const tasksRouter = require('./tasks/tasksRoutes');
// const calendarRouter = require('./calendar/calendarRoutes'); // Temporarily disabled due to syntax errors
const emailRouter = require('./email/emailRoutes');
const reportsRouter = require('./reports/reportsRoutes');
const teamsRouter = require('./teams/teamsRoutes');
const documentsRouter = require('./documents/documentsRoutes');
const mobileRouter = require('./mobile/mobileRoutes');
const gdprRouter = require('./routes/gdprRoutes');

const app = express();
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Trust proxy - required for rate limiting behind nginx
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
        },
    },
    crossOriginEmbedderPolicy: false
}));

// CORS configuration
const corsOptions = {
    origin: process.env.FRONTEND_URL || ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));

// GDPR PII Protection Middleware (must be early in pipeline)
app.use(requestLoggingProtection({
    logBody: false, // Don't log request bodies by default
    logQuery: true,
    logHeaders: false,
    maskingChar: '*',
    partialMasking: true
}));

// Performance monitoring middleware
app.use(performanceMonitor.createMiddleware());

// Metrics collection middleware
app.use(metricsCollector.createMiddleware());

// General middleware
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// GDPR Response Sanitization
app.use(responseSanitization({
    sanitizeResponses: true,
    maskingChar: '*',
    partialMasking: false,
    excludeRoutes: [/^\/api\/gdpr\/export\/.*\/download$/] // Don't sanitize export downloads
}));

// Logging
const morganFormat = NODE_ENV === 'production' ? 'combined' : 'dev';
app.use(morgan(morganFormat, {
    stream: {
        write: (message) => {
            logger.http(message.trim());
        }
    }
}));

// Apply general rate limiting to all requests
app.use(generalLimiter);

// API routes
app.use('/api/auth', authRouter);
app.use('/api/leads', leadRouter);
app.use('/api/campaigns', campaignRouter);
app.use('/api/products', productRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/tasks', tasksRouter);
// app.use('/api/calendar', calendarRouter); // Temporarily disabled due to syntax errors
app.use('/api/email', emailRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/teams', teamsRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/mobile', mobileRouter);
app.use('/api/gdpr', gdprRouter);

// Enhanced health check endpoints
app.get('/api/health', healthMonitor.createHealthEndpoint());
app.get('/api/health/ready', healthMonitor.createReadinessEndpoint());
app.get('/api/health/live', healthMonitor.createLivenessEndpoint());

// Metrics endpoint for Prometheus
app.get('/api/metrics', async (req, res) => {
    try {
        const metrics = await metricsCollector.getMetrics();
        res.set('Content-Type', 'text/plain');
        res.send(metrics);
    } catch (error) {
        logger.error('Metrics endpoint error', { error: error.message });
        res.status(500).json({
            error: 'Failed to generate metrics',
            timestamp: new Date().toISOString()
        });
    }
});

// Performance metrics endpoint
app.get('/api/performance', (req, res) => {
    try {
        const summary = performanceMonitor.getMetricsSummary();
        const coreWebVitals = performanceMonitor.getCoreWebVitals();

        res.json({
            summary,
            coreWebVitals,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Performance endpoint error', { error: error.message });
        res.status(500).json({
            error: 'Failed to get performance metrics',
            timestamp: new Date().toISOString()
        });
    }
});

// Alerts endpoints
app.use('/api/alerts', alertingSystem.createAlertsEndpoint());

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'CAOS CRM Backend API',
        version: '1.0.0',
        environment: NODE_ENV,
        endpoints: {
            auth: '/api/auth',
            leads: '/api/leads',
            campaigns: '/api/campaigns',
            products: '/api/products',
            settings: '/api/settings',
            analytics: '/api/analytics',
            tasks: '/api/tasks',
            calendar: '/api/calendar',
            reports: '/api/reports',
            email: '/api/email',
            teams: '/api/teams',
            documents: '/api/documents',
            mobile: '/api/mobile',
            gdpr: '/api/gdpr',
            health: '/api/health'
        }
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        path: req.originalUrl,
        method: req.method,
        timestamp: new Date().toISOString()
    });
});

// Global error handler
app.use((error, req, res, next) => {
    logger.error('Global error handler', { error: error.message, stack: error.stack, path: req?.path, method: req?.method });

    // Handle JWT errors
    if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
            error: 'Invalid token',
            code: 'TOKEN_INVALID'
        });
    }

    if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
            error: 'Token expired',
            code: 'TOKEN_EXPIRED'
        });
    }

    // Handle validation errors
    if (error.name === 'ValidationError') {
        return res.status(400).json({
            error: 'Validation failed',
            details: error.details,
            code: 'VALIDATION_ERROR'
        });
    }

    // Handle rate limiting errors
    if (error.name === 'RateLimitError') {
        return res.status(429).json({
            error: 'Too many requests',
            retryAfter: error.retryAfter,
            code: 'RATE_LIMIT_EXCEEDED'
        });
    }

    // Default error response
    const statusCode = error.statusCode || 500;
    const message = NODE_ENV === 'production' ? 'Internal server error' : error.message;

    res.status(statusCode).json({
        error: message,
        code: 'INTERNAL_ERROR',
        timestamp: new Date().toISOString(),
        ...(NODE_ENV === 'development' && { stack: error.stack })
    });
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
    logger.info(`${signal} received. Starting graceful shutdown...`, {
        uptime: process.uptime(),
        pid: process.pid
    });

    server.close(async () => {
        try {
            // Close database connections
            await database.close();
            logger.info('Database connections closed');

            // Log final metrics
            const finalMetrics = performanceMonitor.getMetricsSummary();
            logger.info('Final performance metrics', finalMetrics.summary);

            logger.info('Graceful shutdown completed');
            process.exit(0);
        } catch (error) {
            logger.error('Error during graceful shutdown', { error: error.message });
            process.exit(1);
        }
    });

    // Force shutdown after 30 seconds
    setTimeout(() => {
        logger.error('Forced shutdown - graceful shutdown timed out');
        process.exit(1);
    }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', {
        error: error.message,
        stack: error.stack,
        fatal: true
    });
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', {
        reason: reason?.message || reason,
        stack: reason?.stack,
        promise: promise.toString(),
        fatal: true
    });
    gracefulShutdown('UNHANDLED_REJECTION');
});

// Start server
const server = app.listen(PORT, () => {
    logger.info('CAOS CRM Backend Server Started', {
        environment: NODE_ENV,
        port: PORT,
        baseUrl: `http://localhost:${PORT}/api`,
        monitoring: {
            health: `http://localhost:${PORT}/api/health`,
            metrics: `http://localhost:${PORT}/api/metrics`,
            performance: `http://localhost:${PORT}/api/performance`,
            alerts: `http://localhost:${PORT}/api/alerts`
        },
        features: {
            structuredLogging: true,
            performanceTracking: true,
            metricsCollection: true,
            healthMonitoring: true,
            alertingSystem: true
        }
    });

    console.log(`
🚀 CAOS CRM Backend Server Started
────────────────────────────────────
Environment: ${NODE_ENV}
Port: ${PORT}
API Base: http://localhost:${PORT}/api

📊 Monitoring Endpoints:
• Health: http://localhost:${PORT}/api/health
• Metrics: http://localhost:${PORT}/api/metrics
• Performance: http://localhost:${PORT}/api/performance
• Alerts: http://localhost:${PORT}/api/alerts

📊 Business Endpoints:

🔐 Authentication:
• POST /api/auth/register - User registration
• POST /api/auth/login - User login
• POST /api/auth/refresh - Refresh tokens
• POST /api/auth/logout - User logout
• GET /api/auth/me - Get user profile
• PUT /api/auth/me - Update user profile
• POST /api/auth/change-password - Change password

👥 Leads Management:
• POST /api/leads - Create new lead
• GET /api/leads - List leads with filtering
• GET /api/leads/:id - Get lead details
• PUT /api/leads/:id - Update lead
• DELETE /api/leads/:id - Delete lead
• POST /api/leads/:id/assign - Assign lead
• POST /api/leads/:id/activities - Log activity
• GET /api/leads/:id/activities - Get activities
• POST /api/leads/:id/notes - Add note
• GET /api/leads/stats - Get statistics
• POST /api/leads/bulk/assign - Bulk assign

📧 Campaigns Management:
• POST /api/campaigns - Create campaign
• GET /api/campaigns - List campaigns
• GET /api/campaigns/:id - Get campaign
• PUT /api/campaigns/:id - Update campaign
• DELETE /api/campaigns/:id - Delete campaign
• POST /api/campaigns/:id/send - Send campaign
• POST /api/campaigns/:id/schedule - Schedule campaign
• POST /api/campaigns/:id/recipients - Add recipients
• GET /api/campaigns/:id/recipients - Get recipients
• POST /api/campaigns/:id/clone - Clone campaign
• GET /api/campaigns/stats - Get statistics

🏥 System:
• GET /api/health - Service health check

🔒 Security Features:
• JWT Authentication with refresh tokens
• Rate limiting (5 auth attempts, 100 general per 15min)
• Password hashing with bcrypt (12 rounds)
• CORS protection
• Helmet security headers
• Input validation and sanitization

📈 Performance & Monitoring Features:
• Structured JSON logging with Winston
• Real-time performance tracking
• Prometheus metrics collection
• Database query performance monitoring
• Comprehensive health checks
• Automated alerting system
• Core Web Vitals monitoring
• Error tracking and analysis

Ready for connections...
    `);
});

module.exports = app;
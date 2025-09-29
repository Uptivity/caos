/**
 * Enhanced Logging System with Winston
 * Structured JSON logging with performance tracking and security features
 */

const winston = require('winston');
const path = require('path');

// Define log levels
const logLevels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    verbose: 4,
    debug: 5,
    silly: 6
};

// Define colors for each log level
const logColors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    verbose: 'grey',
    debug: 'blue',
    silly: 'rainbow'
};

// Add colors to winston - check if addColors exists to avoid test errors
if (winston.addColors && typeof winston.addColors === 'function') {
    winston.addColors(logColors);
}

// Sensitive field patterns to sanitize
const SENSITIVE_PATTERNS = [
    /password/i,
    /token/i,
    /secret/i,
    /key/i,
    /auth/i,
    /credential/i,
    /session/i,
    /cookie/i,
    /bearer/i,
    /jwt/i,
    /api[-_]?key/i,
    /access[-_]?token/i,
    /refresh[-_]?token/i
];

class EnhancedLogger {
    constructor() {
        this.environment = process.env.NODE_ENV || 'development';
        this.logLevel = process.env.LOG_LEVEL || 'info';
        this.serviceName = process.env.SERVICE_NAME || 'caos-crm-backend';

        // Create Winston logger instance
        this.logger = winston.createLogger({
            levels: logLevels,
            level: this.logLevel,
            format: this.createLogFormat(),
            defaultMeta: {
                service: this.serviceName,
                environment: this.environment,
                version: process.env.npm_package_version || '1.0.0'
            },
            transports: this.createTransports()
        });

        // Performance tracking storage
        this.requestTimes = new Map();
    }

    /**
     * Create log format based on environment
     */
    createLogFormat() {
        const baseFormat = winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json()
        );

        if (this.environment === 'development') {
            return winston.format.combine(
                baseFormat,
                winston.format.colorize({ all: true }),
                winston.format.printf(this.developmentFormat.bind(this))
            );
        }

        return winston.format.combine(
            baseFormat,
            winston.format.printf(this.productionFormat.bind(this))
        );
    }

    /**
     * Development log format (human readable)
     */
    developmentFormat(info) {
        const { timestamp, level, message, service, ...meta } = info;
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
        return `[${timestamp}] ${level} [${service}]: ${message} ${metaStr}`;
    }

    /**
     * Production log format (structured JSON)
     */
    productionFormat(info) {
        return JSON.stringify({
            timestamp: info.timestamp,
            level: info.level,
            service: info.service,
            environment: info.environment,
            version: info.version,
            message: info.message,
            ...this.sanitizeMetadata(info)
        });
    }

    /**
     * Create transport configurations
     */
    createTransports() {
        const transports = [
            // Console transport for all environments
            new winston.transports.Console({
                handleExceptions: true,
                handleRejections: true
            })
        ];

        // File transports for production
        if (this.environment === 'production') {
            // Error log file
            transports.push(
                new winston.transports.File({
                    filename: path.join(process.cwd(), 'logs', 'error.log'),
                    level: 'error',
                    maxsize: 50 * 1024 * 1024, // 50MB
                    maxFiles: 10,
                    tailable: true
                })
            );

            // Combined log file
            transports.push(
                new winston.transports.File({
                    filename: path.join(process.cwd(), 'logs', 'combined.log'),
                    maxsize: 100 * 1024 * 1024, // 100MB
                    maxFiles: 15,
                    tailable: true
                })
            );

            // Performance log file
            transports.push(
                new winston.transports.File({
                    filename: path.join(process.cwd(), 'logs', 'performance.log'),
                    level: 'http',
                    maxsize: 25 * 1024 * 1024, // 25MB
                    maxFiles: 5,
                    tailable: true
                })
            );
        }

        return transports;
    }

    /**
     * Sanitize sensitive data from metadata
     */
    sanitizeMetadata(data) {
        if (!data || typeof data !== 'object') return data;

        const sanitized = {};

        for (const [key, value] of Object.entries(data)) {
            // Skip Winston internal properties
            if (['timestamp', 'level', 'service', 'environment', 'version', 'message'].includes(key)) {
                continue;
            }

            const isSensitive = SENSITIVE_PATTERNS.some(pattern => pattern.test(key));

            if (isSensitive) {
                sanitized[key] = '[REDACTED]';
            } else if (typeof value === 'object') {
                sanitized[key] = this.sanitizeMetadata(value);
            } else if (typeof value === 'string') {
                sanitized[key] = this.sanitizeString(value);
            } else {
                sanitized[key] = value;
            }
        }

        return sanitized;
    }

    /**
     * Sanitize sensitive strings
     */
    sanitizeString(str) {
        if (typeof str !== 'string') return str;

        // Remove potential JWT tokens (long base64 strings)
        let sanitized = str.replace(/\b[A-Za-z0-9+/]{20,}={0,2}\b/g, '[REDACTED_TOKEN]');

        // Remove potential API keys (alphanumeric strings > 16 chars)
        sanitized = sanitized.replace(/\b[A-Za-z0-9]{16,}\b/g, '[REDACTED_KEY]');

        // Mask email addresses
        sanitized = sanitized.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, (email) => {
            const [local, domain] = email.split('@');
            const maskedLocal = local.length > 2
                ? local.substring(0, 2) + '*'.repeat(local.length - 2)
                : '*'.repeat(local.length);
            return `${maskedLocal}@${domain}`;
        });

        return sanitized;
    }

    /**
     * Generate unique request ID
     */
    generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Start request timing
     */
    startRequestTiming(requestId) {
        this.requestTimes.set(requestId, {
            startTime: process.hrtime.bigint(),
            timestamp: new Date().toISOString()
        });
    }

    /**
     * End request timing and log performance
     */
    endRequestTiming(requestId, req, res, additionalMeta = {}) {
        const timing = this.requestTimes.get(requestId);
        if (!timing) return;

        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - timing.startTime) / 1000000; // Convert to milliseconds

        this.requestTimes.delete(requestId);

        this.http('API Request Completed', {
            requestId,
            method: req.method,
            url: req.originalUrl,
            statusCode: res.statusCode,
            duration: `${duration.toFixed(2)}ms`,
            userAgent: req.get('User-Agent'),
            ip: req.ip,
            ...additionalMeta
        });

        // Log slow requests as warnings
        if (duration > 1000) {
            this.warn('Slow API Request Detected', {
                requestId,
                method: req.method,
                url: req.originalUrl,
                duration: `${duration.toFixed(2)}ms`,
                threshold: '1000ms'
            });
        }
    }

    /**
     * Log database query performance
     */
    logDatabaseQuery(query, duration, metadata = {}) {
        this.verbose('Database Query Executed', {
            query: this.sanitizeString(query),
            duration: `${duration}ms`,
            ...metadata
        });

        // Log slow queries as warnings
        if (duration > 100) {
            this.warn('Slow Database Query Detected', {
                query: this.sanitizeString(query),
                duration: `${duration}ms`,
                threshold: '100ms',
                ...metadata
            });
        }
    }

    /**
     * Log security events
     */
    security(message, metadata = {}) {
        this.logger.warn(message, {
            securityEvent: true,
            alertLevel: 'security',
            ...metadata
        });
    }

    /**
     * Log authentication events
     */
    auth(message, metadata = {}) {
        this.logger.info(message, {
            authEvent: true,
            category: 'authentication',
            ...metadata
        });
    }

    /**
     * Log business events
     */
    business(message, metadata = {}) {
        this.logger.info(message, {
            businessEvent: true,
            category: 'business',
            ...metadata
        });
    }

    /**
     * Log API usage analytics
     */
    analytics(message, metadata = {}) {
        this.logger.http(message, {
            analyticsEvent: true,
            category: 'api_usage',
            ...metadata
        });
    }

    // Standard log level methods
    error(message, metadata = {}) {
        this.logger.error(message, metadata);
    }

    warn(message, metadata = {}) {
        this.logger.warn(message, metadata);
    }

    info(message, metadata = {}) {
        this.logger.info(message, metadata);
    }

    http(message, metadata = {}) {
        this.logger.http(message, metadata);
    }

    verbose(message, metadata = {}) {
        this.logger.verbose(message, metadata);
    }

    debug(message, metadata = {}) {
        this.logger.debug(message, metadata);
    }

    silly(message, metadata = {}) {
        this.logger.silly(message, metadata);
    }
}

// Create default logger instance
const logger = new EnhancedLogger();

// Create logs directory in production
if (process.env.NODE_ENV === 'production') {
    const fs = require('fs');
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }
}

module.exports = {
    logger,
    EnhancedLogger
};
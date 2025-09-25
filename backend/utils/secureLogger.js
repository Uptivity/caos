/**
 * Secure Logger Utility
 * Sanitizes sensitive data and provides structured logging
 * Prevents information disclosure through console output
 */

const crypto = require('crypto');

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

// Email pattern to partially mask
const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

class SecureLogger {
    constructor(options = {}) {
        this.logLevel = options.logLevel || 'info';
        this.enableConsole = options.enableConsole !== false;
        this.maskSensitive = options.maskSensitive !== false;
        this.service = options.service || 'caos-crm';
    }

    /**
     * Sanitize sensitive data from objects and strings
     */
    sanitize(data) {
        if (data === null || data === undefined) {
            return data;
        }

        if (typeof data === 'string') {
            return this.sanitizeString(data);
        }

        if (typeof data === 'object') {
            if (data instanceof Error) {
                return this.sanitizeError(data);
            }

            if (Array.isArray(data)) {
                return data.map(item => this.sanitize(item));
            }

            return this.sanitizeObject(data);
        }

        return data;
    }

    /**
     * Sanitize sensitive strings
     */
    sanitizeString(str) {
        if (!this.maskSensitive) return str;

        // Mask email addresses
        let sanitized = str.replace(EMAIL_PATTERN, (email) => {
            const [local, domain] = email.split('@');
            const maskedLocal = local.length > 2
                ? local.substring(0, 2) + '*'.repeat(local.length - 2)
                : '*'.repeat(local.length);
            return `${maskedLocal}@${domain}`;
        });

        // Remove potential JWT tokens (long base64 strings)
        sanitized = sanitized.replace(/\b[A-Za-z0-9+/]{20,}={0,2}\b/g, '[REDACTED_TOKEN]');

        // Remove potential API keys (alphanumeric strings > 16 chars)
        sanitized = sanitized.replace(/\b[A-Za-z0-9]{16,}\b/g, '[REDACTED_KEY]');

        return sanitized;
    }

    /**
     * Sanitize sensitive object properties
     */
    sanitizeObject(obj) {
        if (!this.maskSensitive) return obj;

        const sanitized = {};

        for (const [key, value] of Object.entries(obj)) {
            const isSensitive = SENSITIVE_PATTERNS.some(pattern => pattern.test(key));

            if (isSensitive) {
                sanitized[key] = '[REDACTED]';
            } else {
                sanitized[key] = this.sanitize(value);
            }
        }

        return sanitized;
    }

    /**
     * Sanitize error objects
     */
    sanitizeError(error) {
        return {
            name: error.name,
            message: this.sanitizeString(error.message),
            stack: error.stack ? this.sanitizeString(error.stack) : undefined,
            code: error.code,
            status: error.status,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Create structured log entry
     */
    createLogEntry(level, message, metadata = {}) {
        return {
            timestamp: new Date().toISOString(),
            level: level.toUpperCase(),
            service: this.service,
            message: this.sanitizeString(message),
            metadata: this.sanitize(metadata),
            requestId: metadata.requestId || this.generateRequestId()
        };
    }

    /**
     * Generate unique request ID
     */
    generateRequestId() {
        return crypto.randomBytes(8).toString('hex');
    }

    /**
     * Log info level messages
     */
    info(message, metadata = {}) {
        const logEntry = this.createLogEntry('info', message, metadata);

        if (this.enableConsole) {
            console.info(JSON.stringify(logEntry, null, 2));
        }

        return logEntry;
    }

    /**
     * Log warning level messages
     */
    warn(message, metadata = {}) {
        const logEntry = this.createLogEntry('warn', message, metadata);

        if (this.enableConsole) {
            console.warn(JSON.stringify(logEntry, null, 2));
        }

        return logEntry;
    }

    /**
     * Log error level messages (SECURE)
     */
    error(message, metadata = {}) {
        const logEntry = this.createLogEntry('error', message, metadata);

        if (this.enableConsole) {
            console.error(JSON.stringify(logEntry, null, 2));
        }

        return logEntry;
    }

    /**
     * Log debug level messages
     */
    debug(message, metadata = {}) {
        if (this.logLevel !== 'debug') return;

        const logEntry = this.createLogEntry('debug', message, metadata);

        if (this.enableConsole) {
            console.debug(JSON.stringify(logEntry, null, 2));
        }

        return logEntry;
    }

    /**
     * Log security events
     */
    security(message, metadata = {}) {
        const logEntry = this.createLogEntry('security', message, {
            ...metadata,
            security_event: true,
            alert: true
        });

        if (this.enableConsole) {
            console.warn(`[SECURITY] ${JSON.stringify(logEntry, null, 2)}`);
        }

        return logEntry;
    }

    /**
     * Log authentication events
     */
    auth(message, metadata = {}) {
        const logEntry = this.createLogEntry('auth', message, {
            ...metadata,
            auth_event: true
        });

        if (this.enableConsole) {
            console.info(`[AUTH] ${JSON.stringify(logEntry, null, 2)}`);
        }

        return logEntry;
    }
}

// Create default logger instance
const logger = new SecureLogger({
    service: 'caos-crm',
    logLevel: process.env.LOG_LEVEL || 'info',
    maskSensitive: process.env.NODE_ENV === 'production'
});

module.exports = {
    SecureLogger,
    logger
};
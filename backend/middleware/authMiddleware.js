/**
 * Enhanced Authentication Middleware
 * Strict authentication enforcement without fallbacks
 * Prevents authentication bypass vulnerabilities
 */

const jwt = require('jsonwebtoken');
const { logger } = require('../utils/secureLogger');

// Get JWT secret from environment - REQUIRED
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    logger.error('CRITICAL: JWT_SECRET environment variable is required');
    logger.security('Application startup failed: Missing JWT_SECRET', {
        severity: 'critical',
        action: 'shutdown'
    });
    process.exit(1);
}

/**
 * Strict authentication middleware - NO FALLBACKS
 * Rejects all requests without valid authentication
 */
const requireAuth = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        // Reject if no authorization header
        if (!authHeader) {
            logger.security('Authentication attempt without authorization header', {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                path: req.path,
                method: req.method
            });

            return res.status(401).json({
                error: 'Authentication required',
                code: 'AUTH_MISSING'
            });
        }

        // Check Bearer token format
        const tokenParts = authHeader.split(' ');
        if (tokenParts.length !== 2 || tokenParts[0] !== 'Bearer') {
            logger.security('Invalid authorization header format', {
                ip: req.ip,
                authHeader: authHeader.substring(0, 20) + '...',
                path: req.path,
                method: req.method
            });

            return res.status(401).json({
                error: 'Invalid authorization format',
                code: 'AUTH_FORMAT_INVALID'
            });
        }

        const token = tokenParts[1];

        // Verify JWT token
        const decoded = jwt.verify(token, JWT_SECRET, {
            issuer: 'caos-crm',
            audience: 'caos-crm-client'
        });

        // Ensure required fields exist
        if (!decoded.userId || !decoded.email) {
            logger.security('JWT token missing required fields', {
                ip: req.ip,
                tokenFields: Object.keys(decoded),
                path: req.path,
                method: req.method
            });

            return res.status(403).json({
                error: 'Invalid token payload',
                code: 'TOKEN_INVALID_PAYLOAD'
            });
        }

        // Set user info on request (NO FALLBACKS)
        req.user = {
            id: decoded.userId,
            userId: decoded.userId, // For backward compatibility
            email: decoded.email,
            iat: decoded.iat,
            authenticated: true
        };

        logger.auth('Successful authentication', {
            userId: decoded.userId,
            email: decoded.email,
            path: req.path,
            method: req.method,
            ip: req.ip
        });

        next();

    } catch (error) {
        logger.security('Authentication failed', {
            error: error.message,
            ip: req.ip,
            path: req.path,
            method: req.method,
            userAgent: req.get('User-Agent')
        });

        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                error: 'Token has expired',
                code: 'TOKEN_EXPIRED'
            });
        }

        if (error.name === 'JsonWebTokenError') {
            return res.status(403).json({
                error: 'Invalid token',
                code: 'TOKEN_INVALID'
            });
        }

        return res.status(403).json({
            error: 'Authentication failed',
            code: 'AUTH_FAILED'
        });
    }
};

/**
 * Optional authentication middleware
 * Sets user if token is valid, allows anonymous if not
 */
const optionalAuth = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            req.user = null;
            return next();
        }

        const tokenParts = authHeader.split(' ');
        if (tokenParts.length !== 2 || tokenParts[0] !== 'Bearer') {
            req.user = null;
            return next();
        }

        const token = tokenParts[1];
        const decoded = jwt.verify(token, JWT_SECRET, {
            issuer: 'caos-crm',
            audience: 'caos-crm-client'
        });

        if (decoded.userId && decoded.email) {
            req.user = {
                id: decoded.userId,
                userId: decoded.userId,
                email: decoded.email,
                iat: decoded.iat,
                authenticated: true
            };
        } else {
            req.user = null;
        }

        next();

    } catch (error) {
        // For optional auth, continue without user
        req.user = null;
        next();
    }
};

/**
 * Utility to get authenticated user ID (STRICT)
 * Throws error if user is not authenticated
 */
const getAuthenticatedUserId = (req) => {
    if (!req.user || !req.user.authenticated || !req.user.id) {
        const error = new Error('User not authenticated');
        error.code = 'AUTH_REQUIRED';
        error.status = 401;
        throw error;
    }
    return req.user.id;
};

/**
 * Middleware to ensure user ID exists
 */
const requireUserId = (req, res, next) => {
    try {
        const userId = getAuthenticatedUserId(req);
        req.authenticatedUserId = userId;
        next();
    } catch (error) {
        logger.security('Attempt to access protected resource without authentication', {
            ip: req.ip,
            path: req.path,
            method: req.method,
            userAgent: req.get('User-Agent')
        });

        return res.status(401).json({
            error: 'Authentication required',
            code: 'AUTH_REQUIRED'
        });
    }
};

module.exports = {
    requireAuth,
    optionalAuth,
    getAuthenticatedUserId,
    requireUserId
};
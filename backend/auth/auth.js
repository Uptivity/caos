// Auth Backend API - Module 04 (MySQL Version)
// JWT Authentication System for CAOS CRM with MySQL Database

const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const { logger } = require('../utils/logger');
const { metricsCollector } = require('../middleware/metricsMiddleware');
const AuthService = require('../services/AuthService');

const router = express.Router();

// Initialize AuthService
AuthService.initialize().catch(error => {
    logger.error('CRITICAL: Failed to initialize AuthService', {
        error: error.message,
        stack: error.stack,
        service: 'AuthService',
        fatal: true
    });
    process.exit(1);
});

// Rate limiting
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 requests per windowMs
    message: {
        error: 'Too many authentication attempts, please try again later.',
        retryAfter: 15 * 60
    },
    standardHeaders: true,
    legacyHeaders: false,
});

const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: {
        error: 'Too many requests, please try again later.',
        retryAfter: 15 * 60
    }
});

// Helper functions
const sanitizeUser = (user) => {
    // Remove any sensitive data if needed
    return user;
};

// Validation middleware
const registerValidation = [
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Please provide a valid email address'),
    body('password')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters long')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
    body('firstName')
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage('First name is required and must be less than 50 characters'),
    body('lastName')
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage('Last name is required and must be less than 50 characters'),
    body('company')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('Company name must be less than 100 characters')
];

const loginValidation = [
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Please provide a valid email address'),
    body('password')
        .notEmpty()
        .withMessage('Password is required')
];

// Authentication middleware
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({
            error: 'Access token required',
            code: 'TOKEN_MISSING'
        });
    }

    try {
        const decoded = AuthService.verifyToken(token);
        req.user = decoded;

        // Optionally load full user data
        const fullUser = await AuthService.findById(decoded.userId);
        if (fullUser) {
            req.user.name = `${fullUser.firstName || ''} ${fullUser.lastName || ''}`.trim();
        }

        next();
    } catch (error) {
        return res.status(403).json({
            error: 'Invalid or expired token',
            code: 'TOKEN_INVALID'
        });
    }
};

// Routes

// POST /auth/register - User registration
router.post('/register', authLimiter, registerValidation, async (req, res) => {
    try {
        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array(),
                code: 'VALIDATION_ERROR'
            });
        }

        const { email, password, firstName, lastName, company } = req.body;

        // Register user using AuthService
        const result = await AuthService.register({
            email,
            password,
            firstName,
            lastName,
            company
        });

        res.status(201).json({
            message: 'User registered successfully',
            user: result.user,
            tokens: {
                accessToken: result.tokens.accessToken,
                refreshToken: result.tokens.refreshToken,
                expiresIn: process.env.JWT_EXPIRES_IN || '24h'
            }
        });

    } catch (error) {
        if (error.message === 'User already exists with this email address') {
            return res.status(409).json({
                error: error.message,
                code: 'USER_EXISTS'
            });
        }

        logger.error('Registration error', { error: error.message, email: req.body.email });
        res.status(500).json({
            error: 'Internal server error during registration',
            code: 'REGISTRATION_ERROR'
        });
    }
});

// POST /auth/login - User login
router.post('/login', authLimiter, loginValidation, async (req, res) => {
    try {
        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array(),
                code: 'VALIDATION_ERROR'
            });
        }

        const { email, password, rememberMe } = req.body;

        // Login user using AuthService
        const result = await AuthService.login(email, password, rememberMe);

        res.json({
            message: 'Login successful',
            user: result.user,
            tokens: result.tokens
        });

    } catch (error) {
        if (error.message === 'Invalid email or password' ||
            error.message === 'Account has been deactivated') {
            return res.status(401).json({
                error: error.message,
                code: error.message === 'Account has been deactivated' ? 'ACCOUNT_DEACTIVATED' : 'INVALID_CREDENTIALS'
            });
        }

        logger.error('Login error', { error: error.message, email: req.body.email });
        res.status(500).json({
            error: 'Internal server error during login',
            code: 'LOGIN_ERROR'
        });
    }
});

// POST /auth/refresh - Refresh access token
router.post('/refresh', generalLimiter, async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(401).json({
                error: 'Refresh token required',
                code: 'REFRESH_TOKEN_MISSING'
            });
        }

        // Refresh token using AuthService
        const tokens = await AuthService.refreshToken(refreshToken);

        res.json({
            message: 'Token refreshed successfully',
            tokens: {
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                expiresIn: process.env.JWT_EXPIRES_IN || '24h'
            }
        });

    } catch (error) {
        logger.error('Token refresh error', { error: error.message });
        res.status(403).json({
            error: 'Invalid or expired refresh token',
            code: 'REFRESH_TOKEN_INVALID'
        });
    }
});

// POST /auth/logout - User logout
router.post('/logout', authenticateToken, async (req, res) => {
    try {
        const { refreshToken } = req.body;

        // Logout using AuthService
        await AuthService.logout(refreshToken);

        res.json({
            message: 'Logout successful'
        });

    } catch (error) {
        logger.error('Logout error', { error: error.message });
        res.status(500).json({
            error: 'Internal server error during logout',
            code: 'LOGOUT_ERROR'
        });
    }
});

// GET /auth/me - Get current user profile
router.get('/me', authenticateToken, async (req, res) => {
    try {
        // Get user profile using AuthService
        const user = await AuthService.getProfile(req.user.userId);

        res.json({
            user: user
        });

    } catch (error) {
        if (error.message === 'User not found or inactive') {
            return res.status(404).json({
                error: error.message,
                code: 'USER_NOT_FOUND'
            });
        }

        logger.error('Profile fetch error', { error: error.message, userId: req.user?.userId });
        res.status(500).json({
            error: 'Internal server error fetching profile',
            code: 'PROFILE_ERROR'
        });
    }
});

// PUT /auth/me - Update user profile
router.put('/me', authenticateToken, [
    body('firstName')
        .optional()
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage('First name must be less than 50 characters'),
    body('lastName')
        .optional()
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage('Last name must be less than 50 characters'),
    body('company')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('Company name must be less than 100 characters')
], async (req, res) => {
    try {
        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array(),
                code: 'VALIDATION_ERROR'
            });
        }

        // Update profile using AuthService
        const user = await AuthService.updateProfile(req.user.userId, req.body);

        res.json({
            message: 'Profile updated successfully',
            user: user
        });

    } catch (error) {
        if (error.message === 'User not found or inactive') {
            return res.status(404).json({
                error: error.message,
                code: 'USER_NOT_FOUND'
            });
        }

        logger.error('Profile update error', { error: error.message, userId: req.user?.userId });
        res.status(500).json({
            error: 'Internal server error updating profile',
            code: 'PROFILE_UPDATE_ERROR'
        });
    }
});

// POST /auth/change-password - Change user password
router.post('/change-password', authenticateToken, [
    body('currentPassword')
        .notEmpty()
        .withMessage('Current password is required'),
    body('newPassword')
        .isLength({ min: 8 })
        .withMessage('New password must be at least 8 characters long')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .withMessage('New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character')
], async (req, res) => {
    try {
        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array(),
                code: 'VALIDATION_ERROR'
            });
        }

        const { currentPassword, newPassword } = req.body;

        // Change password using AuthService
        await AuthService.changePassword(req.user.userId, currentPassword, newPassword);

        res.json({
            message: 'Password changed successfully'
        });

    } catch (error) {
        if (error.message === 'User not found or inactive') {
            return res.status(404).json({
                error: error.message,
                code: 'USER_NOT_FOUND'
            });
        }

        if (error.message === 'Current password is incorrect') {
            return res.status(401).json({
                error: error.message,
                code: 'INVALID_CURRENT_PASSWORD'
            });
        }

        logger.error('Password change error', { error: error.message, userId: req.user?.userId });
        res.status(500).json({
            error: 'Internal server error changing password',
            code: 'PASSWORD_CHANGE_ERROR'
        });
    }
});

// Health check endpoint
router.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'caos-crm-auth',
        version: '1.0.0'
    });
});

// Export router and middleware
module.exports = {
    router,
    authenticateToken,
    authLimiter,
    generalLimiter
};
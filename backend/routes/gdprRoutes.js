// GDPR Compliance API Routes
// Handles data export, deletion, consent management, and privacy rights

const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, param, query, validationResult } = require('express-validator');
const path = require('path');
const fs = require('fs').promises;

const GDPRService = require('../services/GDPRService');
const ConsentService = require('../services/ConsentService');
const DataRetentionService = require('../services/DataRetentionService');
const DatabaseService = require('../services/DatabaseService');
const AuditLogger = require('../utils/AuditLogger');
const { authenticateToken } = require('../auth/auth');
const { logger } = require('../utils/secureLogger');

const router = express.Router();

// Rate limiting for GDPR endpoints
const gdprLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // Limit each IP to 10 GDPR requests per hour
    message: {
        error: 'Too many GDPR requests. Please try again later.',
        retryAfter: 3600
    },
    standardHeaders: true,
    legacyHeaders: false
});

const exportLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    max: 3, // Limit to 3 export requests per day
    message: {
        error: 'Daily export limit reached. Please try again tomorrow.',
        retryAfter: 86400
    }
});

const deletionLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    max: 1, // Limit to 1 deletion request per day
    message: {
        error: 'Deletion request already submitted today. Please wait 24 hours.',
        retryAfter: 86400
    }
});

// Middleware to extract request context
const extractRequestContext = (req, res, next) => {
    req.requestContext = {
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
        endpoint: req.originalUrl,
        method: req.method,
        sessionId: req.sessionID || req.headers['x-session-id']
    };
    next();
};

// Apply middleware to all routes
router.use(extractRequestContext);

/**
 * Data Export Routes (GDPR Article 20)
 */

// POST /gdpr/export/request - Request data export
router.post('/export/request',
    authenticateToken,
    exportLimiter,
    [
        body('format')
            .optional()
            .isIn(['json', 'csv', 'xml'])
            .withMessage('Format must be json, csv, or xml'),
        body('includeDeleted')
            .optional()
            .isBoolean()
            .withMessage('includeDeleted must be boolean'),
        body('tables')
            .optional()
            .isObject()
            .withMessage('tables must be an object'),
        body('email')
            .optional()
            .isEmail()
            .withMessage('Invalid email address')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Validation failed',
                    details: errors.array(),
                    code: 'VALIDATION_ERROR'
                });
            }

            const userId = req.user.userId;
            const options = {
                ...req.body,
                ...req.requestContext
            };

            const result = await GDPRService.requestDataExport(userId, options);

            // Log export request
            await AuditLogger.logGDPREvent({
                userId: userId,
                gdprAction: 'DATA_EXPORT_REQUESTED',
                requestType: 'data_export',
                status: 'initiated',
                details: {
                    exportId: result.exportId,
                    format: options.format || 'json',
                    tables: options.tables ? Object.keys(options.tables) : 'all'
                },
                ...req.requestContext
            });

            res.status(202).json({
                message: 'Data export request submitted successfully',
                ...result
            });

        } catch (error) {
            logger.error('Data export request failed', {
                userId: req.user?.userId,
                error: error.message,
                ...req.requestContext
            });

            res.status(500).json({
                error: 'Failed to process data export request',
                code: 'EXPORT_REQUEST_ERROR'
            });
        }
    }
);

// GET /gdpr/export/:exportId/status - Get export status
router.get('/export/:exportId/status',
    authenticateToken,
    [
        param('exportId').isInt().withMessage('Export ID must be an integer')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Validation failed',
                    details: errors.array()
                });
            }

            const { exportId } = req.params;
            const userId = req.user.userId;

            // Get export request details
            const __res = await DatabaseService.query(
                'SELECT * FROM data_export_requests WHERE id = ? AND user_id = ?',
                [exportId, userId]
            );
const exports = Array.isArray(__res)
  ? (Array.isArray(__res[0]) ? __res[0] : __res)
  : (Array.isArray(__res && __res.rows) ? __res.rows : []);

            if (exports.length === 0) {
                return res.status(404).json({
                    error: 'Export request not found',
                    code: 'EXPORT_NOT_FOUND'
                });
            }

            const exportRequest = exports[0];

            res.json({
                exportId: exportRequest.id,
                status: exportRequest.status,
                createdAt: exportRequest.created_at,
                updatedAt: exportRequest.updated_at,
                expiresAt: exportRequest.expires_at,
                downloadCount: exportRequest.download_count,
                maxDownloads: exportRequest.max_downloads,
                fileSize: exportRequest.file_size,
                canDownload: exportRequest.status === 'completed' &&
                           exportRequest.download_count < exportRequest.max_downloads &&
                           new Date() < new Date(exportRequest.expires_at)
            });

        } catch (error) {
            logger.error('Failed to get export status', {
                exportId: req.params.exportId,
                error: error.message
            });

            res.status(500).json({
                error: 'Failed to get export status',
                code: 'EXPORT_STATUS_ERROR'
            });
        }
    }
);

// GET /gdpr/export/:exportId/download - Download export file
router.get('/export/:exportId/download',
    [
        param('exportId').isInt().withMessage('Export ID must be an integer'),
        query('token').notEmpty().withMessage('Verification token required')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Validation failed',
                    details: errors.array()
                });
            }

            const { exportId } = req.params;
            const { token } = req.query;

            // Get export request
            const __res = await DatabaseService.query(
                'SELECT * FROM data_export_requests WHERE id = ? AND verification_token = ?',
                [exportId, token]
            );
const exports = Array.isArray(__res)
  ? (Array.isArray(__res[0]) ? __res[0] : __res)
  : (Array.isArray(__res && __res.rows) ? __res.rows : []);

            if (exports.length === 0) {
                return res.status(404).json({
                    error: 'Export not found or invalid token',
                    code: 'EXPORT_NOT_FOUND'
                });
            }

            const exportRequest = exports[0];

            // Validate download conditions
            if (exportRequest.status !== 'completed') {
                return res.status(400).json({
                    error: 'Export not completed',
                    code: 'EXPORT_NOT_READY'
                });
            }

            if (new Date() > new Date(exportRequest.expires_at)) {
                return res.status(410).json({
                    error: 'Export has expired',
                    code: 'EXPORT_EXPIRED'
                });
            }

            if (exportRequest.download_count >= exportRequest.max_downloads) {
                return res.status(410).json({
                    error: 'Download limit exceeded',
                    code: 'DOWNLOAD_LIMIT_EXCEEDED'
                });
            }

            // Check if file exists
            const filePath = path.join(process.cwd(), 'exports', exportRequest.file_path);
            try {
                await fs.access(filePath);
            } catch {
                return res.status(404).json({
                    error: 'Export file not found',
                    code: 'FILE_NOT_FOUND'
                });
            }

            // Increment download count
            await DatabaseService.update('data_export_requests', exportId, {
                download_count: exportRequest.download_count + 1
            });

            // Log download
            await AuditLogger.logGDPREvent({
                userId: exportRequest.user_id,
                gdprAction: 'DATA_EXPORT_DOWNLOADED',
                requestType: 'data_export',
                status: 'completed',
                details: {
                    exportId: exportId,
                    downloadCount: exportRequest.download_count + 1,
                    fileSize: exportRequest.file_size
                },
                ...req.requestContext
            });

            // Set appropriate headers for download
            const fileName = `caos_data_export_${exportRequest.user_id}_${exportId}.${exportRequest.export_format}`;
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Length', exportRequest.file_size);

            // Stream file to response
            const fileStream = require('fs').createReadStream(filePath);
            fileStream.pipe(res);

        } catch (error) {
            logger.error('Export download failed', {
                exportId: req.params.exportId,
                error: error.message
            });

            res.status(500).json({
                error: 'Failed to download export',
                code: 'DOWNLOAD_ERROR'
            });
        }
    }
);

/**
 * Data Deletion Routes (GDPR Article 17)
 */

// POST /gdpr/deletion/request - Request data deletion
router.post('/deletion/request',
    authenticateToken,
    deletionLimiter,
    [
        body('deletionType')
            .optional()
            .isIn(['full_deletion', 'partial_deletion', 'anonymization'])
            .withMessage('Invalid deletion type'),
        body('reason')
            .optional()
            .isLength({ max: 500 })
            .withMessage('Reason must be less than 500 characters'),
        body('specificData')
            .optional()
            .isObject()
            .withMessage('specificData must be an object')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Validation failed',
                    details: errors.array()
                });
            }

            const userId = req.user.userId;
            const options = {
                ...req.body,
                ...req.requestContext
            };

            const result = await GDPRService.requestDataDeletion(userId, options);

            // Log deletion request
            await AuditLogger.logGDPREvent({
                userId: userId,
                gdprAction: 'DATA_DELETION_REQUESTED',
                requestType: 'data_deletion',
                status: 'initiated',
                details: {
                    deletionId: result.deletionId,
                    deletionType: options.deletionType || 'full_deletion',
                    reason: options.reason
                },
                ...req.requestContext
            });

            res.status(202).json({
                message: 'Data deletion request submitted successfully',
                ...result
            });

        } catch (error) {
            logger.error('Data deletion request failed', {
                userId: req.user?.userId,
                error: error.message
            });

            res.status(500).json({
                error: 'Failed to process deletion request',
                code: 'DELETION_REQUEST_ERROR'
            });
        }
    }
);

// POST /gdpr/deletion/:deletionId/verify - Verify deletion request
router.post('/deletion/:deletionId/verify',
    [
        param('deletionId').isInt().withMessage('Deletion ID must be an integer'),
        query('token').notEmpty().withMessage('Verification token required')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Validation failed',
                    details: errors.array()
                });
            }

            const { deletionId } = req.params;
            const { token } = req.query;

            const result = await GDPRService.verifyDataDeletion(deletionId, token);

            res.json({
                message: 'Deletion request verified successfully',
                ...result
            });

        } catch (error) {
            logger.error('Deletion verification failed', {
                deletionId: req.params.deletionId,
                error: error.message
            });

            if (error.message.includes('Invalid verification token')) {
                return res.status(400).json({
                    error: 'Invalid verification token',
                    code: 'INVALID_TOKEN'
                });
            }

            res.status(500).json({
                error: 'Failed to verify deletion request',
                code: 'VERIFICATION_ERROR'
            });
        }
    }
);

/**
 * Consent Management Routes
 */

// GET /gdpr/consent - Get user consent status
router.get('/consent',
    authenticateToken,
    async (req, res) => {
        try {
            const userId = req.user.userId;
            const summary = await ConsentService.getConsentSummary(userId);

            res.json(summary);

        } catch (error) {
            logger.error('Failed to get consent status', {
                userId: req.user?.userId,
                error: error.message
            });

            res.status(500).json({
                error: 'Failed to get consent status',
                code: 'CONSENT_STATUS_ERROR'
            });
        }
    }
);

// PUT /gdpr/consent - Update consent preferences
router.put('/consent',
    authenticateToken,
    gdprLimiter,
    [
        body('consents')
            .isObject()
            .withMessage('Consents must be an object'),
        body('consents.*')
            .isBoolean()
            .withMessage('Each consent value must be boolean')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Validation failed',
                    details: errors.array()
                });
            }

            const userId = req.user.userId;
            const { consents } = req.body;

            const updatedConsents = await ConsentService.updateConsentPreferences(
                userId,
                consents,
                req.requestContext
            );

            // Log consent update
            await AuditLogger.logGDPREvent({
                userId: userId,
                gdprAction: 'CONSENT_UPDATED',
                requestType: 'consent_management',
                status: 'completed',
                details: {
                    updatedConsents: Object.keys(consents),
                    preferences: consents
                },
                ...req.requestContext
            });

            res.json({
                message: 'Consent preferences updated successfully',
                updatedConsents: updatedConsents.length,
                consents: updatedConsents
            });

        } catch (error) {
            logger.error('Failed to update consent preferences', {
                userId: req.user?.userId,
                error: error.message
            });

            res.status(500).json({
                error: 'Failed to update consent preferences',
                code: 'CONSENT_UPDATE_ERROR'
            });
        }
    }
);

// GET /gdpr/consent/types - Get available consent types
router.get('/consent/types', (req, res) => {
    try {
        const consentTypes = ConsentService.getConsentTypes();
        res.json({
            consentTypes: consentTypes
        });

    } catch (error) {
        logger.error('Failed to get consent types', { error: error.message });
        res.status(500).json({
            error: 'Failed to get consent types',
            code: 'CONSENT_TYPES_ERROR'
        });
    }
});

/**
 * GDPR Compliance Status Routes
 */

// GET /gdpr/compliance - Get user compliance status
router.get('/compliance',
    authenticateToken,
    async (req, res) => {
        try {
            const userId = req.user.userId;
            const complianceStatus = await GDPRService.getComplianceStatus(userId);

            res.json(complianceStatus);

        } catch (error) {
            logger.error('Failed to get compliance status', {
                userId: req.user?.userId,
                error: error.message
            });

            res.status(500).json({
                error: 'Failed to get compliance status',
                code: 'COMPLIANCE_STATUS_ERROR'
            });
        }
    }
);

// GET /gdpr/audit-trail - Get user audit trail
router.get('/audit-trail',
    authenticateToken,
    [
        query('limit')
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage('Limit must be between 1 and 100'),
        query('offset')
            .optional()
            .isInt({ min: 0 })
            .withMessage('Offset must be non-negative'),
        query('action')
            .optional()
            .isString()
            .withMessage('Action must be a string'),
        query('startDate')
            .optional()
            .isISO8601()
            .withMessage('Start date must be ISO 8601 format'),
        query('endDate')
            .optional()
            .isISO8601()
            .withMessage('End date must be ISO 8601 format')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Validation failed',
                    details: errors.array()
                });
            }

            const userId = req.user.userId;
            const options = {
                limit: parseInt(req.query.limit) || 50,
                offset: parseInt(req.query.offset) || 0,
                action: req.query.action,
                startDate: req.query.startDate,
                endDate: req.query.endDate
            };

            const auditTrail = await AuditLogger.getAuditTrail(userId, options);

            res.json({
                auditTrail: auditTrail,
                total: auditTrail.length,
                limit: options.limit,
                offset: options.offset
            });

        } catch (error) {
            logger.error('Failed to get audit trail', {
                userId: req.user?.userId,
                error: error.message
            });

            res.status(500).json({
                error: 'Failed to get audit trail',
                code: 'AUDIT_TRAIL_ERROR'
            });
        }
    }
);

/**
 * Administrative Routes (for system administrators)
 */

// GET /gdpr/admin/statistics - Get GDPR statistics (admin only)
router.get('/admin/statistics',
    authenticateToken,
    // Add admin authorization middleware here if needed
    async (req, res) => {
        try {
            const {
                startDate = null,
                endDate = null,
                userId = null
            } = req.query;

            const statistics = {
                consents: await ConsentService.getConsentStatistics({
                    startDate,
                    endDate
                }),
                audits: await AuditLogger.getAuditStatistics({
                    startDate,
                    endDate,
                    userId
                }),
                retention: await DataRetentionService.getRetentionStatistics()
            };

            res.json(statistics);

        } catch (error) {
            logger.error('Failed to get GDPR statistics', { error: error.message });
            res.status(500).json({
                error: 'Failed to get GDPR statistics',
                code: 'STATISTICS_ERROR'
            });
        }
    }
);

// Health check endpoint
router.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'gdpr-compliance',
        version: '1.0.0',
        features: {
            dataExport: true,
            dataDeletion: true,
            consentManagement: true,
            auditLogging: true,
            dataRetention: true,
            piiProtection: true
        }
    });
});

module.exports = router;
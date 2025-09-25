// Settings Routes - API endpoints for CRM configuration management
const express = require('express');
const router = express.Router();
const settingsModel = require('./settingsModel');
const { authenticateToken } = require('../auth/auth');
const { body, query, validationResult } = require('express-validator');
const { requireAuth, getAuthenticatedUserId } = require('../middleware/authMiddleware');
const { logger } = require('../utils/secureLogger');

// Validation middleware
const validateRequest = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    next();
};

// Permission checking middleware
const checkPermission = (permission) => {
    return (req, res, next) => {
        // For demo, check if user is admin
        if (req.user.role !== 'admin' && permission === 'admin') {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        next();
    };
};

// ============= User Preferences Endpoints =============

// Get user preferences
router.get('/preferences', authenticateToken, (req, res) => {
    try {
        const preferences = settingsModel.getUserPreferences(req.user.id);
        res.json(preferences);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update user preferences
router.put('/preferences',
    authenticateToken,
    body('theme').optional().isIn(['light', 'dark', 'auto']),
    body('language').optional().isString(),
    body('timezone').optional().isString(),
    body('dateFormat').optional().isString(),
    body('timeFormat').optional().isIn(['12h', '24h']),
    validateRequest,
    (req, res) => {
        try {
            const preferences = settingsModel.updateUserPreferences(req.user.id, req.body);
            res.json({
                message: 'Preferences updated successfully',
                preferences
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
);

// Reset user preferences to defaults
router.post('/preferences/reset', authenticateToken, (req, res) => {
    try {
        const preferences = settingsModel.resetUserPreferences(req.user.id);
        res.json({
            message: 'Preferences reset to defaults',
            preferences
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============= System Configuration Endpoints =============

// Get system configuration
router.get('/system/:category?',
    authenticateToken,
    checkPermission('admin'),
    (req, res) => {
        try {
            const config = settingsModel.getSystemConfig(req.params.category);
            res.json(config);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
);

// Update system configuration
router.put('/system/:category',
    authenticateToken,
    checkPermission('admin'),
    (req, res) => {
        try {
            const config = settingsModel.updateSystemConfig(
                req.params.category,
                req.body,
                req.user.id
            );
            res.json({
                message: 'System configuration updated',
                config
            });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
);

// ============= Company Info Endpoints =============

// Get company information
router.get('/company', authenticateToken, (req, res) => {
    try {
        const companyInfo = settingsModel.getSystemConfig('companyInfo');
        res.json(companyInfo);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update company information
router.put('/company',
    authenticateToken,
    checkPermission('admin'),
    body('name').optional().isString(),
    body('email').optional().isEmail(),
    body('website').optional().isURL(),
    validateRequest,
    (req, res) => {
        try {
            const config = settingsModel.updateSystemConfig('companyInfo', req.body, req.user.id);
            res.json({
                message: 'Company information updated',
                config
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
);

// ============= Custom Fields Endpoints =============

// Get custom fields for an entity
router.get('/custom-fields/:entity',
    authenticateToken,
    (req, res) => {
        try {
            const fields = settingsModel.getSystemConfig('customFields')[req.params.entity];
            if (!fields) {
                return res.status(404).json({ error: 'Invalid entity type' });
            }
            res.json(fields);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
);

// Add custom field
router.post('/custom-fields/:entity',
    authenticateToken,
    checkPermission('admin'),
    body('name').notEmpty().matches(/^[a-z_][a-z0-9_]*$/),
    body('label').notEmpty(),
    body('type').isIn(['text', 'number', 'date', 'select', 'checkbox', 'textarea']),
    body('required').optional().isBoolean(),
    validateRequest,
    (req, res) => {
        try {
            const field = settingsModel.addCustomField(
                req.params.entity,
                req.body,
                req.user.id
            );
            res.status(201).json({
                message: 'Custom field added successfully',
                field
            });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
);

// Update custom field
router.put('/custom-fields/:entity/:fieldId',
    authenticateToken,
    checkPermission('admin'),
    (req, res) => {
        try {
            const field = settingsModel.updateCustomField(
                req.params.entity,
                req.params.fieldId,
                req.body,
                req.user.id
            );
            res.json({
                message: 'Custom field updated',
                field
            });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
);

// Delete custom field
router.delete('/custom-fields/:entity/:fieldId',
    authenticateToken,
    checkPermission('admin'),
    (req, res) => {
        try {
            const field = settingsModel.deleteCustomField(
                req.params.entity,
                req.params.fieldId,
                req.user.id
            );
            res.json({
                message: 'Custom field deleted',
                field
            });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
);

// ============= Role Management Endpoints =============

// Get all roles
router.get('/roles', authenticateToken, (req, res) => {
    try {
        const roles = settingsModel.getSystemConfig('roles');
        res.json(roles);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add new role
router.post('/roles',
    authenticateToken,
    checkPermission('admin'),
    body('name').notEmpty(),
    body('description').optional().isString(),
    body('permissions').isArray(),
    validateRequest,
    (req, res) => {
        try {
            const role = settingsModel.addRole(req.body, req.user.id);
            res.status(201).json({
                message: 'Role created successfully',
                role
            });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
);

// Update role
router.put('/roles/:roleId',
    authenticateToken,
    checkPermission('admin'),
    (req, res) => {
        try {
            const role = settingsModel.updateRole(
                req.params.roleId,
                req.body,
                req.user.id
            );
            res.json({
                message: 'Role updated successfully',
                role
            });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
);

// Delete role
router.delete('/roles/:roleId',
    authenticateToken,
    checkPermission('admin'),
    (req, res) => {
        try {
            const role = settingsModel.deleteRole(req.params.roleId, req.user.id);
            res.json({
                message: 'Role deleted successfully',
                role
            });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
);

// ============= Email Templates Endpoints =============

// Get all email templates
router.get('/email-templates',
    authenticateToken,
    (req, res) => {
        try {
            const templates = settingsModel.getEmailTemplates();
            res.json(templates);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
);

// Update email template
router.put('/email-templates/:templateKey',
    authenticateToken,
    checkPermission('admin'),
    body('subject').optional().isString(),
    body('body').optional().isString(),
    validateRequest,
    (req, res) => {
        try {
            const template = settingsModel.updateEmailTemplate(
                req.params.templateKey,
                req.body,
                req.user.id
            );
            res.json({
                message: 'Email template updated',
                template
            });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
);

// Add custom email template
router.post('/email-templates',
    authenticateToken,
    checkPermission('admin'),
    body('key').notEmpty().matches(/^[a-z_][a-z0-9_]*$/),
    body('subject').notEmpty(),
    body('body').notEmpty(),
    validateRequest,
    (req, res) => {
        try {
            const template = settingsModel.addEmailTemplate(
                req.body.key,
                { subject: req.body.subject, body: req.body.body },
                req.user.id
            );
            res.status(201).json({
                message: 'Email template created',
                template
            });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
);

// ============= Integration Endpoints =============

// Get integration settings
router.get('/integrations/:integration?',
    authenticateToken,
    checkPermission('admin'),
    (req, res) => {
        try {
            const integrations = req.params.integration
                ? settingsModel.getSystemConfig('integrations')[req.params.integration]
                : settingsModel.getSystemConfig('integrations');
            res.json(integrations);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
);

// Update integration settings
router.put('/integrations/:integration',
    authenticateToken,
    checkPermission('admin'),
    (req, res) => {
        try {
            const config = settingsModel.updateIntegration(
                req.params.integration,
                req.body,
                req.user.id
            );
            res.json({
                message: 'Integration settings updated',
                config
            });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
);

// Test integration
router.post('/integrations/:integration/test',
    authenticateToken,
    checkPermission('admin'),
    (req, res) => {
        try {
            const result = settingsModel.testIntegration(req.params.integration);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
);

// ============= Backup & Export Endpoints =============

// Export settings
router.get('/export',
    authenticateToken,
    checkPermission('admin'),
    query('format').optional().isIn(['json', 'csv']),
    validateRequest,
    (req, res) => {
        try {
            const format = req.query.format || 'json';
            const exportData = settingsModel.exportSettings(format, req.user.id);

            const contentType = format === 'csv' ? 'text/csv' : 'application/json';
            const filename = `crm-settings-${new Date().toISOString().split('T')[0]}.${format}`;

            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.send(exportData);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
);

// Import settings
router.post('/import',
    authenticateToken,
    checkPermission('admin'),
    (req, res) => {
        try {
            const result = settingsModel.importSettings(
                req.body,
                'json',
                req.user.id
            );
            res.json(result);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
);

// Create backup
router.post('/backup',
    authenticateToken,
    checkPermission('admin'),
    (req, res) => {
        try {
            const backup = settingsModel.createBackup(req.user.id);
            res.json({
                message: 'Backup created successfully',
                backup: {
                    id: backup.id,
                    timestamp: backup.timestamp,
                    size: backup.size
                }
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
);

// Get backup history
router.get('/backup/history',
    authenticateToken,
    checkPermission('admin'),
    (req, res) => {
        try {
            const backups = settingsModel.getSystemConfig('backup').backupHistory.map(b => ({
                id: b.id,
                timestamp: b.timestamp,
                createdBy: b.createdBy,
                size: b.size
            }));
            res.json(backups);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
);

// Restore from backup
router.post('/backup/restore/:backupId',
    authenticateToken,
    checkPermission('admin'),
    (req, res) => {
        try {
            const result = settingsModel.restoreBackup(req.params.backupId, req.user.id);
            res.json(result);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
);

// ============= Audit Log Endpoints =============

// Get audit log
router.get('/audit',
    authenticateToken,
    checkPermission('admin'),
    query('userId').optional().isString(),
    query('action').optional().isString(),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    validateRequest,
    (req, res) => {
        try {
            const logs = settingsModel.getAuditLog(req.query);
            res.json(logs);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
);

// ============= Search Settings =============

// Search settings
router.get('/search',
    authenticateToken,
    checkPermission('admin'),
    query('q').notEmpty(),
    validateRequest,
    (req, res) => {
        try {
            const results = settingsModel.searchSettings(req.query.q);
            res.json(results);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
);

// ============= Feature Flags =============

// Get feature flags
router.get('/features', authenticateToken, (req, res) => {
    try {
        const features = settingsModel.getSystemConfig('features');
        res.json(features);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update feature flags
router.put('/features',
    authenticateToken,
    checkPermission('admin'),
    (req, res) => {
        try {
            const features = settingsModel.updateSystemConfig('features', req.body, req.user.id);
            res.json({
                message: 'Feature flags updated',
                features
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
);

// ============= Notification Settings =============

// Get notification settings
router.get('/notifications', authenticateToken, (req, res) => {
    try {
        const notifications = settingsModel.getSystemConfig('notifications');
        res.json(notifications);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update notification settings
router.put('/notifications',
    authenticateToken,
    checkPermission('admin'),
    (req, res) => {
        try {
            const notifications = settingsModel.updateSystemConfig(
                'notifications',
                req.body,
                req.user.id
            );
            res.json({
                message: 'Notification settings updated',
                notifications
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
);

module.exports = router;
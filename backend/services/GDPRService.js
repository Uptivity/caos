// GDPR Compliance Service
// Handles data export, deletion, consent management, and privacy rights

const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;
const DatabaseService = require('./DatabaseService');
const { logger } = require('../utils/secureLogger');

class GDPRService {
    constructor() {
        this.exportDir = path.join(process.cwd(), 'exports');
        this.initialized = false;
    }

    /**
     * Initialize GDPR service
     */
    async initialize() {
        try {
            await this.ensureExportDirectory();
            await this.initializeGDPRSchema();
            this.initialized = true;
            logger.info('GDPRService initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize GDPRService', { error: error.message });
            throw error;
        }
    }

    /**
     * Ensure export directory exists
     */
    async ensureExportDirectory() {
        try {
            await fs.access(this.exportDir);
        } catch {
            await fs.mkdir(this.exportDir, { recursive: true });
            logger.info('Created GDPR exports directory', { path: this.exportDir });
        }
    }

    /**
     * Initialize GDPR database schema
     */
    async initializeGDPRSchema() {
        try {
            const schemaPath = path.join(__dirname, '../config/gdpr-schema.sql');
            const schema = await fs.readFile(schemaPath, 'utf8');

            const statements = schema
                .split(';')
                .map(stmt => stmt.trim())
                .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

            for (const statement of statements) {
                try {
                    await DatabaseService.query(statement);
                } catch (error) {
                    if (!error.message.includes('already exists')) {
                        logger.warn('GDPR schema statement failed', {
                            statement: statement.substring(0, 100),
                            error: error.message
                        });
                    }
                }
            }

            logger.info('GDPR database schema initialized');
        } catch (error) {
            logger.error('Failed to initialize GDPR schema', { error: error.message });
        }
    }

    /**
     * Export user data (GDPR Article 20 - Right to data portability)
     * @param {number} userId - User ID
     * @param {object} options - Export options
     * @returns {object} Export request details
     */
    async requestDataExport(userId, options = {}) {
        if (!this.initialized) await this.initialize();

        try {
            const {
                format = 'json',
                includeDeleted = false,
                tables = null,
                email = null
            } = options;

            // Validate user exists
            const user = await DatabaseService.findById('users', userId);
            if (!user) {
                throw new Error('User not found');
            }

            // Create export request record
            const exportRequest = await DatabaseService.create('data_export_requests', {
                user_id: userId,
                request_type: tables ? 'partial_export' : 'full_export',
                export_format: format,
                requested_data: JSON.stringify(tables || {}),
                verification_token: this.generateToken(),
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
                ip_address: options.ipAddress,
                user_agent: options.userAgent
            });

            // Process export in background
            this.processDataExport(exportRequest.id, userId, {
                format,
                includeDeleted,
                tables,
                email
            }).catch(error => {
                logger.error('Background data export failed', {
                    exportId: exportRequest.id,
                    userId,
                    error: error.message
                });
            });

            logger.info('Data export requested', {
                exportId: exportRequest.id,
                userId,
                format,
                tables: tables ? Object.keys(tables) : 'all'
            });

            return {
                exportId: exportRequest.id,
                status: 'pending',
                estimatedCompletion: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
                downloadUrl: `/api/gdpr/export/${exportRequest.id}/download?token=${exportRequest.verification_token}`,
                expiresAt: exportRequest.expires_at
            };
        } catch (error) {
            logger.error('Data export request failed', { userId, error: error.message });
            throw error;
        }
    }

    /**
     * Process data export
     * @param {number} exportId - Export request ID
     * @param {number} userId - User ID
     * @param {object} options - Export options
     */
    async processDataExport(exportId, userId, options) {
        try {
            // Update status to processing
            await DatabaseService.update('data_export_requests', exportId, {
                status: 'processing'
            });

            // Collect user data
            const userData = await this.collectUserData(userId, options);

            // Generate export file
            const fileName = `user_data_export_${userId}_${Date.now()}.${options.format}`;
            const filePath = path.join(this.exportDir, fileName);

            await this.createExportFile(userData, filePath, options.format);

            // Get file size
            const stats = await fs.stat(filePath);

            // Update export request
            await DatabaseService.update('data_export_requests', exportId, {
                status: 'completed',
                file_path: fileName,
                file_size: stats.size
            });

            logger.info('Data export completed', {
                exportId,
                userId,
                fileName,
                fileSize: stats.size
            });

        } catch (error) {
            await DatabaseService.update('data_export_requests', exportId, {
                status: 'failed'
            });
            logger.error('Data export processing failed', { exportId, userId, error: error.message });
            throw error;
        }
    }

    /**
     * Collect all user data for export
     * @param {number} userId - User ID
     * @param {object} options - Collection options
     * @returns {object} Collected user data
     */
    async collectUserData(userId, options = {}) {
        const userData = {
            exportMetadata: {
                userId,
                exportDate: new Date().toISOString(),
                format: options.format,
                includeDeleted: options.includeDeleted
            },
            personalData: {},
            activityData: {},
            preferences: {}
        };

        // User basic information
        const user = await DatabaseService.findById('users', userId);
        userData.personalData.profile = this.sanitizeForExport(user);

        // User consents
        const consents = await DatabaseService.find('user_consents', { user_id: userId });
        userData.personalData.consents = consents.map(c => this.sanitizeForExport(c));

        // Privacy settings
        const privacySettings = await DatabaseService.find('privacy_settings', { user_id: userId });
        userData.preferences.privacy = privacySettings.map(p => this.sanitizeForExport(p));

        // Leads data (if user created leads)
        try {
            const leads = await DatabaseService.find('leads', { created_by: userId });
            userData.activityData.leads = leads.map(l => this.sanitizeForExport(l));
        } catch (error) {
            logger.warn('Failed to export leads data', { userId, error: error.message });
        }

        // Campaign data
        try {
            const campaigns = await DatabaseService.find('campaigns', { created_by: userId });
            userData.activityData.campaigns = campaigns.map(c => this.sanitizeForExport(c));
        } catch (error) {
            logger.warn('Failed to export campaigns data', { userId, error: error.message });
        }

        // Tasks data
        try {
            const tasks = await DatabaseService.find('tasks', { assigned_to: userId });
            userData.activityData.tasks = tasks.map(t => this.sanitizeForExport(t));
        } catch (error) {
            logger.warn('Failed to export tasks data', { userId, error: error.message });
        }

        // Calendar events
        try {
            const events = await DatabaseService.find('calendar_events', { created_by: userId });
            userData.activityData.calendarEvents = events.map(e => this.sanitizeForExport(e));
        } catch (error) {
            logger.warn('Failed to export calendar data', { userId, error: error.message });
        }

        return userData;
    }

    /**
     * Request user data deletion (GDPR Article 17 - Right to be forgotten)
     * @param {number|string} userId - User ID or email
     * @param {object} options - Deletion options
     * @returns {object} Deletion request details
     */
    async requestDataDeletion(userId, options = {}) {
        if (!this.initialized) await this.initialize();

        try {
            const {
                deletionType = 'full_deletion',
                reason = 'User requested data deletion',
                email = null,
                specificData = null
            } = options;

            let user;
            if (typeof userId === 'string' && userId.includes('@')) {
                // Email provided
                user = await DatabaseService.find('users', { email: userId.toLowerCase() });
                user = user[0] || null;
            } else {
                // User ID provided
                user = await DatabaseService.findById('users', userId);
            }

            if (!user) {
                throw new Error('User not found');
            }

            // Create deletion request
            const deletionRequest = await DatabaseService.create('data_deletion_requests', {
                user_id: user.id,
                email: user.email,
                request_type: deletionType,
                requested_data: JSON.stringify(specificData || {}),
                deletion_reason: reason,
                verification_token: this.generateToken(),
                ip_address: options.ipAddress,
                user_agent: options.userAgent
            });

            logger.info('Data deletion requested', {
                deletionId: deletionRequest.id,
                userId: user.id,
                email: user.email,
                deletionType,
                reason
            });

            return {
                deletionId: deletionRequest.id,
                status: 'pending',
                verificationRequired: true,
                verificationUrl: `/api/gdpr/deletion/${deletionRequest.id}/verify?token=${deletionRequest.verification_token}`,
                estimatedCompletion: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
            };
        } catch (error) {
            logger.error('Data deletion request failed', { userId, error: error.message });
            throw error;
        }
    }

    /**
     * Verify and process data deletion
     * @param {number} deletionId - Deletion request ID
     * @param {string} token - Verification token
     * @returns {object} Verification result
     */
    async verifyDataDeletion(deletionId, token) {
        try {
            const deletionRequest = await DatabaseService.findById('data_deletion_requests', deletionId);

            if (!deletionRequest || deletionRequest.verification_token !== token) {
                throw new Error('Invalid verification token');
            }

            if (deletionRequest.verified_at) {
                throw new Error('Deletion request already verified');
            }

            // Mark as verified
            await DatabaseService.update('data_deletion_requests', deletionId, {
                verified_at: new Date().toISOString(),
                status: 'in_progress'
            });

            // Process deletion
            await this.processDataDeletion(deletionRequest);

            return {
                verified: true,
                status: 'processing',
                message: 'Data deletion has been verified and is now in progress'
            };
        } catch (error) {
            logger.error('Data deletion verification failed', { deletionId, error: error.message });
            throw error;
        }
    }

    /**
     * Process actual data deletion
     * @param {object} deletionRequest - Deletion request details
     */
    async processDataDeletion(deletionRequest) {
        try {
            const userId = deletionRequest.user_id;

            switch (deletionRequest.request_type) {
                case 'full_deletion':
                    await this.performFullDeletion(userId);
                    break;
                case 'partial_deletion':
                    await this.performPartialDeletion(userId, JSON.parse(deletionRequest.requested_data || '{}'));
                    break;
                case 'anonymization':
                    await this.performAnonymization(userId);
                    break;
                default:
                    throw new Error('Invalid deletion type');
            }

            // Update deletion request status
            await DatabaseService.update('data_deletion_requests', deletionRequest.id, {
                status: 'completed',
                processed_at: new Date().toISOString(),
                completion_notes: 'Data deletion completed successfully'
            });

            logger.info('Data deletion completed', {
                deletionId: deletionRequest.id,
                userId,
                type: deletionRequest.request_type
            });
        } catch (error) {
            await DatabaseService.update('data_deletion_requests', deletionRequest.id, {
                status: 'failed',
                completion_notes: `Deletion failed: ${error.message}`
            });
            logger.error('Data deletion processing failed', { deletionRequest: deletionRequest.id, error: error.message });
            throw error;
        }
    }

    /**
     * Perform full user data deletion
     * @param {number} userId - User ID
     */
    async performFullDeletion(userId) {
        const connection = await DatabaseService.beginTransaction();

        try {
            // Delete from related tables first (foreign key constraints)
            const tablesToClean = [
                'user_consents',
                'privacy_settings',
                'data_export_requests',
                'audit_logs',
                'leads',
                'campaigns',
                'tasks',
                'calendar_events',
                'email_accounts',
                'reports',
                'documents'
            ];

            for (const table of tablesToClean) {
                try {
                    await connection.execute(`DELETE FROM ${table} WHERE user_id = ?`, [userId]);
                    logger.info(`Deleted user data from ${table}`, { userId });
                } catch (error) {
                    logger.warn(`Failed to delete from ${table}`, { userId, error: error.message });
                }
            }

            // Update user record to mark as deleted
            await connection.execute(
                `UPDATE users SET
                    email = CONCAT('deleted_', id, '@deleted.local'),
                    first_name = 'DELETED',
                    last_name = 'USER',
                    password_hash = 'DELETED',
                    is_active = false,
                    gdpr_status = 'deleted',
                    anonymization_date = NOW()
                WHERE id = ?`,
                [userId]
            );

            await connection.commit();
            logger.info('Full user deletion completed', { userId });
        } catch (error) {
            await connection.rollback();
            throw error;
        }
    }

    /**
     * Perform user data anonymization
     * @param {number} userId - User ID
     */
    async performAnonymization(userId) {
        const anonymizedId = this.generateAnonymousId();

        await DatabaseService.update('users', userId, {
            email: `anonymous_${anonymizedId}@anonymized.local`,
            first_name: 'Anonymous',
            last_name: 'User',
            company: null,
            gdpr_status: 'anonymized',
            anonymization_date: new Date().toISOString()
        });

        logger.info('User data anonymized', { userId, anonymizedId });
    }

    /**
     * Create export file in specified format
     * @param {object} data - Data to export
     * @param {string} filePath - File path
     * @param {string} format - Export format
     */
    async createExportFile(data, filePath, format) {
        switch (format.toLowerCase()) {
            case 'json':
                await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
                break;
            case 'csv':
                const csv = this.convertToCSV(data);
                await fs.writeFile(filePath, csv, 'utf8');
                break;
            case 'xml':
                const xml = this.convertToXML(data);
                await fs.writeFile(filePath, xml, 'utf8');
                break;
            default:
                throw new Error(`Unsupported export format: ${format}`);
        }
    }

    /**
     * Convert data to CSV format
     * @param {object} data - Data to convert
     * @returns {string} CSV string
     */
    convertToCSV(data) {
        const lines = [];
        lines.push('Section,Key,Value,Date');

        const processObject = (obj, section = '') => {
            for (const [key, value] of Object.entries(obj)) {
                if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                    processObject(value, section ? `${section}.${key}` : key);
                } else {
                    const csvValue = Array.isArray(value) ? JSON.stringify(value) : String(value || '');
                    lines.push(`"${section}","${key}","${csvValue.replace(/"/g, '""')}","${new Date().toISOString()}"`);
                }
            }
        };

        processObject(data);
        return lines.join('\n');
    }

    /**
     * Convert data to XML format
     * @param {object} data - Data to convert
     * @returns {string} XML string
     */
    convertToXML(data) {
        const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>\n';
        const xmlData = this.objectToXML(data, 'UserDataExport');
        return xmlHeader + xmlData;
    }

    /**
     * Convert object to XML recursively
     * @param {*} obj - Object to convert
     * @param {string} rootName - Root element name
     * @returns {string} XML string
     */
    objectToXML(obj, rootName) {
        if (obj === null || obj === undefined) return `<${rootName}></${rootName}>`;
        if (typeof obj !== 'object') return `<${rootName}>${this.escapeXML(String(obj))}</${rootName}>`;

        let xml = `<${rootName}>`;
        for (const [key, value] of Object.entries(obj)) {
            xml += this.objectToXML(value, key);
        }
        xml += `</${rootName}>`;
        return xml;
    }

    /**
     * Escape XML special characters
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    escapeXML(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    /**
     * Sanitize data for export (remove sensitive fields)
     * @param {object} data - Data to sanitize
     * @returns {object} Sanitized data
     */
    sanitizeForExport(data) {
        const sensitive = ['password_hash', 'verification_token', 'session_id'];
        const sanitized = { ...data };

        sensitive.forEach(field => {
            if (sanitized[field]) {
                delete sanitized[field];
            }
        });

        return sanitized;
    }

    /**
     * Generate secure token
     * @returns {string} Generated token
     */
    generateToken() {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Generate anonymous ID
     * @returns {string} Anonymous ID
     */
    generateAnonymousId() {
        return crypto.randomBytes(8).toString('hex');
    }

    /**
     * Get GDPR compliance status for user
     * @param {number} userId - User ID
     * @returns {object} Compliance status
     */
    async getComplianceStatus(userId) {
        try {
            const user = await DatabaseService.findById('users', userId);
            if (!user) throw new Error('User not found');

            const consents = await DatabaseService.find('user_consents', {
                user_id: userId,
                is_active: true
            });

            const exportRequests = await DatabaseService.find('data_export_requests', {
                user_id: userId
            });

            const deletionRequests = await DatabaseService.find('data_deletion_requests', {
                user_id: userId
            });

            return {
                userId,
                gdprStatus: user.gdpr_status || 'active',
                consentDate: user.gdpr_consent_date,
                dataRetentionUntil: user.data_retention_until,
                consents: consents.map(c => ({
                    type: c.consent_type,
                    given: c.consent_given,
                    date: c.consent_date,
                    version: c.version
                })),
                dataRequests: {
                    exports: exportRequests.length,
                    deletions: deletionRequests.length
                },
                lastUpdate: user.updated_at
            };
        } catch (error) {
            logger.error('Failed to get compliance status', { userId, error: error.message });
            throw error;
        }
    }
}

// Export singleton instance
module.exports = new GDPRService();
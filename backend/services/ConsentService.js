// Consent Management Service
// Handles GDPR consent tracking and management

const DatabaseService = require('./DatabaseService');
const AuditLogger = require('../utils/AuditLogger');
const { logger } = require('../utils/secureLogger');

class ConsentService {
    constructor() {
        this.initialized = false;
        this.consentTypes = new Map([
            ['data_processing', {
                name: 'Data Processing',
                description: 'Consent for processing personal data for service delivery',
                required: true,
                legalBasis: 'consent'
            }],
            ['marketing', {
                name: 'Marketing Communications',
                description: 'Consent for marketing emails and communications',
                required: false,
                legalBasis: 'consent'
            }],
            ['analytics', {
                name: 'Analytics and Performance',
                description: 'Consent for analytics and performance tracking',
                required: false,
                legalBasis: 'legitimate_interests'
            }],
            ['cookies', {
                name: 'Cookie Usage',
                description: 'Consent for non-essential cookies and tracking',
                required: false,
                legalBasis: 'consent'
            }],
            ['third_party_sharing', {
                name: 'Third-Party Data Sharing',
                description: 'Consent for sharing data with trusted third-party services',
                required: false,
                legalBasis: 'consent'
            }]
        ]);
    }

    /**
     * Initialize consent service
     */
    async initialize() {
        try {
            await this.ensureDefaultConsents();
            this.initialized = true;
            logger.info('ConsentService initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize ConsentService', { error: error.message });
            throw error;
        }
    }

    /**
     * Ensure default consents exist for all users
     */
    async ensureDefaultConsents() {
        try {
            // Get all users without consent records
            const __res = await DatabaseService.query(`
                SELECT u.id, u.email, u.created_at
                FROM users u
                LEFT JOIN user_consents uc ON u.id = uc.user_id AND uc.consent_type = 'data_processing' AND uc.is_active = true
                WHERE uc.id IS NULL
                AND u.is_active = true
            `);
const users = Array.isArray(__res)
  ? (Array.isArray(__res[0]) ? __res[0] : __res)
  : (Array.isArray(__res && __res.rows) ? __res.rows : []);

            for (const user of users) {
                await this.createDefaultConsent(user.id, {
                    ipAddress: '127.0.0.1',
                    userAgent: 'System Default',
                    consentDate: user.created_at
                });
            }

            if (users.length > 0) {
                logger.info('Created default consents for existing users', { count: users.length });
            }

        } catch (error) {
            logger.warn('Failed to ensure default consents', { error: error.message });
        }
    }

    /**
     * Create default consent for new user
     * @param {number} userId - User ID
     * @param {object} context - Request context
     */
    async createDefaultConsent(userId, context = {}) {
        try {
            const defaultConsent = {
                user_id: userId,
                consent_type: 'data_processing',
                consent_given: true,
                consent_text: 'I consent to the processing of my personal data for the purpose of providing CRM services, managing my account, and fulfilling contractual obligations.',
                version: '1.0',
                legal_basis: 'contract',
                ip_address: context.ipAddress,
                user_agent: context.userAgent,
                consent_date: context.consentDate || new Date().toISOString(),
                is_active: true
            };

            const consent = await DatabaseService.create('user_consents', defaultConsent);

            // Log consent creation
            await AuditLogger.logGDPREvent({
                userId: userId,
                gdprAction: 'CONSENT_CREATED',
                requestType: 'default_consent',
                status: 'completed',
                details: {
                    consentType: 'data_processing',
                    consentGiven: true,
                    legalBasis: 'contract'
                },
                ipAddress: context.ipAddress,
                userAgent: context.userAgent
            });

            return consent;

        } catch (error) {
            logger.error('Failed to create default consent', { userId, error: error.message });
            throw error;
        }
    }

    /**
     * Record user consent
     * @param {number} userId - User ID
     * @param {string} consentType - Type of consent
     * @param {boolean} consentGiven - Whether consent is given
     * @param {object} options - Additional options
     * @returns {object} Consent record
     */
    async recordConsent(userId, consentType, consentGiven, options = {}) {
        if (!this.initialized) await this.initialize();

        try {
            const {
                consentText = '',
                version = '1.0',
                legalBasis = 'consent',
                ipAddress = null,
                userAgent = null
            } = options;

            // Validate consent type
            const consentTypeInfo = this.consentTypes.get(consentType);
            if (!consentTypeInfo) {
                throw new Error(`Invalid consent type: ${consentType}`);
            }

            // Deactivate existing consents of same type
            await DatabaseService.query(
                `UPDATE user_consents SET is_active = false WHERE user_id = ? AND consent_type = ? AND is_active = true`,
                [userId, consentType]
            );

            // Create new consent record
            const consentData = {
                user_id: userId,
                consent_type: consentType,
                consent_given: consentGiven,
                consent_text: consentText || this.getDefaultConsentText(consentType),
                version: version,
                legal_basis: legalBasis,
                ip_address: ipAddress,
                user_agent: userAgent,
                consent_date: new Date().toISOString(),
                withdrawal_date: consentGiven ? null : new Date().toISOString(),
                is_active: true
            };

            const consent = await DatabaseService.create('user_consents', consentData);

            // Log consent event
            await AuditLogger.logGDPREvent({
                userId: userId,
                gdprAction: consentGiven ? 'CONSENT_GIVEN' : 'CONSENT_WITHDRAWN',
                requestType: 'user_consent',
                status: 'completed',
                details: {
                    consentType: consentType,
                    consentGiven: consentGiven,
                    legalBasis: legalBasis,
                    version: version
                },
                ipAddress: ipAddress,
                userAgent: userAgent
            });

            logger.info('Consent recorded', {
                userId,
                consentType,
                consentGiven,
                version,
                legalBasis
            });

            return consent;

        } catch (error) {
            logger.error('Failed to record consent', {
                userId,
                consentType,
                consentGiven,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get user consents
     * @param {number} userId - User ID
     * @param {object} options - Query options
     * @returns {Array} User consents
     */
    async getUserConsents(userId, options = {}) {
        try {
            const {
                consentType = null,
                activeOnly = true,
                includeHistory = false
            } = options;

            let query = `
                SELECT *
                FROM user_consents
                WHERE user_id = ?
            `;
            const params = [userId];

            if (consentType) {
                query += ' AND consent_type = ?';
                params.push(consentType);
            }

            if (activeOnly) {
                query += ' AND is_active = true';
            }

            query += ' ORDER BY consent_date DESC';

            const __res = await DatabaseService.query(query, params);
const consents = Array.isArray(__res)
  ? (Array.isArray(__res[0]) ? __res[0] : __res)
  : (Array.isArray(__res && __res.rows) ? __res.rows : []);

            // If not including history, return only the latest consent per type
            if (!includeHistory && !consentType) {
                const latestConsents = new Map();
                for (const consent of consents) {
                    if (!latestConsents.has(consent.consent_type)) {
                        latestConsents.set(consent.consent_type, consent);
                    }
                }
                return Array.from(latestConsents.values());
            }

            return consents;

        } catch (error) {
            logger.error('Failed to get user consents', { userId, error: error.message });
            throw error;
        }
    }

    /**
     * Check if user has given consent for specific type
     * @param {number} userId - User ID
     * @param {string} consentType - Consent type
     * @returns {boolean} Whether consent is given
     */
    async hasConsent(userId, consentType) {
        try {
            const __res = await DatabaseService.query(
                `SELECT consent_given FROM user_consents
                 WHERE user_id = ? AND consent_type = ? AND is_active = true
                 ORDER BY consent_date DESC LIMIT 1`,
                [userId, consentType]
            );
const consents = Array.isArray(__res)
  ? (Array.isArray(__res[0]) ? __res[0] : __res)
  : (Array.isArray(__res && __res.rows) ? __res.rows : []);

            return consents.length > 0 && consents[0].consent_given;

        } catch (error) {
            logger.error('Failed to check consent', { userId, consentType, error: error.message });
            return false;
        }
    }

    /**
     * Withdraw consent
     * @param {number} userId - User ID
     * @param {string} consentType - Consent type
     * @param {object} options - Additional options
     * @returns {object} Updated consent record
     */
    async withdrawConsent(userId, consentType, options = {}) {
        try {
            // Check if consent type is required
            const consentTypeInfo = this.consentTypes.get(consentType);
            if (consentTypeInfo && consentTypeInfo.required) {
                throw new Error(`Cannot withdraw required consent: ${consentType}`);
            }

            return await this.recordConsent(userId, consentType, false, options);

        } catch (error) {
            logger.error('Failed to withdraw consent', { userId, consentType, error: error.message });
            throw error;
        }
    }

    /**
     * Update consent preferences
     * @param {number} userId - User ID
     * @param {object} preferences - Consent preferences
     * @param {object} context - Request context
     * @returns {Array} Updated consents
     */
    async updateConsentPreferences(userId, preferences, context = {}) {
        try {
            const updatedConsents = [];

            for (const [consentType, consentGiven] of Object.entries(preferences)) {
                if (this.consentTypes.has(consentType)) {
                    const consent = await this.recordConsent(
                        userId,
                        consentType,
                        consentGiven,
                        context
                    );
                    updatedConsents.push(consent);
                }
            }

            // Log bulk consent update
            await AuditLogger.logGDPREvent({
                userId: userId,
                gdprAction: 'CONSENT_PREFERENCES_UPDATED',
                requestType: 'bulk_consent_update',
                status: 'completed',
                details: {
                    updatedTypes: Object.keys(preferences),
                    preferences: preferences
                },
                ipAddress: context.ipAddress,
                userAgent: context.userAgent
            });

            logger.info('Consent preferences updated', {
                userId,
                updatedTypes: Object.keys(preferences)
            });

            return updatedConsents;

        } catch (error) {
            logger.error('Failed to update consent preferences', {
                userId,
                preferences,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get consent summary for user
     * @param {number} userId - User ID
     * @returns {object} Consent summary
     */
    async getConsentSummary(userId) {
        try {
            const consents = await this.getUserConsents(userId, { activeOnly: true });
            const summary = {
                userId: userId,
                totalConsents: consents.length,
                consentTypes: {},
                complianceStatus: 'compliant',
                lastUpdated: null
            };

            // Process each consent type
            for (const [type, info] of this.consentTypes) {
                const userConsent = consents.find(c => c.consent_type === type);

                summary.consentTypes[type] = {
                    name: info.name,
                    description: info.description,
                    required: info.required,
                    legalBasis: info.legalBasis,
                    consentGiven: userConsent ? userConsent.consent_given : false,
                    consentDate: userConsent ? userConsent.consent_date : null,
                    version: userConsent ? userConsent.version : null
                };

                // Check compliance
                if (info.required && (!userConsent || !userConsent.consent_given)) {
                    summary.complianceStatus = 'non-compliant';
                }

                // Track last update
                if (userConsent && userConsent.consent_date) {
                    const consentDate = new Date(userConsent.consent_date);
                    if (!summary.lastUpdated || consentDate > new Date(summary.lastUpdated)) {
                        summary.lastUpdated = userConsent.consent_date;
                    }
                }
            }

            return summary;

        } catch (error) {
            logger.error('Failed to get consent summary', { userId, error: error.message });
            throw error;
        }
    }

    /**
     * Get consent statistics
     * @param {object} options - Query options
     * @returns {object} Consent statistics
     */
    async getConsentStatistics(options = {}) {
        try {
            const {
                startDate = null,
                endDate = null,
                consentType = null
            } = options;

            let whereClause = 'WHERE 1=1';
            const params = [];

            if (startDate) {
                whereClause += ' AND consent_date >= ?';
                params.push(startDate);
            }

            if (endDate) {
                whereClause += ' AND consent_date <= ?';
                params.push(endDate);
            }

            if (consentType) {
                whereClause += ' AND consent_type = ?';
                params.push(consentType);
            }

            const queries = {
                totalConsents: `SELECT COUNT(*) as count FROM user_consents ${whereClause}`,

                consentsByType: `
                    SELECT consent_type, consent_given, COUNT(*) as count
                    FROM user_consents ${whereClause} AND is_active = true
                    GROUP BY consent_type, consent_given
                    ORDER BY consent_type, consent_given
                `,

                consentsByDate: `
                    SELECT DATE(consent_date) as date, COUNT(*) as count
                    FROM user_consents ${whereClause}
                    GROUP BY DATE(consent_date)
                    ORDER BY date DESC
                    LIMIT 30
                `,

                legalBasisBreakdown: `
                    SELECT legal_basis, COUNT(*) as count
                    FROM user_consents ${whereClause} AND is_active = true
                    GROUP BY legal_basis
                    ORDER BY count DESC
                `,

                withdrawalRate: `
                    SELECT
                        consent_type,
                        COUNT(*) as total,
                        SUM(CASE WHEN consent_given = false THEN 1 ELSE 0 END) as withdrawn,
                        ROUND((SUM(CASE WHEN consent_given = false THEN 1 ELSE 0 END) * 100.0 / COUNT(*)), 2) as withdrawal_rate
                    FROM user_consents ${whereClause}
                    GROUP BY consent_type
                    ORDER BY withdrawal_rate DESC
                `
            };

            const results = {};
            for (const [key, query] of Object.entries(queries)) {
                const __res = await DatabaseService.query(query, params);
const rows = Array.isArray(__res)
  ? (Array.isArray(__res[0]) ? __res[0] : __res)
  : (Array.isArray(__res && __res.rows) ? __res.rows : []);
                results[key] = rows;
            }

            return {
                totalConsents: results.totalConsents[0]?.count || 0,
                consentsByType: results.consentsByType,
                consentsByDate: results.consentsByDate,
                legalBasisBreakdown: results.legalBasisBreakdown,
                withdrawalRate: results.withdrawalRate,
                generatedAt: new Date().toISOString()
            };

        } catch (error) {
            logger.error('Failed to get consent statistics', { error: error.message });
            throw error;
        }
    }

    /**
     * Validate consent requirements for operation
     * @param {number} userId - User ID
     * @param {string} operation - Operation requiring consent
     * @returns {object} Validation result
     */
    async validateConsentForOperation(userId, operation) {
        try {
            const requiredConsents = this.getRequiredConsentsForOperation(operation);
            const userConsents = await this.getUserConsents(userId, { activeOnly: true });

            const validation = {
                userId: userId,
                operation: operation,
                valid: true,
                missingConsents: [],
                withdrawnConsents: [],
                details: {}
            };

            for (const requiredType of requiredConsents) {
                const userConsent = userConsents.find(c => c.consent_type === requiredType);

                if (!userConsent) {
                    validation.valid = false;
                    validation.missingConsents.push(requiredType);
                } else if (!userConsent.consent_given) {
                    validation.valid = false;
                    validation.withdrawnConsents.push(requiredType);
                }

                validation.details[requiredType] = {
                    required: true,
                    given: userConsent ? userConsent.consent_given : false,
                    date: userConsent ? userConsent.consent_date : null
                };
            }

            return validation;

        } catch (error) {
            logger.error('Failed to validate consent for operation', {
                userId,
                operation,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get required consents for specific operation
     * @param {string} operation - Operation name
     * @returns {Array} Required consent types
     */
    getRequiredConsentsForOperation(operation) {
        const operationConsents = {
            'data_export': ['data_processing'],
            'marketing_email': ['data_processing', 'marketing'],
            'analytics_tracking': ['analytics'],
            'third_party_integration': ['data_processing', 'third_party_sharing'],
            'profile_update': ['data_processing'],
            'account_deletion': [] // No consent required for deletion
        };

        return operationConsents[operation] || ['data_processing'];
    }

    /**
     * Get default consent text for consent type
     * @param {string} consentType - Consent type
     * @returns {string} Default consent text
     */
    getDefaultConsentText(consentType) {
        const defaultTexts = {
            'data_processing': 'I consent to the processing of my personal data for the purpose of providing CRM services, managing my account, and fulfilling contractual obligations.',
            'marketing': 'I consent to receiving marketing communications, promotional emails, and updates about new features and services.',
            'analytics': 'I consent to the collection and analysis of usage data to improve the service and user experience.',
            'cookies': 'I consent to the use of cookies and similar tracking technologies for enhanced functionality and personalized experience.',
            'third_party_sharing': 'I consent to sharing my data with trusted third-party services necessary for service delivery and functionality.'
        };

        return defaultTexts[consentType] || 'I provide my consent for the specified data processing activity.';
    }

    /**
     * Get available consent types
     * @returns {Array} Available consent types
     */
    getConsentTypes() {
        return Array.from(this.consentTypes.entries()).map(([type, info]) => ({
            type: type,
            ...info
        }));
    }

    /**
     * Clean up expired consents (if needed)
     * @param {number} retentionDays - Days to retain withdrawn consents
     */
    async cleanupExpiredConsents(retentionDays = 2555) { // 7 years default
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

            const __res = await DatabaseService.query(`
                DELETE FROM user_consents
                WHERE consent_given = false
                AND withdrawal_date < ?
                AND is_active = false
            `, [cutoffDate.toISOString()]);
const result = Array.isArray(__res)
  ? (Array.isArray(__res[0]) ? __res[0] : __res)
  : (Array.isArray(__res && __res.rows) ? __res.rows : []);

            const deletedCount = result.affectedRows || 0;

            if (deletedCount > 0) {
                logger.info('Expired consents cleaned up', {
                    deletedCount,
                    retentionDays,
                    cutoffDate: cutoffDate.toISOString()
                });
            }

            return deletedCount;

        } catch (error) {
            logger.error('Failed to cleanup expired consents', { error: error.message });
            throw error;
        }
    }
}

// Export singleton instance
module.exports = new ConsentService();
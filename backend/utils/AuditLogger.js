// GDPR Audit Logger
// Tracks all data access and modifications for compliance

const DatabaseService = require('../services/DatabaseService');
const { logger } = require('./secureLogger');

class AuditLogger {
    constructor() {
        this.initialized = false;
        this.auditQueue = [];
        this.maxQueueSize = 1000;
        this.batchSize = 50;
        this.flushInterval = 30000; // 30 seconds
        this.intervalId = null;
    }

    /**
     * Initialize audit logger
     */
    async initialize() {
        try {
            // Start batch processing
            this.intervalId = setInterval(() => {
                this.flushAuditQueue().catch(error => {
                    logger.error('Audit queue flush failed', { error: error.message });
                });
            }, this.flushInterval);

            this.initialized = true;
            logger.info('AuditLogger initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize AuditLogger', { error: error.message });
            throw error;
        }
    }

    /**
     * Log data access event
     * @param {object} params - Audit parameters
     */
    async logDataAccess(params) {
        if (!this.initialized) await this.initialize();

        try {
            const auditEntry = {
                user_id: params.userId || null,
                action: params.action || 'READ',
                table_name: params.tableName || 'unknown',
                record_id: params.recordId || null,
                old_values: null,
                new_values: params.data ? JSON.stringify(this.sanitizeAuditData(params.data)) : null,
                ip_address: params.ipAddress || null,
                user_agent: params.userAgent || null,
                endpoint: params.endpoint || null,
                method: params.method || 'GET',
                session_id: params.sessionId || null,
                created_at: new Date().toISOString()
            };

            // Add to queue for batch processing
            this.auditQueue.push(auditEntry);

            // Flush immediately if queue is full
            if (this.auditQueue.length >= this.maxQueueSize) {
                await this.flushAuditQueue();
            }

        } catch (error) {
            logger.error('Failed to log data access', {
                error: error.message,
                params: this.sanitizeAuditData(params)
            });
        }
    }

    /**
     * Log data modification event
     * @param {object} params - Audit parameters
     */
    async logDataModification(params) {
        if (!this.initialized) await this.initialize();

        try {
            const auditEntry = {
                user_id: params.userId || null,
                action: params.action || 'UPDATE',
                table_name: params.tableName || 'unknown',
                record_id: params.recordId || null,
                old_values: params.oldData ? JSON.stringify(this.sanitizeAuditData(params.oldData)) : null,
                new_values: params.newData ? JSON.stringify(this.sanitizeAuditData(params.newData)) : null,
                ip_address: params.ipAddress || null,
                user_agent: params.userAgent || null,
                endpoint: params.endpoint || null,
                method: params.method || 'POST',
                session_id: params.sessionId || null,
                created_at: new Date().toISOString()
            };

            // Add to queue for batch processing
            this.auditQueue.push(auditEntry);

            // Flush immediately for critical operations
            if (['DELETE', 'UPDATE'].includes(params.action)) {
                await this.flushAuditQueue();
            }

        } catch (error) {
            logger.error('Failed to log data modification', {
                error: error.message,
                params: this.sanitizeAuditData(params)
            });
        }
    }

    /**
     * Log GDPR-specific events
     * @param {object} params - GDPR event parameters
     */
    async logGDPREvent(params) {
        if (!this.initialized) await this.initialize();

        try {
            const auditEntry = {
                user_id: params.userId || null,
                action: `GDPR_${params.gdprAction}`,
                table_name: 'gdpr_events',
                record_id: params.requestId || null,
                old_values: null,
                new_values: JSON.stringify({
                    gdprAction: params.gdprAction,
                    requestType: params.requestType,
                    status: params.status,
                    details: this.sanitizeAuditData(params.details || {})
                }),
                ip_address: params.ipAddress || null,
                user_agent: params.userAgent || null,
                endpoint: params.endpoint || null,
                method: params.method || 'POST',
                session_id: params.sessionId || null,
                created_at: new Date().toISOString()
            };

            // GDPR events are high priority - flush immediately
            this.auditQueue.push(auditEntry);
            await this.flushAuditQueue();

        } catch (error) {
            logger.error('Failed to log GDPR event', {
                error: error.message,
                params: this.sanitizeAuditData(params)
            });
        }
    }

    /**
     * Flush audit queue to database
     */
    async flushAuditQueue() {
        if (this.auditQueue.length === 0) return;

        try {
            const batch = this.auditQueue.splice(0, this.batchSize);

            if (batch.length === 0) return;

            // Bulk insert audit entries
            const values = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
            const params = batch.flatMap(entry => [
                entry.user_id,
                entry.action,
                entry.table_name,
                entry.record_id,
                entry.old_values,
                entry.new_values,
                entry.ip_address,
                entry.user_agent,
                entry.endpoint,
                entry.method,
                entry.session_id,
                entry.created_at
            ]);

            const query = `
                INSERT INTO audit_logs (
                    user_id, action, table_name, record_id, old_values, new_values,
                    ip_address, user_agent, endpoint, method, session_id, created_at
                ) VALUES ${values}
            `;

            await DatabaseService.query(query, params);

            logger.debug(`Flushed ${batch.length} audit entries to database`);

        } catch (error) {
            logger.error('Failed to flush audit queue', {
                error: error.message,
                queueSize: this.auditQueue.length
            });

            // If database insert fails, add entries back to queue
            this.auditQueue.unshift(...batch);
        }
    }

    /**
     * Create audit middleware for Express routes
     * @param {object} options - Middleware options
     * @returns {Function} Express middleware
     */
    createAuditMiddleware(options = {}) {
        const {
            action = 'ACCESS',
            tableName = 'unknown',
            captureBody = false,
            captureResponse = false
        } = options;

        return (req, res, next) => {
            // Store original end method
            const originalEnd = res.end;

            // Override res.end to capture response
            res.end = function(chunk, encoding) {
                // Log the audit event
                const auditParams = {
                    userId: req.user?.userId || req.user?.id || null,
                    action: req.method === 'GET' ? 'READ' : req.method.toLowerCase(),
                    tableName: tableName,
                    recordId: req.params.id || null,
                    data: captureBody ? req.body : null,
                    ipAddress: req.ip || req.connection.remoteAddress,
                    userAgent: req.get('User-Agent'),
                    endpoint: req.originalUrl,
                    method: req.method,
                    sessionId: req.sessionID || req.headers['x-session-id']
                };

                // Log asynchronously to not block response
                setImmediate(() => {
                    this.logDataAccess(auditParams).catch(error => {
                        logger.error('Audit middleware logging failed', {
                            error: error.message,
                            endpoint: req.originalUrl
                        });
                    });
                });

                // Call original end method
                originalEnd.call(this, chunk, encoding);
            }.bind(this);

            next();
        };
    }

    /**
     * Create database operation wrapper with auditing
     * @param {string} operation - Database operation type
     * @param {string} tableName - Table name
     * @returns {Function} Wrapped database function
     */
    createDatabaseAuditor(operation, tableName) {
        return async (originalFunction, params, context = {}) => {
            const startTime = Date.now();
            let result;
            let error;

            try {
                // Execute original database operation
                result = await originalFunction(...params);

                // Log successful operation
                await this.logDataModification({
                    userId: context.userId,
                    action: operation.toUpperCase(),
                    tableName: tableName,
                    recordId: context.recordId || result?.id,
                    oldData: context.oldData,
                    newData: operation === 'DELETE' ? null : result,
                    ipAddress: context.ipAddress,
                    userAgent: context.userAgent,
                    endpoint: context.endpoint,
                    method: context.method,
                    sessionId: context.sessionId
                });

                return result;

            } catch (err) {
                error = err;

                // Log failed operation
                await this.logDataModification({
                    userId: context.userId,
                    action: `${operation.toUpperCase()}_FAILED`,
                    tableName: tableName,
                    recordId: context.recordId,
                    oldData: context.oldData,
                    newData: { error: err.message },
                    ipAddress: context.ipAddress,
                    userAgent: context.userAgent,
                    endpoint: context.endpoint,
                    method: context.method,
                    sessionId: context.sessionId
                });

                throw err;
            }
        };
    }

    /**
     * Get audit trail for user
     * @param {number} userId - User ID
     * @param {object} options - Query options
     * @returns {Array} Audit trail entries
     */
    async getAuditTrail(userId, options = {}) {
        try {
            const {
                limit = 100,
                offset = 0,
                action = null,
                tableName = null,
                startDate = null,
                endDate = null
            } = options;

            let whereClause = 'WHERE user_id = ?';
            const params = [userId];

            if (action) {
                whereClause += ' AND action = ?';
                params.push(action);
            }

            if (tableName) {
                whereClause += ' AND table_name = ?';
                params.push(tableName);
            }

            if (startDate) {
                whereClause += ' AND created_at >= ?';
                params.push(startDate);
            }

            if (endDate) {
                whereClause += ' AND created_at <= ?';
                params.push(endDate);
            }

            const query = `
                SELECT * FROM audit_logs
                ${whereClause}
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
            `;

            params.push(limit, offset);

            const __res = await DatabaseService.query(query, params);
const rows = Array.isArray(__res)
  ? (Array.isArray(__res[0]) ? __res[0] : __res)
  : (Array.isArray(__res && __res.rows) ? __res.rows : []);
            return rows.map(row => this.sanitizeAuditEntry(row));

        } catch (error) {
            logger.error('Failed to get audit trail', { userId, error: error.message });
            throw error;
        }
    }

    /**
     * Get audit statistics
     * @param {object} options - Query options
     * @returns {object} Audit statistics
     */
    async getAuditStatistics(options = {}) {
        try {
            const {
                userId = null,
                startDate = null,
                endDate = null
            } = options;

            let whereClause = 'WHERE 1=1';
            const params = [];

            if (userId) {
                whereClause += ' AND user_id = ?';
                params.push(userId);
            }

            if (startDate) {
                whereClause += ' AND created_at >= ?';
                params.push(startDate);
            }

            if (endDate) {
                whereClause += ' AND created_at <= ?';
                params.push(endDate);
            }

            const queries = {
                totalEntries: `SELECT COUNT(*) as count FROM audit_logs ${whereClause}`,
                actionBreakdown: `
                    SELECT action, COUNT(*) as count
                    FROM audit_logs ${whereClause}
                    GROUP BY action
                    ORDER BY count DESC
                `,
                tableBreakdown: `
                    SELECT table_name, COUNT(*) as count
                    FROM audit_logs ${whereClause}
                    GROUP BY table_name
                    ORDER BY count DESC
                `,
                recentActivity: `
                    SELECT DATE(created_at) as date, COUNT(*) as count
                    FROM audit_logs ${whereClause}
                    AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                    GROUP BY DATE(created_at)
                    ORDER BY date DESC
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
                totalEntries: results.totalEntries[0]?.count || 0,
                actionBreakdown: results.actionBreakdown,
                tableBreakdown: results.tableBreakdown,
                recentActivity: results.recentActivity,
                generatedAt: new Date().toISOString()
            };

        } catch (error) {
            logger.error('Failed to get audit statistics', { error: error.message });
            throw error;
        }
    }

    /**
     * Sanitize data for audit logging (remove sensitive information)
     * @param {object} data - Data to sanitize
     * @returns {object} Sanitized data
     */
    sanitizeAuditData(data) {
        if (!data || typeof data !== 'object') return data;

        const sanitized = { ...data };
        const sensitiveFields = [
            'password', 'password_hash', 'token', 'secret',
            'authorization', 'cookie', 'session',
            'ssn', 'social_security_number', 'credit_card',
            'bank_account', 'routing_number'
        ];

        const sanitizeObject = (obj) => {
            if (!obj || typeof obj !== 'object') return obj;

            const result = Array.isArray(obj) ? [] : {};

            for (const [key, value] of Object.entries(obj)) {
                if (sensitiveFields.some(field =>
                    key.toLowerCase().includes(field.toLowerCase())
                )) {
                    result[key] = '[REDACTED]';
                } else if (typeof value === 'object' && value !== null) {
                    result[key] = sanitizeObject(value);
                } else {
                    result[key] = value;
                }
            }

            return result;
        };

        return sanitizeObject(sanitized);
    }

    /**
     * Sanitize audit entry for external access
     * @param {object} entry - Audit entry
     * @returns {object} Sanitized entry
     */
    sanitizeAuditEntry(entry) {
        const sanitized = { ...entry };

        // Parse JSON fields if they exist
        if (sanitized.old_values && typeof sanitized.old_values === 'string') {
            try {
                sanitized.old_values = JSON.parse(sanitized.old_values);
            } catch (e) {
                // Keep as string if parsing fails
            }
        }

        if (sanitized.new_values && typeof sanitized.new_values === 'string') {
            try {
                sanitized.new_values = JSON.parse(sanitized.new_values);
            } catch (e) {
                // Keep as string if parsing fails
            }
        }

        // Remove potentially sensitive system information
        delete sanitized.session_id;

        return sanitized;
    }

    /**
     * Cleanup audit logs based on retention policy
     * @param {number} retentionDays - Number of days to retain
     */
    async cleanupAuditLogs(retentionDays = 2555) { // 7 years default
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

            const query = 'DELETE FROM audit_logs WHERE created_at < ?';
            const __res = await DatabaseService.query(query, [cutoffDate.toISOString()]);
const result = Array.isArray(__res)
  ? (Array.isArray(__res[0]) ? __res[0] : __res)
  : (Array.isArray(__res && __res.rows) ? __res.rows : []);

            logger.info('Audit logs cleanup completed', {
                retentionDays,
                cutoffDate: cutoffDate.toISOString(),
                deletedRows: result.affectedRows || 0
            });

            return result.affectedRows || 0;

        } catch (error) {
            logger.error('Audit logs cleanup failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Shutdown audit logger
     */
    async shutdown() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }

        // Flush remaining entries
        await this.flushAuditQueue();

        logger.info('AuditLogger shutdown completed');
    }
}

// Export singleton instance
module.exports = new AuditLogger();
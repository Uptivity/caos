// Data Retention Service
// Handles automated data cleanup and retention policies for GDPR compliance

const cron = require('node-cron');
const DatabaseService = require('./DatabaseService');
const AuditLogger = require('../utils/AuditLogger');
const { logger } = require('../utils/secureLogger');

class DataRetentionService {
    constructor() {
        this.initialized = false;
        this.scheduledJobs = new Map();
        this.retentionPolicies = new Map();
    }

    /**
     * Initialize data retention service
     */
    async initialize() {
        try {
            await this.loadRetentionPolicies();
            await this.scheduleRetentionJobs();
            this.initialized = true;
            logger.info('DataRetentionService initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize DataRetentionService', { error: error.message });
            throw error;
        }
    }

    /**
     * Load retention policies from database
     */
    async loadRetentionPolicies() {
        try {
            const [policies] = await DatabaseService.query(
                'SELECT * FROM data_retention_policies WHERE is_active = true'
            );

            this.retentionPolicies.clear();

            for (const policy of policies) {
                this.retentionPolicies.set(policy.table_name, {
                    id: policy.id,
                    tableName: policy.table_name,
                    retentionDays: policy.retention_period_days,
                    criteria: policy.retention_criteria ? JSON.parse(policy.retention_criteria) : {},
                    autoDelete: policy.auto_delete,
                    lastCleanup: policy.last_cleanup
                });
            }

            logger.info('Loaded retention policies', {
                count: this.retentionPolicies.size,
                tables: Array.from(this.retentionPolicies.keys())
            });

        } catch (error) {
            logger.error('Failed to load retention policies', { error: error.message });
            throw error;
        }
    }

    /**
     * Schedule automated retention cleanup jobs
     */
    async scheduleRetentionJobs() {
        // Clear existing jobs
        this.scheduledJobs.forEach(job => job.destroy());
        this.scheduledJobs.clear();

        // Daily cleanup job at 2 AM
        const dailyJob = cron.schedule('0 2 * * *', async () => {
            logger.info('Starting scheduled data retention cleanup');
            try {
                await this.runRetentionCleanup();
            } catch (error) {
                logger.error('Scheduled retention cleanup failed', { error: error.message });
            }
        }, {
            scheduled: true,
            timezone: 'UTC'
        });

        this.scheduledJobs.set('daily-cleanup', dailyJob);

        // Weekly audit log cleanup on Sundays at 3 AM
        const weeklyJob = cron.schedule('0 3 * * 0', async () => {
            logger.info('Starting weekly audit log cleanup');
            try {
                await this.cleanupAuditLogs();
            } catch (error) {
                logger.error('Weekly audit cleanup failed', { error: error.message });
            }
        }, {
            scheduled: true,
            timezone: 'UTC'
        });

        this.scheduledJobs.set('weekly-audit-cleanup', weeklyJob);

        logger.info('Data retention jobs scheduled successfully', {
            jobs: Array.from(this.scheduledJobs.keys())
        });
    }

    /**
     * Run retention cleanup for all policies
     */
    async runRetentionCleanup() {
        const startTime = Date.now();
        const results = {
            processed: 0,
            deleted: 0,
            errors: 0,
            tables: []
        };

        for (const [tableName, policy] of this.retentionPolicies) {
            if (!policy.autoDelete) {
                logger.debug('Skipping manual retention policy', { tableName });
                continue;
            }

            try {
                const deleted = await this.cleanupTableData(tableName, policy);

                results.processed++;
                results.deleted += deleted;
                results.tables.push({
                    table: tableName,
                    deleted: deleted,
                    status: 'success'
                });

                // Update last cleanup timestamp
                await DatabaseService.update('data_retention_policies', policy.id, {
                    last_cleanup: new Date().toISOString()
                });

                // Log cleanup activity
                await AuditLogger.logDataModification({
                    action: 'RETENTION_CLEANUP',
                    tableName: tableName,
                    newData: {
                        deletedRecords: deleted,
                        retentionDays: policy.retentionDays,
                        cleanupDate: new Date().toISOString()
                    }
                });

            } catch (error) {
                logger.error('Retention cleanup failed for table', {
                    tableName,
                    error: error.message
                });

                results.errors++;
                results.tables.push({
                    table: tableName,
                    deleted: 0,
                    status: 'error',
                    error: error.message
                });
            }
        }

        const duration = Date.now() - startTime;

        logger.info('Data retention cleanup completed', {
            duration: `${duration}ms`,
            ...results
        });

        return results;
    }

    /**
     * Cleanup data for specific table based on retention policy
     * @param {string} tableName - Table name
     * @param {object} policy - Retention policy
     * @returns {number} Number of deleted records
     */
    async cleanupTableData(tableName, policy) {
        if (policy.retentionDays === -1) {
            // Permanent retention - no cleanup
            return 0;
        }

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - policy.retentionDays);

        try {
            // Build cleanup query based on table structure
            let deleteQuery = '';
            let params = [];

            switch (tableName) {
                case 'audit_logs':
                    deleteQuery = 'DELETE FROM audit_logs WHERE created_at < ?';
                    params = [cutoffDate.toISOString()];
                    break;

                case 'data_export_requests':
                    // Delete expired export requests and cleanup files
                    deleteQuery = `
                        DELETE FROM data_export_requests
                        WHERE (created_at < ? OR expires_at < NOW())
                        AND status IN ('completed', 'failed')
                    `;
                    params = [cutoffDate.toISOString()];

                    // Also cleanup export files
                    await this.cleanupExportFiles();
                    break;

                case 'data_deletion_requests':
                    // Keep deletion requests for compliance but older than retention
                    deleteQuery = `
                        DELETE FROM data_deletion_requests
                        WHERE created_at < ?
                        AND status = 'completed'
                    `;
                    params = [cutoffDate.toISOString()];
                    break;

                default:
                    // Generic cleanup for tables with created_at or updated_at
                    const hasCreatedAt = await this.tableHasColumn(tableName, 'created_at');
                    const hasUpdatedAt = await this.tableHasColumn(tableName, 'updated_at');

                    if (hasCreatedAt) {
                        deleteQuery = `DELETE FROM ${tableName} WHERE created_at < ?`;
                        params = [cutoffDate.toISOString()];
                    } else if (hasUpdatedAt) {
                        deleteQuery = `DELETE FROM ${tableName} WHERE updated_at < ?`;
                        params = [cutoffDate.toISOString()];
                    } else {
                        logger.warn('Cannot cleanup table without timestamp column', { tableName });
                        return 0;
                    }
            }

            // Apply additional criteria if specified
            if (policy.criteria && Object.keys(policy.criteria).length > 0) {
                const additionalWhere = this.buildCriteriaWhereClause(policy.criteria);
                if (additionalWhere.clause) {
                    deleteQuery += ` AND (${additionalWhere.clause})`;
                    params.push(...additionalWhere.params);
                }
            }

            // Execute cleanup
            const [result] = await DatabaseService.query(deleteQuery, params);
            const deletedCount = result.affectedRows || 0;

            if (deletedCount > 0) {
                logger.info('Table data cleaned up', {
                    tableName,
                    deletedRecords: deletedCount,
                    retentionDays: policy.retentionDays,
                    cutoffDate: cutoffDate.toISOString()
                });
            }

            return deletedCount;

        } catch (error) {
            logger.error('Table cleanup failed', {
                tableName,
                error: error.message,
                policy: policy
            });
            throw error;
        }
    }

    /**
     * Cleanup expired export files from filesystem
     */
    async cleanupExportFiles() {
        try {
            const fs = require('fs').promises;
            const path = require('path');

            const exportDir = path.join(process.cwd(), 'exports');

            // Check if exports directory exists
            try {
                await fs.access(exportDir);
            } catch {
                return 0; // Directory doesn't exist
            }

            // Get expired export requests
            const [expiredRequests] = await DatabaseService.query(`
                SELECT file_path FROM data_export_requests
                WHERE expires_at < NOW()
                AND file_path IS NOT NULL
                AND status = 'completed'
            `);

            let deletedFiles = 0;

            for (const request of expiredRequests) {
                try {
                    const filePath = path.join(exportDir, request.file_path);
                    await fs.access(filePath);
                    await fs.unlink(filePath);
                    deletedFiles++;

                    logger.debug('Deleted expired export file', { filePath: request.file_path });
                } catch (error) {
                    // File might already be deleted or not exist
                    logger.debug('Could not delete export file', {
                        filePath: request.file_path,
                        error: error.message
                    });
                }
            }

            if (deletedFiles > 0) {
                logger.info('Cleaned up expired export files', { deletedFiles });
            }

            return deletedFiles;

        } catch (error) {
            logger.error('Export files cleanup failed', { error: error.message });
            return 0;
        }
    }

    /**
     * Cleanup audit logs specifically
     */
    async cleanupAuditLogs() {
        try {
            const auditPolicy = this.retentionPolicies.get('audit_logs');
            if (!auditPolicy) {
                logger.warn('No retention policy found for audit_logs');
                return 0;
            }

            const deleted = await AuditLogger.cleanupAuditLogs(auditPolicy.retentionDays);

            logger.info('Audit logs cleanup completed', {
                deletedEntries: deleted,
                retentionDays: auditPolicy.retentionDays
            });

            return deleted;

        } catch (error) {
            logger.error('Audit logs cleanup failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Create new retention policy
     * @param {object} policyData - Policy configuration
     * @returns {object} Created policy
     */
    async createRetentionPolicy(policyData) {
        try {
            const {
                tableName,
                retentionDays,
                criteria = {},
                autoDelete = false,
                createdBy = null
            } = policyData;

            // Validate table exists
            const tableExists = await this.tableExists(tableName);
            if (!tableExists) {
                throw new Error(`Table '${tableName}' does not exist`);
            }

            // Check if policy already exists
            const existing = this.retentionPolicies.get(tableName);
            if (existing) {
                throw new Error(`Retention policy already exists for table '${tableName}'`);
            }

            // Create policy in database
            const policy = await DatabaseService.create('data_retention_policies', {
                table_name: tableName,
                retention_period_days: retentionDays,
                retention_criteria: JSON.stringify(criteria),
                auto_delete: autoDelete,
                created_by: createdBy,
                is_active: true
            });

            // Add to in-memory cache
            this.retentionPolicies.set(tableName, {
                id: policy.id,
                tableName: tableName,
                retentionDays: retentionDays,
                criteria: criteria,
                autoDelete: autoDelete,
                lastCleanup: null
            });

            // Log policy creation
            await AuditLogger.logDataModification({
                action: 'CREATE_RETENTION_POLICY',
                tableName: 'data_retention_policies',
                recordId: policy.id,
                newData: policyData,
                userId: createdBy
            });

            logger.info('Retention policy created', {
                tableName,
                retentionDays,
                autoDelete,
                createdBy
            });

            return policy;

        } catch (error) {
            logger.error('Failed to create retention policy', {
                policyData,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Update retention policy
     * @param {string} tableName - Table name
     * @param {object} updates - Policy updates
     * @returns {object} Updated policy
     */
    async updateRetentionPolicy(tableName, updates) {
        try {
            const existing = this.retentionPolicies.get(tableName);
            if (!existing) {
                throw new Error(`No retention policy found for table '${tableName}'`);
            }

            // Update in database
            const allowedUpdates = {
                retention_period_days: updates.retentionDays,
                retention_criteria: updates.criteria ? JSON.stringify(updates.criteria) : undefined,
                auto_delete: updates.autoDelete,
                is_active: updates.isActive
            };

            // Remove undefined values
            Object.keys(allowedUpdates).forEach(key => {
                if (allowedUpdates[key] === undefined) {
                    delete allowedUpdates[key];
                }
            });

            const updated = await DatabaseService.update('data_retention_policies', existing.id, allowedUpdates);

            // Update in-memory cache
            if (updates.retentionDays !== undefined) existing.retentionDays = updates.retentionDays;
            if (updates.criteria !== undefined) existing.criteria = updates.criteria;
            if (updates.autoDelete !== undefined) existing.autoDelete = updates.autoDelete;

            // Log policy update
            await AuditLogger.logDataModification({
                action: 'UPDATE_RETENTION_POLICY',
                tableName: 'data_retention_policies',
                recordId: existing.id,
                oldData: existing,
                newData: updates
            });

            logger.info('Retention policy updated', { tableName, updates });

            return updated;

        } catch (error) {
            logger.error('Failed to update retention policy', {
                tableName,
                updates,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get retention policies
     * @returns {Array} List of retention policies
     */
    getRetentionPolicies() {
        return Array.from(this.retentionPolicies.values());
    }

    /**
     * Get retention policy for specific table
     * @param {string} tableName - Table name
     * @returns {object|null} Retention policy
     */
    getRetentionPolicy(tableName) {
        return this.retentionPolicies.get(tableName) || null;
    }

    /**
     * Check if table exists in database
     * @param {string} tableName - Table name
     * @returns {boolean} True if table exists
     */
    async tableExists(tableName) {
        try {
            const [tables] = await DatabaseService.query(
                "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
                [tableName]
            );
            return tables.length > 0;
        } catch (error) {
            logger.error('Failed to check table existence', { tableName, error: error.message });
            return false;
        }
    }

    /**
     * Check if table has specific column
     * @param {string} tableName - Table name
     * @param {string} columnName - Column name
     * @returns {boolean} True if column exists
     */
    async tableHasColumn(tableName, columnName) {
        try {
            const [columns] = await DatabaseService.query(
                "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                [tableName, columnName]
            );
            return columns.length > 0;
        } catch (error) {
            logger.error('Failed to check column existence', { tableName, columnName, error: error.message });
            return false;
        }
    }

    /**
     * Build WHERE clause from criteria object
     * @param {object} criteria - Criteria object
     * @returns {object} WHERE clause and parameters
     */
    buildCriteriaWhereClause(criteria) {
        const conditions = [];
        const params = [];

        for (const [key, value] of Object.entries(criteria)) {
            if (typeof value === 'object' && value !== null) {
                // Handle complex criteria
                if (value.operator && value.value !== undefined) {
                    switch (value.operator) {
                        case 'eq':
                            conditions.push(`${key} = ?`);
                            params.push(value.value);
                            break;
                        case 'ne':
                            conditions.push(`${key} != ?`);
                            params.push(value.value);
                            break;
                        case 'lt':
                            conditions.push(`${key} < ?`);
                            params.push(value.value);
                            break;
                        case 'gt':
                            conditions.push(`${key} > ?`);
                            params.push(value.value);
                            break;
                        case 'in':
                            if (Array.isArray(value.value)) {
                                const placeholders = value.value.map(() => '?').join(',');
                                conditions.push(`${key} IN (${placeholders})`);
                                params.push(...value.value);
                            }
                            break;
                    }
                }
            } else {
                // Simple equality
                conditions.push(`${key} = ?`);
                params.push(value);
            }
        }

        return {
            clause: conditions.join(' AND '),
            params: params
        };
    }

    /**
     * Manual cleanup trigger for specific table
     * @param {string} tableName - Table name
     * @returns {number} Number of deleted records
     */
    async triggerManualCleanup(tableName) {
        try {
            const policy = this.retentionPolicies.get(tableName);
            if (!policy) {
                throw new Error(`No retention policy found for table '${tableName}'`);
            }

            const deleted = await this.cleanupTableData(tableName, policy);

            // Update last cleanup timestamp
            await DatabaseService.update('data_retention_policies', policy.id, {
                last_cleanup: new Date().toISOString()
            });

            // Log manual cleanup
            await AuditLogger.logDataModification({
                action: 'MANUAL_RETENTION_CLEANUP',
                tableName: tableName,
                newData: {
                    deletedRecords: deleted,
                    triggerType: 'manual'
                }
            });

            logger.info('Manual retention cleanup completed', { tableName, deleted });

            return deleted;

        } catch (error) {
            logger.error('Manual cleanup failed', { tableName, error: error.message });
            throw error;
        }
    }

    /**
     * Get retention statistics
     * @returns {object} Retention statistics
     */
    async getRetentionStatistics() {
        try {
            const stats = {
                totalPolicies: this.retentionPolicies.size,
                activePolicies: 0,
                autoPolicies: 0,
                lastCleanupSummary: {},
                upcomingCleanups: []
            };

            for (const [tableName, policy] of this.retentionPolicies) {
                if (policy.autoDelete) {
                    stats.autoPolicies++;
                }
                stats.activePolicies++;

                stats.lastCleanupSummary[tableName] = {
                    lastCleanup: policy.lastCleanup,
                    retentionDays: policy.retentionDays,
                    autoDelete: policy.autoDelete
                };

                // Calculate next cleanup time (approximate)
                if (policy.autoDelete && policy.lastCleanup) {
                    const nextCleanup = new Date(policy.lastCleanup);
                    nextCleanup.setDate(nextCleanup.getDate() + 1); // Daily cleanup
                    stats.upcomingCleanups.push({
                        tableName,
                        nextCleanup: nextCleanup.toISOString()
                    });
                }
            }

            return stats;

        } catch (error) {
            logger.error('Failed to get retention statistics', { error: error.message });
            throw error;
        }
    }

    /**
     * Shutdown data retention service
     */
    async shutdown() {
        // Stop all scheduled jobs
        this.scheduledJobs.forEach(job => job.destroy());
        this.scheduledJobs.clear();

        logger.info('DataRetentionService shutdown completed');
    }
}

// Export singleton instance
module.exports = new DataRetentionService();
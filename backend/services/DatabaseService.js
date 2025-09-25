// Universal Database Service Layer
// Provides common database operations for all CRM modules

const database = require('../config/database');
const { logger } = require('../utils/secureLogger');
const crypto = require('crypto');

class DatabaseService {
    constructor() {
        this.isInitialized = false;
    }

    /**
     * Initialize the database service
     */
    async initialize() {
        if (!this.isInitialized) {
            await database.initialize();
            this.isInitialized = true;
            logger.info('DatabaseService initialized successfully');
        }
    }

    /**
     * Generic create operation
     * @param {string} table - Table name
     * @param {object} data - Data to insert
     * @returns {object} Created record with ID
     */
    async create(table, data) {
        try {
            // Generate UUID for id field if not provided
            if (!data.id) {
                data.id = crypto.randomUUID();
            }

            // Add timestamps if not provided
            const now = new Date().toISOString();
            if (!data.created_at) data.created_at = now;
            if (!data.updated_at) data.updated_at = now;

            const fields = Object.keys(data).join(', ');
            const placeholders = Object.keys(data).map(() => '?').join(', ');
            const values = Object.values(data);

            const sql = `INSERT INTO ${table} (${fields}) VALUES (${placeholders})`;
            await database.query(sql, values);

            // Return the created record
            return await this.findById(table, data.id);
        } catch (error) {
            logger.error(`Failed to create record in ${table}`, {
                error: error.message,
                data: data
            });
            throw error;
        }
    }

    /**
     * Generic find by ID operation
     * @param {string} table - Table name
     * @param {string} id - Record ID
     * @returns {object|null} Found record or null
     */
    async findById(table, id) {
        try {
            const sql = `SELECT * FROM ${table} WHERE id = ? AND deleted_at IS NULL`;
            const [rows] = await database.query(sql, [id]);
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            logger.error(`Failed to find record by ID in ${table}`, {
                error: error.message,
                id: id
            });
            throw error;
        }
    }

    /**
     * Generic find operation with conditions
     * @param {string} table - Table name
     * @param {object} conditions - Where conditions
     * @param {object} options - Query options (limit, offset, orderBy)
     * @returns {Array} Array of records
     */
    async find(table, conditions = {}, options = {}) {
        try {
            let sql = `SELECT * FROM ${table}`;
            let params = [];

            // Build WHERE clause
            const whereConditions = [];

            // Always exclude soft-deleted records
            whereConditions.push('deleted_at IS NULL');

            Object.keys(conditions).forEach(key => {
                if (conditions[key] !== undefined && conditions[key] !== null) {
                    whereConditions.push(`${key} = ?`);
                    params.push(conditions[key]);
                }
            });

            if (whereConditions.length > 0) {
                sql += ` WHERE ${whereConditions.join(' AND ')}`;
            }

            // Add ORDER BY
            if (options.orderBy) {
                sql += ` ORDER BY ${options.orderBy}`;
                if (options.order) {
                    sql += ` ${options.order.toUpperCase()}`;
                }
            }

            // Add LIMIT and OFFSET
            if (options.limit) {
                sql += ` LIMIT ?`;
                params.push(parseInt(options.limit));
            }

            if (options.offset) {
                sql += ` OFFSET ?`;
                params.push(parseInt(options.offset));
            }

            const [rows] = await database.query(sql, params);
            return rows;
        } catch (error) {
            logger.error(`Failed to find records in ${table}`, {
                error: error.message,
                conditions: conditions,
                options: options
            });
            throw error;
        }
    }

    /**
     * Generic update operation
     * @param {string} table - Table name
     * @param {string} id - Record ID
     * @param {object} updates - Data to update
     * @returns {object|null} Updated record or null if not found
     */
    async update(table, id, updates) {
        try {
            // Add updated_at timestamp
            updates.updated_at = new Date().toISOString();

            const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
            const values = [...Object.values(updates), id];

            const sql = `UPDATE ${table} SET ${fields} WHERE id = ? AND deleted_at IS NULL`;
            const [result] = await database.query(sql, values);

            if (result.affectedRows === 0) {
                return null;
            }

            // Return the updated record
            return await this.findById(table, id);
        } catch (error) {
            logger.error(`Failed to update record in ${table}`, {
                error: error.message,
                id: id,
                updates: updates
            });
            throw error;
        }
    }

    /**
     * Generic soft delete operation
     * @param {string} table - Table name
     * @param {string} id - Record ID
     * @returns {boolean} Success status
     */
    async softDelete(table, id) {
        try {
            const sql = `UPDATE ${table} SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`;
            const [result] = await database.query(sql, [new Date().toISOString(), id]);
            return result.affectedRows > 0;
        } catch (error) {
            logger.error(`Failed to soft delete record in ${table}`, {
                error: error.message,
                id: id
            });
            throw error;
        }
    }

    /**
     * Generic hard delete operation
     * @param {string} table - Table name
     * @param {string} id - Record ID
     * @returns {boolean} Success status
     */
    async hardDelete(table, id) {
        try {
            const sql = `DELETE FROM ${table} WHERE id = ?`;
            const [result] = await database.query(sql, [id]);
            return result.affectedRows > 0;
        } catch (error) {
            logger.error(`Failed to hard delete record in ${table}`, {
                error: error.message,
                id: id
            });
            throw error;
        }
    }

    /**
     * Count records with conditions
     * @param {string} table - Table name
     * @param {object} conditions - Where conditions
     * @returns {number} Count of records
     */
    async count(table, conditions = {}) {
        try {
            let sql = `SELECT COUNT(*) as count FROM ${table}`;
            let params = [];

            const whereConditions = ['deleted_at IS NULL'];

            Object.keys(conditions).forEach(key => {
                if (conditions[key] !== undefined && conditions[key] !== null) {
                    whereConditions.push(`${key} = ?`);
                    params.push(conditions[key]);
                }
            });

            sql += ` WHERE ${whereConditions.join(' AND ')}`;

            const [rows] = await database.query(sql, params);
            return parseInt(rows[0].count);
        } catch (error) {
            logger.error(`Failed to count records in ${table}`, {
                error: error.message,
                conditions: conditions
            });
            throw error;
        }
    }

    /**
     * Execute a custom query
     * @param {string} sql - SQL query
     * @param {Array} params - Query parameters
     * @returns {Array} Query results
     */
    async query(sql, params = []) {
        try {
            const [rows] = await database.query(sql, params);
            return rows;
        } catch (error) {
            logger.error('Custom query failed', {
                error: error.message,
                sql: sql.substring(0, 200)
            });
            throw error;
        }
    }

    /**
     * Execute queries within a transaction
     * @param {Function} queries - Function that executes queries
     * @returns {*} Transaction result
     */
    async transaction(queries) {
        return await database.transaction(queries);
    }

    /**
     * Search records with LIKE operator
     * @param {string} table - Table name
     * @param {string} searchTerm - Search term
     * @param {Array} searchFields - Fields to search in
     * @param {object} conditions - Additional conditions
     * @param {object} options - Query options
     * @returns {Array} Array of matching records
     */
    async search(table, searchTerm, searchFields, conditions = {}, options = {}) {
        try {
            let sql = `SELECT * FROM ${table}`;
            let params = [];

            const whereConditions = ['deleted_at IS NULL'];

            // Add search conditions
            if (searchTerm && searchFields.length > 0) {
                const searchConditions = searchFields.map(field => `${field} LIKE ?`);
                whereConditions.push(`(${searchConditions.join(' OR ')})`);

                // Add search term for each field
                searchFields.forEach(() => {
                    params.push(`%${searchTerm}%`);
                });
            }

            // Add additional conditions
            Object.keys(conditions).forEach(key => {
                if (conditions[key] !== undefined && conditions[key] !== null) {
                    whereConditions.push(`${key} = ?`);
                    params.push(conditions[key]);
                }
            });

            sql += ` WHERE ${whereConditions.join(' AND ')}`;

            // Add ORDER BY
            if (options.orderBy) {
                sql += ` ORDER BY ${options.orderBy}`;
                if (options.order) {
                    sql += ` ${options.order.toUpperCase()}`;
                }
            }

            // Add LIMIT and OFFSET
            if (options.limit) {
                sql += ` LIMIT ?`;
                params.push(parseInt(options.limit));
            }

            if (options.offset) {
                sql += ` OFFSET ?`;
                params.push(parseInt(options.offset));
            }

            const [rows] = await database.query(sql, params);
            return rows;
        } catch (error) {
            logger.error(`Failed to search records in ${table}`, {
                error: error.message,
                searchTerm: searchTerm,
                searchFields: searchFields
            });
            throw error;
        }
    }

    /**
     * Get database health status
     */
    async getHealth() {
        return await database.getHealthStatus();
    }

    /**
     * Get connection pool status
     */
    getPoolStatus() {
        return database.getPoolStatus();
    }

    /**
     * Close database connection
     */
    async close() {
        await database.close();
        this.isInitialized = false;
    }
}

// Export singleton instance
module.exports = new DatabaseService();
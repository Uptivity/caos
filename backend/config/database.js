// Database Configuration and Connection Management
// MySQL Connection with pooling and error handling

const mysql = require('mysql2/promise');
const { logger } = require('../utils/logger');
const { performanceMonitor } = require('../middleware/performanceMiddleware');
const { metricsCollector } = require('../middleware/metricsMiddleware');

class DatabaseConnection {
    constructor() {
        this.pool = null;
        this.isConnected = false;
    }

    /**
     * Initialize database connection pool
     */
    async initialize() {
        try {
            const config = {
                host: process.env.DB_HOST || 'localhost',
                port: parseInt(process.env.DB_PORT) || 3306,
                user: process.env.DB_USER || 'caos_user',
                password: process.env.DB_PASSWORD || 'changeme123',
                database: process.env.DB_NAME || 'caos_crm',
                waitForConnections: true,
                connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
                queueLimit: parseInt(process.env.DB_QUEUE_LIMIT) || 0,
                // Remove invalid options for mysql2
                charset: 'utf8mb4',
                timezone: '+00:00',
                supportBigNumbers: true,
                bigNumberStrings: true,
                dateStrings: true,
                // SSL configuration for production
                ssl: process.env.DB_SSL_ENABLED === 'true' ? {
                    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false'
                } : false
            };

            this.pool = mysql.createPool(config);

            // Test the connection
            await this.testConnection();

            if (this.isConnected !== false) {
                this.isConnected = true;
                logger.info('Database connection pool initialized successfully', {
                    host: config.host,
                    port: config.port,
                    database: config.database,
                    connectionLimit: config.connectionLimit,
                    performanceTracking: true,
                    metricsCollection: true
                });

                // Initialize database schema if needed
                await this.initializeSchema();
            } else {
                logger.warn('Database connection failed - running in fallback mode');
            }

        } catch (error) {
            logger.error('Failed to initialize database connection', {
                error: error.message,
                stack: error.stack,
                code: error.code,
                errno: error.errno
            });
            throw new Error(`Database initialization failed: ${error.message}`);
        }
    }

    /**
     * Test database connection
     */
    async testConnection() {
        try {
            const connection = await this.pool.getConnection();
            try {
                await connection.ping();
                logger.info('Database connection test successful');
            } finally {
                connection.release();
            }
        } catch (error) {
            logger.error('Database connection test failed', {
                error: error.message,
                code: error.code
            });

            // Don't throw error - allow graceful degradation
            this.isConnected = false;
            logger.warn('Database connection failed - some features may not work properly');
        }
    }

    /**
     * Initialize database schema
     */
    async initializeSchema() {
        try {
            // Check if users table exists
            const [tables] = await this.query(
                "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'",
                [process.env.DB_NAME || 'caos_crm']
            );

            if (tables.length === 0) {
                logger.info('Database tables not found, initializing schema...');
                await this.initializeFromSchema();
            } else {
                logger.info('Database schema already exists');
            }
        } catch (error) {
            logger.error('Schema initialization check failed', { error: error.message });
            // Don't throw - allow app to continue with empty schema
        }
    }

    /**
     * Initialize database from schema file
     */
    async initializeFromSchema() {
        const fs = require('fs').promises;
        const path = require('path');

        try {
            const schemaPath = path.join(__dirname, '../../deployment/init.sql');
            const schemaSQL = await fs.readFile(schemaPath, 'utf8');

            // Split by semicolon and execute each statement
            const statements = schemaSQL
                .split(';')
                .map(stmt => stmt.trim())
                .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

            for (const statement of statements) {
                if (statement.toLowerCase().includes('create user')) {
                    // Skip user creation in application initialization
                    continue;
                }

                try {
                    await this.query(statement);
                } catch (error) {
                    // Log but continue with other statements
                    if (!error.message.includes('already exists')) {
                        logger.warn('Schema statement failed', {
                            statement: statement.substring(0, 100) + '...',
                            error: error.message
                        });
                    }
                }
            }

            logger.info('Database schema initialized successfully');
        } catch (error) {
            logger.error('Schema initialization from file failed', { error: error.message });
            // Continue without throwing to allow manual schema setup
        }
    }

    /**
     * Execute a query with parameters
     * @param {string} sql - SQL query
     * @param {Array} params - Query parameters
     * @returns {Promise} Query result
     */
    async query(sql, params = []) {
        if (!this.pool) {
            throw new Error('Database not initialized. Call initialize() first.');
        }

        const startTime = Date.now();
        const queryType = this.extractQueryType(sql);
        const tableName = this.extractTableName(sql);

        try {
            const [rows, fields] = await this.pool.execute(sql, params);
            const duration = Date.now() - startTime;

            // Track performance metrics
            performanceMonitor.trackDatabaseQuery(sql, duration, {
                queryType,
                tableName,
                rowsAffected: rows.length || rows.affectedRows || 0
            });

            // Record Prometheus metrics
            metricsCollector.recordDatabaseQuery(queryType, tableName, duration);

            // Log slow queries
            if (duration > 100) {
                logger.warn('Slow database query detected', {
                    sql: sql.substring(0, 200),
                    duration: `${duration}ms`,
                    queryType,
                    tableName,
                    rowCount: rows.length || rows.affectedRows || 0
                });
            } else {
                logger.verbose('Database query executed', {
                    sql: sql.substring(0, 100),
                    duration: `${duration}ms`,
                    queryType,
                    tableName
                });
            }

            return [rows, fields];
        } catch (error) {
            const duration = Date.now() - startTime;

            logger.error('Database query failed', {
                sql: sql.substring(0, 200),
                params: params,
                error: error.message,
                code: error.code,
                errno: error.errno,
                duration: `${duration}ms`,
                queryType,
                tableName
            });
            throw error;
        }
    }

    /**
     * Begin a database transaction
     */
    async beginTransaction() {
        const connection = await this.pool.getConnection();
        await connection.beginTransaction();
        return connection;
    }

    /**
     * Execute multiple queries within a transaction
     * @param {Function} queries - Function that executes queries using connection
     */
    async transaction(queries) {
        const connection = await this.pool.getConnection();

        try {
            await connection.beginTransaction();
            const result = await queries(connection);
            await connection.commit();
            return result;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Get database health status with performance metrics
     */
    async getHealthStatus() {
        try {
            const startTime = Date.now();
            const [result] = await this.query('SELECT 1 as health');
            const queryTime = Date.now() - startTime;

            const [status] = await this.query('SHOW STATUS LIKE "Threads_connected"');
            const [processlist] = await this.query('SHOW STATUS LIKE "Threads_running"');
            const [uptime] = await this.query('SHOW STATUS LIKE "Uptime"');

            // Get pool statistics
            const poolStats = this.getPoolStatus();

            // Update metrics
            metricsCollector.updateDatabaseConnections(
                poolStats.usedConnections || 0,
                {
                    free: poolStats.freeConnections || 0,
                    used: poolStats.usedConnections || 0,
                    pending: poolStats.queuedRequests || 0
                }
            );

            return {
                status: 'healthy',
                connected: this.isConnected,
                responseTime: `${queryTime}ms`,
                connections: {
                    active: status[0]?.Value || 0,
                    running: processlist[0]?.Value || 0,
                    pool: poolStats
                },
                uptime: uptime[0]?.Value || 0,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                connected: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Close database connection pool
     */
    async close() {
        if (this.pool) {
            await this.pool.end();
            this.isConnected = false;
            logger.info('Database connection pool closed');
        }
    }

    /**
     * Extract query type from SQL statement
     */
    extractQueryType(sql) {
        const trimmed = sql.trim().toUpperCase();
        if (trimmed.startsWith('SELECT')) return 'SELECT';
        if (trimmed.startsWith('INSERT')) return 'INSERT';
        if (trimmed.startsWith('UPDATE')) return 'UPDATE';
        if (trimmed.startsWith('DELETE')) return 'DELETE';
        if (trimmed.startsWith('CREATE')) return 'CREATE';
        if (trimmed.startsWith('DROP')) return 'DROP';
        if (trimmed.startsWith('ALTER')) return 'ALTER';
        if (trimmed.startsWith('SHOW')) return 'SHOW';
        if (trimmed.startsWith('DESCRIBE') || trimmed.startsWith('DESC')) return 'DESCRIBE';
        return 'OTHER';
    }

    /**
     * Extract table name from SQL statement
     */
    extractTableName(sql) {
        const trimmed = sql.trim().toUpperCase();
        let match;

        // SELECT FROM table
        match = trimmed.match(/FROM\s+([`"']?\w+[`"']?)/i);
        if (match) return match[1].replace(/[`"']/g, '').toLowerCase();

        // INSERT INTO table
        match = trimmed.match(/INSERT\s+INTO\s+([`"']?\w+[`"']?)/i);
        if (match) return match[1].replace(/[`"']/g, '').toLowerCase();

        // UPDATE table
        match = trimmed.match(/UPDATE\s+([`"']?\w+[`"']?)/i);
        if (match) return match[1].replace(/[`"']/g, '').toLowerCase();

        // DELETE FROM table
        match = trimmed.match(/DELETE\s+FROM\s+([`"']?\w+[`"']?)/i);
        if (match) return match[1].replace(/[`"']/g, '').toLowerCase();

        // CREATE TABLE table
        match = trimmed.match(/CREATE\s+TABLE\s+([`"']?\w+[`"']?)/i);
        if (match) return match[1].replace(/[`"']/g, '').toLowerCase();

        return 'unknown';
    }

    /**
     * Get current pool status
     */
    getPoolStatus() {
        if (!this.pool) {
            return { status: 'not_initialized' };
        }

        try {
            const pool = this.pool.pool;
            return {
                totalConnections: pool._allConnections?.length || 0,
                freeConnections: pool._freeConnections?.length || 0,
                usedConnections: (pool._allConnections?.length || 0) - (pool._freeConnections?.length || 0),
                queuedRequests: pool._connectionQueue?.length || 0,
                acquiringConnections: pool._acquiringConnections?.length || 0
            };
        } catch (error) {
            logger.warn('Failed to get pool status', { error: error.message });
            return {
                status: 'error',
                error: error.message
            };
        }
    }

    /**
     * Get database performance metrics
     */
    async getPerformanceMetrics() {
        try {
            const [variables] = await this.query(`
                SHOW STATUS WHERE Variable_name IN (
                    'Questions', 'Queries', 'Slow_queries', 'Connections',
                    'Threads_connected', 'Threads_running', 'Uptime',
                    'Bytes_received', 'Bytes_sent', 'Handler_read_first',
                    'Handler_read_next', 'Handler_read_key', 'Handler_read_rnd',
                    'Handler_read_rnd_next', 'Handler_update', 'Handler_write',
                    'Handler_delete', 'Handler_commit', 'Handler_rollback'
                )
            `);

            const metrics = {};
            variables.forEach(row => {
                metrics[row.Variable_name.toLowerCase()] = parseInt(row.Value) || 0;
            });

            return {
                ...metrics,
                pool: this.getPoolStatus(),
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            logger.error('Failed to get performance metrics', { error: error.message });
            return {
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

// Create singleton instance
const database = new DatabaseConnection();

module.exports = database;
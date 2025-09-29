/**
 * Enhanced Health Monitoring Middleware
 * Comprehensive health checks with detailed system metrics
 */

const os = require('os');
const { logger } = require('../utils/logger');
const database = require('../config/database');
const { performanceMonitor } = require('./performanceMiddleware');
const { metricsCollector } = require('./metricsMiddleware');

class HealthMonitor {
    constructor() {
        this.checks = new Map();
        this.lastHealthCheck = null;
        this.healthHistory = [];
        this.maxHistoryEntries = 100;

        // Register default health checks
        this.registerHealthCheck('database', this.checkDatabase.bind(this));
        this.registerHealthCheck('memory', this.checkMemory.bind(this));
        this.registerHealthCheck('disk', this.checkDiskSpace.bind(this));
        this.registerHealthCheck('cpu', this.checkCPU.bind(this));
        this.registerHealthCheck('performance', this.checkPerformance.bind(this));

        logger.info('Health monitor initialized', {
            registeredChecks: Array.from(this.checks.keys())
        });
    }

    /**
     * Register a custom health check
     */
    registerHealthCheck(name, checkFunction) {
        this.checks.set(name, checkFunction);
        logger.debug('Health check registered', { name });
    }

    /**
     * Remove a health check
     */
    unregisterHealthCheck(name) {
        this.checks.delete(name);
        logger.debug('Health check unregistered', { name });
    }

    /**
     * Run all health checks
     */
    async runHealthChecks() {
        const startTime = Date.now();
        const results = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            environment: process.env.NODE_ENV || 'development',
            version: process.env.npm_package_version || '1.0.0',
            checks: {},
            summary: {
                total: this.checks.size,
                passed: 0,
                failed: 0,
                warnings: 0
            }
        };

        // Run all checks in parallel
        const checkPromises = Array.from(this.checks.entries()).map(async ([name, checkFn]) => {
            try {
                const checkStart = Date.now();
                const result = await Promise.race([
                    checkFn(),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Health check timeout')), 5000)
                    )
                ]);

                const checkDuration = Date.now() - checkStart;

                return {
                    name,
                    status: result.status || 'healthy',
                    duration: `${checkDuration}ms`,
                    ...result
                };
            } catch (error) {
                logger.warn('Health check failed', {
                    check: name,
                    error: error.message
                });

                return {
                    name,
                    status: 'unhealthy',
                    error: error.message,
                    timestamp: new Date().toISOString()
                };
            }
        });

        const checkResults = await Promise.all(checkPromises);

        // Process results
        checkResults.forEach(result => {
            results.checks[result.name] = result;

            switch (result.status) {
                case 'healthy':
                    results.summary.passed++;
                    break;
                case 'warning':
                    results.summary.warnings++;
                    break;
                case 'unhealthy':
                default:
                    results.summary.failed++;
                    results.status = 'degraded';
                    break;
            }
        });

        // Determine overall status
        if (results.summary.failed > 0) {
            results.status = results.summary.failed > results.summary.passed ? 'unhealthy' : 'degraded';
        } else if (results.summary.warnings > 0) {
            results.status = 'degraded';
        }

        const totalDuration = Date.now() - startTime;
        results.healthCheckDuration = `${totalDuration}ms`;

        // Store in history
        this.addToHistory(results);
        this.lastHealthCheck = results;

        logger.info('Health check completed', {
            status: results.status,
            duration: results.healthCheckDuration,
            passed: results.summary.passed,
            failed: results.summary.failed,
            warnings: results.summary.warnings
        });

        return results;
    }

    /**
     * Database health check
     */
    async checkDatabase() {
        try {
            const dbHealth = await database.getHealthStatus();
            const poolStats = database.getPoolStatus();

            // Check connection pool health
            const poolUtilization = poolStats.totalConnections > 0
                ? (poolStats.usedConnections / poolStats.totalConnections) * 100
                : 0;

            let status = 'healthy';
            const warnings = [];

            if (!dbHealth.connected) {
                status = 'unhealthy';
            } else {
                if (poolUtilization > 80) {
                    status = 'warning';
                    warnings.push('High connection pool utilization');
                }

                if (poolStats.queuedRequests > 5) {
                    status = 'warning';
                    warnings.push('High number of queued requests');
                }

                if (dbHealth.responseTime && parseInt(dbHealth.responseTime) > 100) {
                    status = 'warning';
                    warnings.push('Slow database response time');
                }
            }

            return {
                status,
                connected: dbHealth.connected,
                responseTime: dbHealth.responseTime,
                connections: dbHealth.connections,
                poolUtilization: `${poolUtilization.toFixed(1)}%`,
                warnings: warnings.length > 0 ? warnings : undefined
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message
            };
        }
    }

    /**
     * Memory usage health check
     */
    async checkMemory() {
        const memUsage = process.memoryUsage();
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const usedMemory = totalMemory - freeMemory;

        const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
        const systemUsedPercent = (usedMemory / totalMemory) * 100;

        let status = 'healthy';
        const warnings = [];

        if (heapUsedPercent > 90) {
            status = 'unhealthy';
        } else if (heapUsedPercent > 80) {
            status = 'warning';
            warnings.push('High heap memory usage');
        }

        if (systemUsedPercent > 95) {
            status = 'unhealthy';
        } else if (systemUsedPercent > 85) {
            status = 'warning';
            warnings.push('High system memory usage');
        }

        return {
            status,
            heap: {
                used: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`,
                total: `${(memUsage.heapTotal / 1024 / 1024).toFixed(2)}MB`,
                utilization: `${heapUsedPercent.toFixed(1)}%`
            },
            system: {
                used: `${(usedMemory / 1024 / 1024 / 1024).toFixed(2)}GB`,
                total: `${(totalMemory / 1024 / 1024 / 1024).toFixed(2)}GB`,
                utilization: `${systemUsedPercent.toFixed(1)}%`
            },
            rss: `${(memUsage.rss / 1024 / 1024).toFixed(2)}MB`,
            external: `${(memUsage.external / 1024 / 1024).toFixed(2)}MB`,
            warnings: warnings.length > 0 ? warnings : undefined
        };
    }

    /**
     * Disk space health check
     */
    async checkDiskSpace() {
        try {
            const { execSync } = require('child_process');
            let diskInfo;

            // Get disk usage based on platform
            if (process.platform === 'win32') {
                // Windows: use wmic
                const output = execSync('wmic logicaldisk get size,freespace,caption', { encoding: 'utf8' });
                const lines = output.split('\n').filter(line => line.trim() && !line.includes('Caption'));

                if (lines.length > 0) {
                    const parts = lines[0].trim().split(/\s+/);
                    const freeSpace = parseInt(parts[1]) || 0;
                    const totalSpace = parseInt(parts[2]) || 1;
                    const usedPercent = ((totalSpace - freeSpace) / totalSpace) * 100;

                    diskInfo = {
                        total: `${(totalSpace / 1024 / 1024 / 1024).toFixed(2)}GB`,
                        free: `${(freeSpace / 1024 / 1024 / 1024).toFixed(2)}GB`,
                        utilization: `${usedPercent.toFixed(1)}%`,
                        usedPercent
                    };
                } else {
                    throw new Error('Unable to parse disk info');
                }
            } else {
                // Unix/Linux: use df
                const output = execSync('df -h /', { encoding: 'utf8' });
                const lines = output.split('\n');
                const data = lines[1].split(/\s+/);

                diskInfo = {
                    total: data[1],
                    free: data[3],
                    utilization: data[4],
                    usedPercent: parseInt(data[4].replace('%', ''))
                };
            }

            let status = 'healthy';
            const warnings = [];

            if (diskInfo.usedPercent > 95) {
                status = 'unhealthy';
            } else if (diskInfo.usedPercent > 85) {
                status = 'warning';
                warnings.push('High disk usage');
            }

            return {
                status,
                disk: diskInfo,
                warnings: warnings.length > 0 ? warnings : undefined
            };
        } catch (error) {
            return {
                status: 'warning',
                error: 'Unable to check disk space',
                details: error.message
            };
        }
    }

    /**
     * CPU health check
     */
    async checkCPU() {
        const cpus = os.cpus();
        const loadAvg = os.loadavg();
        const numCPUs = cpus.length;

        // Calculate CPU usage over a short period
        const startUsage = process.cpuUsage();
        await new Promise(resolve => setTimeout(resolve, 100));
        const endUsage = process.cpuUsage(startUsage);

        const userPercent = (endUsage.user / 1000 / 100) * 100; // Convert to percentage
        const systemPercent = (endUsage.system / 1000 / 100) * 100;
        const totalPercent = userPercent + systemPercent;

        let status = 'healthy';
        const warnings = [];

        // Check load average (1 minute)
        const loadPercent = (loadAvg[0] / numCPUs) * 100;

        if (loadPercent > 90 || totalPercent > 90) {
            status = 'unhealthy';
        } else if (loadPercent > 75 || totalPercent > 75) {
            status = 'warning';
            warnings.push('High CPU usage');
        }

        return {
            status,
            cores: numCPUs,
            usage: {
                user: `${userPercent.toFixed(1)}%`,
                system: `${systemPercent.toFixed(1)}%`,
                total: `${totalPercent.toFixed(1)}%`
            },
            loadAverage: {
                '1m': loadAvg[0].toFixed(2),
                '5m': loadAvg[1].toFixed(2),
                '15m': loadAvg[2].toFixed(2),
                utilization: `${loadPercent.toFixed(1)}%`
            },
            warnings: warnings.length > 0 ? warnings : undefined
        };
    }

    /**
     * Performance metrics health check
     */
    async checkPerformance() {
        const metrics = performanceMonitor.getMetricsSummary();
        const coreWebVitals = performanceMonitor.getCoreWebVitals();

        let status = 'healthy';
        const warnings = [];

        // Check error rate
        const errorRate = parseFloat(coreWebVitals.errorRate);
        if (errorRate > 10) {
            status = 'unhealthy';
        } else if (errorRate > 5) {
            status = 'warning';
            warnings.push('High error rate');
        }

        // Check average response time
        const avgResponseTime = parseFloat(coreWebVitals.averageResponseTime);
        if (avgResponseTime > 2000) {
            status = 'unhealthy';
        } else if (avgResponseTime > 1000) {
            status = 'warning';
            warnings.push('Slow response times');
        }

        // Check slow queries
        if (metrics.slowQueries > 10) {
            status = 'warning';
            warnings.push('High number of slow queries');
        }

        return {
            status,
            responseTime: {
                average: `${avgResponseTime.toFixed(0)}ms`,
                percentiles: coreWebVitals.percentiles
            },
            requests: {
                total: coreWebVitals.requestVolume,
                errorRate: `${errorRate}%`
            },
            database: {
                slowQueries: metrics.slowQueries,
                totalEndpoints: metrics.summary.totalEndpoints
            },
            warnings: warnings.length > 0 ? warnings : undefined
        };
    }

    /**
     * Add result to history and maintain max entries
     */
    addToHistory(result) {
        this.healthHistory.push({
            timestamp: result.timestamp,
            status: result.status,
            summary: result.summary,
            duration: result.healthCheckDuration
        });

        // Keep only recent entries
        if (this.healthHistory.length > this.maxHistoryEntries) {
            this.healthHistory.shift();
        }
    }

    /**
     * Get health history
     */
    getHealthHistory() {
        return {
            entries: this.healthHistory,
            totalEntries: this.healthHistory.length,
            maxEntries: this.maxHistoryEntries
        };
    }

    /**
     * Get last health check result
     */
    getLastHealthCheck() {
        return this.lastHealthCheck;
    }

    /**
     * Create Express middleware for health endpoint
     */
    createHealthEndpoint() {
        return async (req, res) => {
            try {
                const includeHistory = req.query.history === 'true';
                const checkName = req.query.check;

                let result;

                if (checkName) {
                    // Run specific health check
                    if (!this.checks.has(checkName)) {
                        return res.status(404).json({
                            error: 'Health check not found',
                            availableChecks: Array.from(this.checks.keys())
                        });
                    }

                    const checkFn = this.checks.get(checkName);
                    const checkResult = await checkFn();

                    result = {
                        check: checkName,
                        timestamp: new Date().toISOString(),
                        ...checkResult
                    };
                } else {
                    // Run all health checks
                    result = await this.runHealthChecks();

                    if (includeHistory) {
                        result.history = this.getHealthHistory();
                    }
                }

                const statusCode = result.status === 'healthy' ? 200 :
                                result.status === 'degraded' ? 200 : 503;

                res.status(statusCode).json(result);
            } catch (error) {
                logger.error('Health endpoint error', { error: error.message });
                res.status(500).json({
                    status: 'error',
                    error: 'Health check failed',
                    message: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        };
    }

    /**
     * Create readiness probe endpoint
     */
    createReadinessEndpoint() {
        return async (req, res) => {
            try {
                // Check only critical services for readiness
                const dbHealth = await database.getHealthStatus();

                if (dbHealth.connected) {
                    res.status(200).json({
                        status: 'ready',
                        timestamp: new Date().toISOString(),
                        database: 'connected'
                    });
                } else {
                    res.status(503).json({
                        status: 'not_ready',
                        timestamp: new Date().toISOString(),
                        database: 'disconnected'
                    });
                }
            } catch (error) {
                res.status(503).json({
                    status: 'not_ready',
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        };
    }

    /**
     * Create liveness probe endpoint
     */
    createLivenessEndpoint() {
        return (req, res) => {
            // Simple liveness check - if we can respond, we're alive
            res.status(200).json({
                status: 'alive',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                pid: process.pid
            });
        };
    }
}

// Create singleton instance
const healthMonitor = new HealthMonitor();

module.exports = {
    healthMonitor,
    HealthMonitor
};
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
        });\n\n        const checkResults = await Promise.all(checkPromises);\n\n        // Process results\n        checkResults.forEach(result => {\n            results.checks[result.name] = result;\n\n            switch (result.status) {\n                case 'healthy':\n                    results.summary.passed++;\n                    break;\n                case 'warning':\n                    results.summary.warnings++;\n                    break;\n                case 'unhealthy':\n                default:\n                    results.summary.failed++;\n                    results.status = 'degraded';\n                    break;\n            }\n        });\n\n        // Determine overall status\n        if (results.summary.failed > 0) {\n            results.status = results.summary.failed > results.summary.passed ? 'unhealthy' : 'degraded';\n        } else if (results.summary.warnings > 0) {\n            results.status = 'degraded';\n        }\n\n        const totalDuration = Date.now() - startTime;\n        results.healthCheckDuration = `${totalDuration}ms`;\n\n        // Store in history\n        this.addToHistory(results);\n        this.lastHealthCheck = results;\n\n        logger.info('Health check completed', {\n            status: results.status,\n            duration: results.healthCheckDuration,\n            passed: results.summary.passed,\n            failed: results.summary.failed,\n            warnings: results.summary.warnings\n        });\n\n        return results;\n    }\n\n    /**\n     * Database health check\n     */\n    async checkDatabase() {\n        try {\n            const dbHealth = await database.getHealthStatus();\n            const poolStats = database.getPoolStatus();\n\n            // Check connection pool health\n            const poolUtilization = poolStats.totalConnections > 0 \n                ? (poolStats.usedConnections / poolStats.totalConnections) * 100\n                : 0;\n\n            let status = 'healthy';\n            const warnings = [];\n\n            if (!dbHealth.connected) {\n                status = 'unhealthy';\n            } else {\n                if (poolUtilization > 80) {\n                    status = 'warning';\n                    warnings.push('High connection pool utilization');\n                }\n                \n                if (poolStats.queuedRequests > 5) {\n                    status = 'warning';\n                    warnings.push('High number of queued requests');\n                }\n\n                if (dbHealth.responseTime && parseInt(dbHealth.responseTime) > 100) {\n                    status = 'warning';\n                    warnings.push('Slow database response time');\n                }\n            }\n\n            return {\n                status,\n                connected: dbHealth.connected,\n                responseTime: dbHealth.responseTime,\n                connections: dbHealth.connections,\n                poolUtilization: `${poolUtilization.toFixed(1)}%`,\n                warnings: warnings.length > 0 ? warnings : undefined\n            };\n        } catch (error) {\n            return {\n                status: 'unhealthy',\n                error: error.message\n            };\n        }\n    }\n\n    /**\n     * Memory usage health check\n     */\n    async checkMemory() {\n        const memUsage = process.memoryUsage();\n        const totalMemory = os.totalmem();\n        const freeMemory = os.freemem();\n        const usedMemory = totalMemory - freeMemory;\n\n        const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;\n        const systemUsedPercent = (usedMemory / totalMemory) * 100;\n\n        let status = 'healthy';\n        const warnings = [];\n\n        if (heapUsedPercent > 90) {\n            status = 'unhealthy';\n        } else if (heapUsedPercent > 80) {\n            status = 'warning';\n            warnings.push('High heap memory usage');\n        }\n\n        if (systemUsedPercent > 95) {\n            status = 'unhealthy';\n        } else if (systemUsedPercent > 85) {\n            status = 'warning';\n            warnings.push('High system memory usage');\n        }\n\n        return {\n            status,\n            heap: {\n                used: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`,\n                total: `${(memUsage.heapTotal / 1024 / 1024).toFixed(2)}MB`,\n                utilization: `${heapUsedPercent.toFixed(1)}%`\n            },\n            system: {\n                used: `${(usedMemory / 1024 / 1024 / 1024).toFixed(2)}GB`,\n                total: `${(totalMemory / 1024 / 1024 / 1024).toFixed(2)}GB`,\n                utilization: `${systemUsedPercent.toFixed(1)}%`\n            },\n            rss: `${(memUsage.rss / 1024 / 1024).toFixed(2)}MB`,\n            external: `${(memUsage.external / 1024 / 1024).toFixed(2)}MB`,\n            warnings: warnings.length > 0 ? warnings : undefined\n        };\n    }\n\n    /**\n     * Disk space health check\n     */\n    async checkDiskSpace() {\n        try {\n            const { execSync } = require('child_process');\n            let diskInfo;\n\n            // Get disk usage based on platform\n            if (process.platform === 'win32') {\n                // Windows: use wmic\n                const output = execSync('wmic logicaldisk get size,freespace,caption', { encoding: 'utf8' });\n                const lines = output.split('\\n').filter(line => line.trim() && !line.includes('Caption'));\n                \n                if (lines.length > 0) {\n                    const parts = lines[0].trim().split(/\\s+/);\n                    const freeSpace = parseInt(parts[1]) || 0;\n                    const totalSpace = parseInt(parts[2]) || 1;\n                    const usedPercent = ((totalSpace - freeSpace) / totalSpace) * 100;\n\n                    diskInfo = {\n                        total: `${(totalSpace / 1024 / 1024 / 1024).toFixed(2)}GB`,\n                        free: `${(freeSpace / 1024 / 1024 / 1024).toFixed(2)}GB`,\n                        utilization: `${usedPercent.toFixed(1)}%`,\n                        usedPercent\n                    };\n                } else {\n                    throw new Error('Unable to parse disk info');\n                }\n            } else {\n                // Unix/Linux: use df\n                const output = execSync('df -h /', { encoding: 'utf8' });\n                const lines = output.split('\\n');\n                const data = lines[1].split(/\\s+/);\n                \n                diskInfo = {\n                    total: data[1],\n                    free: data[3],\n                    utilization: data[4],\n                    usedPercent: parseInt(data[4].replace('%', ''))\n                };\n            }\n\n            let status = 'healthy';\n            const warnings = [];\n\n            if (diskInfo.usedPercent > 95) {\n                status = 'unhealthy';\n            } else if (diskInfo.usedPercent > 85) {\n                status = 'warning';\n                warnings.push('High disk usage');\n            }\n\n            return {\n                status,\n                disk: diskInfo,\n                warnings: warnings.length > 0 ? warnings : undefined\n            };\n        } catch (error) {\n            return {\n                status: 'warning',\n                error: 'Unable to check disk space',\n                details: error.message\n            };\n        }\n    }\n\n    /**\n     * CPU health check\n     */\n    async checkCPU() {\n        const cpus = os.cpus();\n        const loadAvg = os.loadavg();\n        const numCPUs = cpus.length;\n\n        // Calculate CPU usage over a short period\n        const startUsage = process.cpuUsage();\n        await new Promise(resolve => setTimeout(resolve, 100));\n        const endUsage = process.cpuUsage(startUsage);\n        \n        const userPercent = (endUsage.user / 1000 / 100) * 100; // Convert to percentage\n        const systemPercent = (endUsage.system / 1000 / 100) * 100;\n        const totalPercent = userPercent + systemPercent;\n\n        let status = 'healthy';\n        const warnings = [];\n\n        // Check load average (1 minute)\n        const loadPercent = (loadAvg[0] / numCPUs) * 100;\n        \n        if (loadPercent > 90 || totalPercent > 90) {\n            status = 'unhealthy';\n        } else if (loadPercent > 75 || totalPercent > 75) {\n            status = 'warning';\n            warnings.push('High CPU usage');\n        }\n\n        return {\n            status,\n            cores: numCPUs,\n            usage: {\n                user: `${userPercent.toFixed(1)}%`,\n                system: `${systemPercent.toFixed(1)}%`,\n                total: `${totalPercent.toFixed(1)}%`\n            },\n            loadAverage: {\n                '1m': loadAvg[0].toFixed(2),\n                '5m': loadAvg[1].toFixed(2),\n                '15m': loadAvg[2].toFixed(2),\n                utilization: `${loadPercent.toFixed(1)}%`\n            },\n            warnings: warnings.length > 0 ? warnings : undefined\n        };\n    }\n\n    /**\n     * Performance metrics health check\n     */\n    async checkPerformance() {\n        const metrics = performanceMonitor.getMetricsSummary();\n        const coreWebVitals = performanceMonitor.getCoreWebVitals();\n\n        let status = 'healthy';\n        const warnings = [];\n\n        // Check error rate\n        const errorRate = parseFloat(coreWebVitals.errorRate);\n        if (errorRate > 10) {\n            status = 'unhealthy';\n        } else if (errorRate > 5) {\n            status = 'warning';\n            warnings.push('High error rate');\n        }\n\n        // Check average response time\n        const avgResponseTime = parseFloat(coreWebVitals.averageResponseTime);\n        if (avgResponseTime > 2000) {\n            status = 'unhealthy';\n        } else if (avgResponseTime > 1000) {\n            status = 'warning';\n            warnings.push('Slow response times');\n        }\n\n        // Check slow queries\n        if (metrics.slowQueries > 10) {\n            status = 'warning';\n            warnings.push('High number of slow queries');\n        }\n\n        return {\n            status,\n            responseTime: {\n                average: `${avgResponseTime.toFixed(0)}ms`,\n                percentiles: coreWebVitals.percentiles\n            },\n            requests: {\n                total: coreWebVitals.requestVolume,\n                errorRate: `${errorRate}%`\n            },\n            database: {\n                slowQueries: metrics.slowQueries,\n                totalEndpoints: metrics.summary.totalEndpoints\n            },\n            warnings: warnings.length > 0 ? warnings : undefined\n        };\n    }\n\n    /**\n     * Add result to history and maintain max entries\n     */\n    addToHistory(result) {\n        this.healthHistory.push({\n            timestamp: result.timestamp,\n            status: result.status,\n            summary: result.summary,\n            duration: result.healthCheckDuration\n        });\n\n        // Keep only recent entries\n        if (this.healthHistory.length > this.maxHistoryEntries) {\n            this.healthHistory.shift();\n        }\n    }\n\n    /**\n     * Get health history\n     */\n    getHealthHistory() {\n        return {\n            entries: this.healthHistory,\n            totalEntries: this.healthHistory.length,\n            maxEntries: this.maxHistoryEntries\n        };\n    }\n\n    /**\n     * Get last health check result\n     */\n    getLastHealthCheck() {\n        return this.lastHealthCheck;\n    }\n\n    /**\n     * Create Express middleware for health endpoint\n     */\n    createHealthEndpoint() {\n        return async (req, res) => {\n            try {\n                const includeHistory = req.query.history === 'true';\n                const checkName = req.query.check;\n\n                let result;\n\n                if (checkName) {\n                    // Run specific health check\n                    if (!this.checks.has(checkName)) {\n                        return res.status(404).json({\n                            error: 'Health check not found',\n                            availableChecks: Array.from(this.checks.keys())\n                        });\n                    }\n\n                    const checkFn = this.checks.get(checkName);\n                    const checkResult = await checkFn();\n                    \n                    result = {\n                        check: checkName,\n                        timestamp: new Date().toISOString(),\n                        ...checkResult\n                    };\n                } else {\n                    // Run all health checks\n                    result = await this.runHealthChecks();\n\n                    if (includeHistory) {\n                        result.history = this.getHealthHistory();\n                    }\n                }\n\n                const statusCode = result.status === 'healthy' ? 200 : \n                                result.status === 'degraded' ? 200 : 503;\n\n                res.status(statusCode).json(result);\n            } catch (error) {\n                logger.error('Health endpoint error', { error: error.message });\n                res.status(500).json({\n                    status: 'error',\n                    error: 'Health check failed',\n                    message: error.message,\n                    timestamp: new Date().toISOString()\n                });\n            }\n        };\n    }\n\n    /**\n     * Create readiness probe endpoint\n     */\n    createReadinessEndpoint() {\n        return async (req, res) => {\n            try {\n                // Check only critical services for readiness\n                const dbHealth = await database.getHealthStatus();\n                \n                if (dbHealth.connected) {\n                    res.status(200).json({\n                        status: 'ready',\n                        timestamp: new Date().toISOString(),\n                        database: 'connected'\n                    });\n                } else {\n                    res.status(503).json({\n                        status: 'not_ready',\n                        timestamp: new Date().toISOString(),\n                        database: 'disconnected'\n                    });\n                }\n            } catch (error) {\n                res.status(503).json({\n                    status: 'not_ready',\n                    error: error.message,\n                    timestamp: new Date().toISOString()\n                });\n            }\n        };\n    }\n\n    /**\n     * Create liveness probe endpoint\n     */\n    createLivenessEndpoint() {\n        return (req, res) => {\n            // Simple liveness check - if we can respond, we're alive\n            res.status(200).json({\n                status: 'alive',\n                timestamp: new Date().toISOString(),\n                uptime: process.uptime(),\n                pid: process.pid\n            });\n        };\n    }\n}\n\n// Create singleton instance\nconst healthMonitor = new HealthMonitor();\n\nmodule.exports = {\n    healthMonitor,\n    HealthMonitor\n};
/**
 * Performance Monitoring Middleware
 * Tracks API response times, database queries, and system metrics
 */

const responseTime = require('response-time');
const { logger } = require('../utils/logger');

class PerformanceMonitor {
    constructor() {
        // Storage for performance metrics
        this.metrics = {
            requests: new Map(),
            endpoints: new Map(),
            slowQueries: [],
            errors: new Map()
        };

        // Configuration
        this.config = {
            slowRequestThreshold: parseInt(process.env.SLOW_REQUEST_THRESHOLD) || 1000, // ms
            slowQueryThreshold: parseInt(process.env.SLOW_QUERY_THRESHOLD) || 100, // ms
            maxSlowQueries: parseInt(process.env.MAX_SLOW_QUERIES) || 100,
            metricsRetention: parseInt(process.env.METRICS_RETENTION) || 3600000 // 1 hour
        };

        // Start metrics cleanup interval
        this.startCleanupInterval();
    }

    /**
     * Create performance tracking middleware
     */
    createMiddleware() {
        return (req, res, next) => {
            const requestId = logger.generateRequestId();
            const startTime = process.hrtime.bigint();

            // Add request ID to request object
            req.requestId = requestId;

            // Start request timing
            logger.startRequestTiming(requestId);

            // Track endpoint usage
            this.trackEndpointUsage(req);

            // Override res.end to capture response details
            const originalEnd = res.end;
            res.end = (...args) => {
                // Calculate response time
                const endTime = process.hrtime.bigint();
                const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds

                // Log request completion
                logger.endRequestTiming(requestId, req, res, {
                    responseSize: res.get('Content-Length') || 0,
                    duration: duration
                });

                // Track performance metrics
                this.trackRequestMetrics(req, res, duration);

                // Call original end method
                originalEnd.apply(res, args);
            };

            next();
        };
    }

    /**
     * Track endpoint usage statistics
     */
    trackEndpointUsage(req) {
        const endpoint = `${req.method} ${req.route?.path || req.path}`;
        const current = this.metrics.endpoints.get(endpoint) || {
            count: 0,
            totalTime: 0,
            errors: 0,
            lastUsed: Date.now()
        };

        current.count++;
        current.lastUsed = Date.now();
        this.metrics.endpoints.set(endpoint, current);
    }

    /**
     * Track request performance metrics
     */
    trackRequestMetrics(req, res, duration) {
        const endpoint = `${req.method} ${req.route?.path || req.path}`;
        const current = this.metrics.endpoints.get(endpoint);

        if (current) {
            current.totalTime += duration;

            if (res.statusCode >= 400) {
                current.errors++;
            }

            this.metrics.endpoints.set(endpoint, current);
        }

        // Track slow requests
        if (duration > this.config.slowRequestThreshold) {
            logger.warn('Slow Request Detected', {
                requestId: req.requestId,
                endpoint,
                duration: `${duration.toFixed(2)}ms`,
                threshold: `${this.config.slowRequestThreshold}ms`,
                method: req.method,
                url: req.originalUrl,
                statusCode: res.statusCode,
                userAgent: req.get('User-Agent'),
                ip: req.ip
            });
        }

        // Track error rates
        if (res.statusCode >= 400) {
            const errorKey = `${res.statusCode}_${endpoint}`;
            const errorCount = this.metrics.errors.get(errorKey) || 0;
            this.metrics.errors.set(errorKey, errorCount + 1);
        }
    }

    /**
     * Track database query performance
     */
    trackDatabaseQuery(query, duration, metadata = {}) {
        logger.logDatabaseQuery(query, duration, metadata);

        // Track slow queries
        if (duration > this.config.slowQueryThreshold) {
            const slowQuery = {
                query: this.sanitizeQuery(query),
                duration,
                timestamp: Date.now(),
                metadata
            };

            this.metrics.slowQueries.push(slowQuery);

            // Keep only recent slow queries
            if (this.metrics.slowQueries.length > this.config.maxSlowQueries) {
                this.metrics.slowQueries.shift();
            }

            logger.warn('Slow Database Query', {
                query: this.sanitizeQuery(query),
                duration: `${duration}ms`,
                threshold: `${this.config.slowQueryThreshold}ms`,
                ...metadata
            });
        }
    }

    /**
     * Sanitize database queries for logging
     */
    sanitizeQuery(query) {
        if (typeof query !== 'string') return query;

        // Remove sensitive data from queries
        return query
            .replace(/('([^'\\]|\\.)*')/g, "'[REDACTED]'")
            .replace(/("([^"\\]|\\.)*")/g, '"[REDACTED]"')
            .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '[DATE]')
            .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP]');
    }

    /**
     * Get performance metrics summary
     */
    getMetricsSummary() {
        const now = Date.now();
        const endpointStats = [];

        for (const [endpoint, stats] of this.metrics.endpoints.entries()) {
            const avgTime = stats.count > 0 ? (stats.totalTime / stats.count).toFixed(2) : 0;
            const errorRate = stats.count > 0 ? ((stats.errors / stats.count) * 100).toFixed(2) : 0;

            endpointStats.push({
                endpoint,
                requests: stats.count,
                avgResponseTime: `${avgTime}ms`,
                errorRate: `${errorRate}%`,
                errors: stats.errors,
                lastUsed: new Date(stats.lastUsed).toISOString()
            });
        }

        // Sort by request count
        endpointStats.sort((a, b) => b.requests - a.requests);

        return {
            summary: {
                totalEndpoints: this.metrics.endpoints.size,
                totalRequests: Array.from(this.metrics.endpoints.values()).reduce((sum, stats) => sum + stats.count, 0),
                totalErrors: Array.from(this.metrics.endpoints.values()).reduce((sum, stats) => sum + stats.errors, 0),
                slowQueries: this.metrics.slowQueries.length,
                errorTypes: this.metrics.errors.size
            },
            endpoints: endpointStats.slice(0, 20), // Top 20 endpoints
            slowQueries: this.metrics.slowQueries.slice(-10), // Last 10 slow queries
            config: this.config,
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        };
    }

    /**
     * Get Core Web Vitals equivalent metrics
     */
    getCoreWebVitals() {
        const endpointMetrics = Array.from(this.metrics.endpoints.entries())
            .map(([endpoint, stats]) => {
                const avgTime = stats.count > 0 ? stats.totalTime / stats.count : 0;
                return { endpoint, avgTime, count: stats.count };
            })
            .filter(m => m.count > 0)
            .sort((a, b) => b.count - a.count);

        // Calculate percentiles
        const responseTimes = endpointMetrics.map(m => m.avgTime).sort((a, b) => a - b);
        const p50 = this.calculatePercentile(responseTimes, 50);
        const p75 = this.calculatePercentile(responseTimes, 75);
        const p95 = this.calculatePercentile(responseTimes, 95);
        const p99 = this.calculatePercentile(responseTimes, 99);

        return {
            // Equivalent to Largest Contentful Paint (LCP)
            averageResponseTime: responseTimes.length > 0 ? (responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length).toFixed(2) : 0,

            // Response time percentiles
            percentiles: {
                p50: `${p50.toFixed(2)}ms`,
                p75: `${p75.toFixed(2)}ms`,
                p95: `${p95.toFixed(2)}ms`,
                p99: `${p99.toFixed(2)}ms`
            },

            // Error rates (equivalent to stability metrics)
            errorRate: this.calculateOverallErrorRate(),

            // Request volume
            requestVolume: Array.from(this.metrics.endpoints.values()).reduce((sum, stats) => sum + stats.count, 0),

            // Slow request ratio
            slowRequestRatio: this.calculateSlowRequestRatio(),

            timestamp: new Date().toISOString()
        };
    }

    /**
     * Calculate percentile from sorted array
     */
    calculatePercentile(sortedArray, percentile) {
        if (sortedArray.length === 0) return 0;
        const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
        return sortedArray[index] || 0;
    }

    /**
     * Calculate overall error rate
     */
    calculateOverallErrorRate() {
        const totalRequests = Array.from(this.metrics.endpoints.values()).reduce((sum, stats) => sum + stats.count, 0);
        const totalErrors = Array.from(this.metrics.endpoints.values()).reduce((sum, stats) => sum + stats.errors, 0);

        return totalRequests > 0 ? ((totalErrors / totalRequests) * 100).toFixed(2) : 0;
    }

    /**
     * Calculate slow request ratio
     */
    calculateSlowRequestRatio() {
        // This is a simplified calculation - in practice, you'd track actual slow requests
        const totalRequests = Array.from(this.metrics.endpoints.values()).reduce((sum, stats) => sum + stats.count, 0);
        const estimatedSlowRequests = this.metrics.slowQueries.length; // Approximate

        return totalRequests > 0 ? ((estimatedSlowRequests / totalRequests) * 100).toFixed(2) : 0;
    }

    /**
     * Start cleanup interval to prevent memory leaks
     */
    startCleanupInterval() {
        setInterval(() => {
            this.cleanup();
        }, this.config.metricsRetention);
    }

    /**
     * Clean up old metrics to prevent memory leaks
     */
    cleanup() {
        const now = Date.now();
        const cutoff = now - this.config.metricsRetention;

        // Clean up old slow queries
        this.metrics.slowQueries = this.metrics.slowQueries.filter(
            query => query.timestamp > cutoff
        );

        // Reset endpoint metrics periodically (keep structure but reset counters)
        for (const [endpoint, stats] of this.metrics.endpoints.entries()) {
            if (stats.lastUsed < cutoff) {
                this.metrics.endpoints.delete(endpoint);
            }
        }

        // Clean up error metrics
        this.metrics.errors.clear();

        logger.debug('Performance metrics cleanup completed', {
            remainingEndpoints: this.metrics.endpoints.size,
            remainingSlowQueries: this.metrics.slowQueries.length
        });
    }

    /**
     * Reset all metrics (useful for testing)
     */
    reset() {
        this.metrics.requests.clear();
        this.metrics.endpoints.clear();
        this.metrics.slowQueries = [];
        this.metrics.errors.clear();
    }
}

// Create singleton instance
const performanceMonitor = new PerformanceMonitor();

module.exports = {
    performanceMonitor,
    PerformanceMonitor
};
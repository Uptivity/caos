/**
 * Prometheus Metrics Collection Middleware
 * Collects and exposes metrics for monitoring and observability
 */

const client = require('prom-client');
const { logger } = require('../utils/logger');

class MetricsCollector {
    constructor() {
        // Create a Registry to register the metrics
        this.register = new client.Registry();

        // Add default Node.js metrics
        client.collectDefaultMetrics({
            register: this.register,
            timeout: 10000,
            gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
            eventLoopMonitoringPrecision: 1
        });

        // Initialize custom metrics
        this.initializeMetrics();

        logger.info('Prometheus metrics collector initialized', {
            defaultMetrics: true,
            customMetrics: Object.keys(this.metrics).length
        });
    }

    /**
     * Initialize custom application metrics
     */
    initializeMetrics() {
        // HTTP request duration histogram
        this.httpDuration = new client.Histogram({
            name: 'http_request_duration_seconds',
            help: 'HTTP request duration in seconds',
            labelNames: ['method', 'route', 'status_code'],
            buckets: [0.001, 0.005, 0.015, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 1.0, 5.0, 10.0],
            registers: [this.register]
        });

        // HTTP request counter
        this.httpRequests = new client.Counter({
            name: 'http_requests_total',
            help: 'Total number of HTTP requests',
            labelNames: ['method', 'route', 'status_code'],
            registers: [this.register]
        });

        // HTTP request size histogram
        this.httpRequestSize = new client.Histogram({
            name: 'http_request_size_bytes',
            help: 'HTTP request size in bytes',
            labelNames: ['method', 'route'],
            buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
            registers: [this.register]
        });

        // HTTP response size histogram
        this.httpResponseSize = new client.Histogram({
            name: 'http_response_size_bytes',
            help: 'HTTP response size in bytes',
            labelNames: ['method', 'route', 'status_code'],
            buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
            registers: [this.register]
        });

        // Database query duration histogram
        this.dbQueryDuration = new client.Histogram({
            name: 'database_query_duration_seconds',
            help: 'Database query duration in seconds',
            labelNames: ['query_type', 'table'],
            buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
            registers: [this.register]
        });

        // Database connection pool metrics
        this.dbConnections = new client.Gauge({
            name: 'database_connections_active',
            help: 'Number of active database connections',
            registers: [this.register]
        });

        this.dbConnectionPool = new client.Gauge({
            name: 'database_connection_pool_size',
            help: 'Database connection pool size',
            labelNames: ['state'], // 'free', 'used', 'pending'
            registers: [this.register]
        });

        // Authentication metrics
        this.authAttempts = new client.Counter({
            name: 'auth_attempts_total',
            help: 'Total authentication attempts',
            labelNames: ['type', 'status'], // type: 'login', 'register', 'refresh'; status: 'success', 'failure'
            registers: [this.register]
        });

        // Business metrics
        this.businessEvents = new client.Counter({
            name: 'business_events_total',
            help: 'Total business events',
            labelNames: ['event_type', 'category'], // event_type: 'lead_created', 'campaign_sent', etc.
            registers: [this.register]
        });

        // Error rate counter
        this.errorRate = new client.Counter({
            name: 'application_errors_total',
            help: 'Total application errors',
            labelNames: ['error_type', 'severity'],
            registers: [this.register]
        });

        // Memory usage gauge
        this.memoryUsage = new client.Gauge({
            name: 'memory_usage_bytes',
            help: 'Memory usage in bytes',
            labelNames: ['type'], // 'rss', 'heapUsed', 'heapTotal', 'external'
            registers: [this.register]
        });

        // Response time summary
        this.responseTimeSummary = new client.Summary({
            name: 'http_request_summary_seconds',
            help: 'HTTP request summary',
            labelNames: ['method', 'route', 'status_code'],
            percentiles: [0.5, 0.75, 0.9, 0.95, 0.99],
            registers: [this.register]
        });

        // API rate limit metrics
        this.rateLimitHits = new client.Counter({
            name: 'rate_limit_hits_total',
            help: 'Total rate limit hits',
            labelNames: ['endpoint', 'limit_type'],
            registers: [this.register]
        });

        // Store metrics for easy access
        this.metrics = {
            httpDuration: this.httpDuration,
            httpRequests: this.httpRequests,
            httpRequestSize: this.httpRequestSize,
            httpResponseSize: this.httpResponseSize,
            dbQueryDuration: this.dbQueryDuration,
            dbConnections: this.dbConnections,
            dbConnectionPool: this.dbConnectionPool,
            authAttempts: this.authAttempts,
            businessEvents: this.businessEvents,
            errorRate: this.errorRate,
            memoryUsage: this.memoryUsage,
            responseTimeSummary: this.responseTimeSummary,
            rateLimitHits: this.rateLimitHits
        };

        // Start memory monitoring
        this.startMemoryMonitoring();
    }

    /**
     * Create Express middleware for metrics collection
     */
    createMiddleware() {
        return (req, res, next) => {
            const startTime = Date.now();

            // Track request size
            const requestSize = parseInt(req.get('Content-Length')) || 0;
            if (requestSize > 0) {
                this.httpRequestSize
                    .labels(req.method, this.normalizeRoute(req))
                    .observe(requestSize);
            }

            // Override res.end to capture metrics
            const originalEnd = res.end;
            res.end = (...args) => {
                try {
                    const duration = (Date.now() - startTime) / 1000;
                    const route = this.normalizeRoute(req);
                    const statusCode = res.statusCode.toString();

                    // Record metrics
                    this.httpDuration
                        .labels(req.method, route, statusCode)
                        .observe(duration);

                    this.httpRequests
                        .labels(req.method, route, statusCode)
                        .inc();

                    this.responseTimeSummary
                        .labels(req.method, route, statusCode)
                        .observe(duration);

                    // Track response size
                    const responseSize = parseInt(res.get('Content-Length')) || 0;
                    if (responseSize > 0) {
                        this.httpResponseSize
                            .labels(req.method, route, statusCode)
                            .observe(responseSize);
                    }

                    // Track errors
                    if (res.statusCode >= 400) {
                        this.errorRate
                            .labels(this.getErrorType(res.statusCode), this.getErrorSeverity(res.statusCode))
                            .inc();
                    }

                } catch (error) {
                    logger.error('Metrics collection error', { error: error.message });
                } finally {
                    originalEnd.apply(res, args);
                }
            };

            next();
        };
    }

    /**
     * Normalize route for consistent labeling
     */
    normalizeRoute(req) {
        // Use route path if available (from router), otherwise use path
        if (req.route && req.route.path) {
            return req.route.path;
        }

        // Normalize common path patterns
        const path = req.path;
        return path
            .replace(/\/\d+/g, '/:id')          // Replace numeric IDs
            .replace(/\/[a-f0-9-]{36}/g, '/:uuid') // Replace UUIDs
            .replace(/\/[a-f0-9]{24}/g, '/:objectId'); // Replace MongoDB ObjectIds
    }

    /**
     * Get error type from status code
     */
    getErrorType(statusCode) {
        if (statusCode >= 400 && statusCode < 500) {
            return 'client_error';
        } else if (statusCode >= 500) {
            return 'server_error';
        }
        return 'unknown_error';
    }

    /**
     * Get error severity from status code
     */
    getErrorSeverity(statusCode) {
        if (statusCode === 404 || statusCode === 400) {
            return 'low';
        } else if (statusCode === 401 || statusCode === 403 || statusCode === 429) {
            return 'medium';
        } else if (statusCode >= 500) {
            return 'high';
        }
        return 'medium';
    }

    /**
     * Record database query metrics
     */
    recordDatabaseQuery(queryType, table, duration) {
        this.dbQueryDuration
            .labels(queryType.toLowerCase(), table || 'unknown')
            .observe(duration / 1000); // Convert ms to seconds

        logger.verbose('Database query recorded', {
            queryType,
            table,
            duration: `${duration}ms`
        });
    }

    /**
     * Record authentication attempt
     */
    recordAuthAttempt(type, status) {
        this.authAttempts.labels(type, status).inc();

        logger.auth('Authentication attempt recorded', {
            type,
            status,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Record business event
     */
    recordBusinessEvent(eventType, category) {
        this.businessEvents.labels(eventType, category).inc();

        logger.business('Business event recorded', {
            eventType,
            category,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Record rate limit hit
     */
    recordRateLimitHit(endpoint, limitType) {
        this.rateLimitHits.labels(endpoint, limitType).inc();

        logger.warn('Rate limit hit recorded', {
            endpoint,
            limitType,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Update database connection metrics
     */
    updateDatabaseConnections(activeConnections, poolStats = {}) {
        this.dbConnections.set(activeConnections);

        // Update pool metrics if provided
        if (poolStats.free !== undefined) {
            this.dbConnectionPool.labels('free').set(poolStats.free);
        }
        if (poolStats.used !== undefined) {
            this.dbConnectionPool.labels('used').set(poolStats.used);
        }
        if (poolStats.pending !== undefined) {
            this.dbConnectionPool.labels('pending').set(poolStats.pending);
        }
    }

    /**
     * Start memory monitoring
     */
    startMemoryMonitoring() {
        setInterval(() => {
            const memUsage = process.memoryUsage();

            this.memoryUsage.labels('rss').set(memUsage.rss);
            this.memoryUsage.labels('heap_used').set(memUsage.heapUsed);
            this.memoryUsage.labels('heap_total').set(memUsage.heapTotal);
            this.memoryUsage.labels('external').set(memUsage.external);

            if (memUsage.arrayBuffers !== undefined) {
                this.memoryUsage.labels('array_buffers').set(memUsage.arrayBuffers);
            }
        }, 15000); // Update every 15 seconds
    }

    /**
     * Get metrics for Prometheus scraping
     */
    async getMetrics() {
        try {
            return await this.register.metrics();
        } catch (error) {
            logger.error('Error generating metrics', { error: error.message });
            return '';
        }
    }

    /**
     * Get metrics summary for health check
     */
    getMetricsSummary() {
        const metrics = this.register.getSingleMetricAsString('http_requests_total');
        const memoryMetrics = this.register.getSingleMetricAsString('memory_usage_bytes');

        return {
            totalMetrics: this.register.getMetricsAsArray().length,
            httpRequests: metrics ? 'available' : 'not_available',
            memoryTracking: memoryMetrics ? 'enabled' : 'disabled',
            lastUpdated: new Date().toISOString()
        };
    }

    /**
     * Reset all metrics (useful for testing)
     */
    reset() {
        this.register.resetMetrics();
        logger.info('All metrics have been reset');
    }
}

// Create singleton instance
const metricsCollector = new MetricsCollector();

module.exports = {
    metricsCollector,
    MetricsCollector
};
/**
 * Alerting and Error Tracking Middleware
 * Basic alerting system with configurable thresholds and notification channels
 */

const { logger } = require('../utils/logger');
const { performanceMonitor } = require('./performanceMiddleware');
const { metricsCollector } = require('./metricsMiddleware');

class AlertingSystem {
    constructor() {
        this.alerts = new Map();
        this.alertHistory = [];
        this.maxHistoryEntries = 500;

        // Configuration from environment variables
        this.config = {
            // Error rate thresholds
            errorRateThresholdWarning: parseFloat(process.env.ERROR_RATE_WARNING_THRESHOLD) || 5.0, // %
            errorRateThresholdCritical: parseFloat(process.env.ERROR_RATE_CRITICAL_THRESHOLD) || 10.0, // %

            // Response time thresholds
            responseTimeThresholdWarning: parseInt(process.env.RESPONSE_TIME_WARNING_THRESHOLD) || 1000, // ms
            responseTimeThresholdCritical: parseInt(process.env.RESPONSE_TIME_CRITICAL_THRESHOLD) || 2000, // ms

            // Database thresholds
            dbConnectionThresholdWarning: parseInt(process.env.DB_CONNECTION_WARNING_THRESHOLD) || 80, // %
            dbConnectionThresholdCritical: parseInt(process.env.DB_CONNECTION_CRITICAL_THRESHOLD) || 90, // %

            // Memory thresholds
            memoryThresholdWarning: parseInt(process.env.MEMORY_WARNING_THRESHOLD) || 80, // %
            memoryThresholdCritical: parseInt(process.env.MEMORY_CRITICAL_THRESHOLD) || 90, // %

            // CPU thresholds
            cpuThresholdWarning: parseInt(process.env.CPU_WARNING_THRESHOLD) || 75, // %
            cpuThresholdCritical: parseInt(process.env.CPU_CRITICAL_THRESHOLD) || 90, // %

            // Alert suppression (prevent spam)
            alertSuppressionWindow: parseInt(process.env.ALERT_SUPPRESSION_WINDOW) || 300000, // 5 minutes

            // Check intervals
            checkInterval: parseInt(process.env.ALERT_CHECK_INTERVAL) || 60000, // 1 minute

            // Notification channels
            enableEmailAlerts: process.env.ENABLE_EMAIL_ALERTS === 'true',
            enableWebhookAlerts: process.env.ENABLE_WEBHOOK_ALERTS === 'true',
            alertWebhookUrl: process.env.ALERT_WEBHOOK_URL,
            alertEmailFrom: process.env.ALERT_EMAIL_FROM || 'alerts@caos-crm.com',
            alertEmailTo: process.env.ALERT_EMAIL_TO?.split(',') || [],

            // Slack integration
            enableSlackAlerts: process.env.ENABLE_SLACK_ALERTS === 'true',
            slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
            slackChannel: process.env.SLACK_CHANNEL || '#alerts'
        };

        this.alertTypes = {
            ERROR_RATE: 'error_rate',
            RESPONSE_TIME: 'response_time',
            DATABASE: 'database',
            MEMORY: 'memory',
            CPU: 'cpu',
            DISK: 'disk',
            SECURITY: 'security',
            BUSINESS: 'business'
        };

        this.severityLevels = {
            INFO: 'info',
            WARNING: 'warning',
            CRITICAL: 'critical'
        };

        // Start monitoring
        this.startMonitoring();

        logger.info('Alerting system initialized', {
            thresholds: {
                errorRate: `${this.config.errorRateThresholdWarning}%/${this.config.errorRateThresholdCritical}%`,
                responseTime: `${this.config.responseTimeThresholdWarning}ms/${this.config.responseTimeThresholdCritical}ms`,
                memory: `${this.config.memoryThresholdWarning}%/${this.config.memoryThresholdCritical}%`
            },
            channels: {
                email: this.config.enableEmailAlerts,
                webhook: this.config.enableWebhookAlerts,
                slack: this.config.enableSlackAlerts
            }
        });
    }

    /**
     * Start monitoring and alerting
     */
    startMonitoring() {
        setInterval(() => {
            this.checkSystemHealth();
        }, this.config.checkInterval);

        logger.info('System monitoring started', {
            interval: `${this.config.checkInterval}ms`
        });
    }

    /**
     * Check overall system health and trigger alerts
     */
    async checkSystemHealth() {
        try {
            // Check error rates
            await this.checkErrorRates();

            // Check response times
            await this.checkResponseTimes();

            // Check database health
            await this.checkDatabaseHealth();

            // Check system resources
            await this.checkSystemResources();

        } catch (error) {
            logger.error('System health check failed', {
                error: error.message,
                stack: error.stack
            });
        }
    }

    /**
     * Check API error rates
     */
    async checkErrorRates() {
        const coreWebVitals = performanceMonitor.getCoreWebVitals();
        const errorRate = parseFloat(coreWebVitals.errorRate);

        if (errorRate >= this.config.errorRateThresholdCritical) {
            await this.triggerAlert(this.alertTypes.ERROR_RATE, this.severityLevels.CRITICAL, {
                message: `Critical error rate detected: ${errorRate}%`,
                threshold: `${this.config.errorRateThresholdCritical}%`,
                currentValue: `${errorRate}%`,
                requestVolume: coreWebVitals.requestVolume
            });
        } else if (errorRate >= this.config.errorRateThresholdWarning) {
            await this.triggerAlert(this.alertTypes.ERROR_RATE, this.severityLevels.WARNING, {
                message: `High error rate detected: ${errorRate}%`,
                threshold: `${this.config.errorRateThresholdWarning}%`,
                currentValue: `${errorRate}%`,
                requestVolume: coreWebVitals.requestVolume
            });
        }
    }

    /**
     * Check API response times
     */
    async checkResponseTimes() {
        const coreWebVitals = performanceMonitor.getCoreWebVitals();
        const avgResponseTime = parseFloat(coreWebVitals.averageResponseTime);

        if (avgResponseTime >= this.config.responseTimeThresholdCritical) {
            await this.triggerAlert(this.alertTypes.RESPONSE_TIME, this.severityLevels.CRITICAL, {
                message: `Critical response time detected: ${avgResponseTime.toFixed(0)}ms`,
                threshold: `${this.config.responseTimeThresholdCritical}ms`,
                currentValue: `${avgResponseTime.toFixed(0)}ms`,
                percentiles: coreWebVitals.percentiles
            });
        } else if (avgResponseTime >= this.config.responseTimeThresholdWarning) {
            await this.triggerAlert(this.alertTypes.RESPONSE_TIME, this.severityLevels.WARNING, {
                message: `Slow response time detected: ${avgResponseTime.toFixed(0)}ms`,
                threshold: `${this.config.responseTimeThresholdWarning}ms`,
                currentValue: `${avgResponseTime.toFixed(0)}ms`,
                percentiles: coreWebVitals.percentiles
            });
        }
    }

    /**
     * Check database health
     */
    async checkDatabaseHealth() {
        const database = require('../config/database');

        try {
            const dbHealth = await database.getHealthStatus();
            const poolStats = database.getPoolStatus();

            if (!dbHealth.connected) {
                await this.triggerAlert(this.alertTypes.DATABASE, this.severityLevels.CRITICAL, {
                    message: 'Database connection lost',
                    status: dbHealth.status,
                    error: dbHealth.error
                });
                return;
            }

            // Check connection pool utilization
            const poolUtilization = poolStats.totalConnections > 0
                ? (poolStats.usedConnections / poolStats.totalConnections) * 100
                : 0;

            if (poolUtilization >= this.config.dbConnectionThresholdCritical) {
                await this.triggerAlert(this.alertTypes.DATABASE, this.severityLevels.CRITICAL, {
                    message: `Critical database connection pool usage: ${poolUtilization.toFixed(1)}%`,
                    threshold: `${this.config.dbConnectionThresholdCritical}%`,
                    currentValue: `${poolUtilization.toFixed(1)}%`,
                    poolStats
                });
            } else if (poolUtilization >= this.config.dbConnectionThresholdWarning) {
                await this.triggerAlert(this.alertTypes.DATABASE, this.severityLevels.WARNING, {
                    message: `High database connection pool usage: ${poolUtilization.toFixed(1)}%`,
                    threshold: `${this.config.dbConnectionThresholdWarning}%`,
                    currentValue: `${poolUtilization.toFixed(1)}%`,
                    poolStats
                });
            }

            // Check database response time
            const responseTime = dbHealth.responseTime ? parseInt(dbHealth.responseTime) : 0;
            if (responseTime > 500) {
                await this.triggerAlert(this.alertTypes.DATABASE, this.severityLevels.WARNING, {
                    message: `Slow database response time: ${responseTime}ms`,
                    threshold: '500ms',
                    currentValue: `${responseTime}ms`
                });
            }

        } catch (error) {
            await this.triggerAlert(this.alertTypes.DATABASE, this.severityLevels.CRITICAL, {
                message: 'Database health check failed',
                error: error.message
            });
        }
    }

    /**
     * Check system resources (memory, CPU)
     */
    async checkSystemResources() {
        const os = require('os');

        // Memory check
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const memoryUsage = ((totalMemory - freeMemory) / totalMemory) * 100;

        if (memoryUsage >= this.config.memoryThresholdCritical) {
            await this.triggerAlert(this.alertTypes.MEMORY, this.severityLevels.CRITICAL, {
                message: `Critical memory usage: ${memoryUsage.toFixed(1)}%`,
                threshold: `${this.config.memoryThresholdCritical}%`,
                currentValue: `${memoryUsage.toFixed(1)}%`,
                totalMemory: `${(totalMemory / 1024 / 1024 / 1024).toFixed(2)}GB`,
                freeMemory: `${(freeMemory / 1024 / 1024 / 1024).toFixed(2)}GB`
            });
        } else if (memoryUsage >= this.config.memoryThresholdWarning) {
            await this.triggerAlert(this.alertTypes.MEMORY, this.severityLevels.WARNING, {
                message: `High memory usage: ${memoryUsage.toFixed(1)}%`,
                threshold: `${this.config.memoryThresholdWarning}%`,
                currentValue: `${memoryUsage.toFixed(1)}%`,
                totalMemory: `${(totalMemory / 1024 / 1024 / 1024).toFixed(2)}GB`,
                freeMemory: `${(freeMemory / 1024 / 1024 / 1024).toFixed(2)}GB`
            });
        }

        // CPU check (simplified)
        const loadAvg = os.loadavg();
        const numCPUs = os.cpus().length;
        const cpuUsage = (loadAvg[0] / numCPUs) * 100;

        if (cpuUsage >= this.config.cpuThresholdCritical) {
            await this.triggerAlert(this.alertTypes.CPU, this.severityLevels.CRITICAL, {
                message: `Critical CPU usage: ${cpuUsage.toFixed(1)}%`,
                threshold: `${this.config.cpuThresholdCritical}%`,
                currentValue: `${cpuUsage.toFixed(1)}%`,
                loadAverage: loadAvg[0].toFixed(2),
                cores: numCPUs
            });
        } else if (cpuUsage >= this.config.cpuThresholdWarning) {
            await this.triggerAlert(this.alertTypes.CPU, this.severityLevels.WARNING, {
                message: `High CPU usage: ${cpuUsage.toFixed(1)}%`,
                threshold: `${this.config.cpuThresholdWarning}%`,
                currentValue: `${cpuUsage.toFixed(1)}%`,
                loadAverage: loadAvg[0].toFixed(2),
                cores: numCPUs
            });
        }
    }

    /**
     * Trigger an alert
     */
    async triggerAlert(type, severity, details) {
        const alertKey = `${type}_${severity}`;
        const now = Date.now();

        // Check if alert should be suppressed
        const lastAlert = this.alerts.get(alertKey);
        if (lastAlert && (now - lastAlert.timestamp) < this.config.alertSuppressionWindow) {
            logger.debug('Alert suppressed due to suppression window', {
                type,
                severity,
                suppressionWindow: `${this.config.alertSuppressionWindow}ms`
            });
            return;
        }

        const alert = {
            id: this.generateAlertId(),
            type,
            severity,
            timestamp: now,
            message: details.message,
            details,
            resolved: false,
            environment: process.env.NODE_ENV || 'development'
        };

        // Store alert
        this.alerts.set(alertKey, alert);
        this.addToHistory(alert);

        // Log alert
        logger.warn('Alert triggered', alert);

        // Send notifications
        await this.sendNotifications(alert);

        return alert;
    }

    /**
     * Generate unique alert ID
     */
    generateAlertId() {
        return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Send alert notifications through configured channels
     */
    async sendNotifications(alert) {
        const notifications = [];

        // Email notifications
        if (this.config.enableEmailAlerts && this.config.alertEmailTo.length > 0) {
            notifications.push(this.sendEmailAlert(alert));
        }

        // Webhook notifications
        if (this.config.enableWebhookAlerts && this.config.alertWebhookUrl) {
            notifications.push(this.sendWebhookAlert(alert));
        }

        // Slack notifications
        if (this.config.enableSlackAlerts && this.config.slackWebhookUrl) {
            notifications.push(this.sendSlackAlert(alert));
        }

        // Wait for all notifications to complete
        try {
            await Promise.allSettled(notifications);
        } catch (error) {
            logger.error('Error sending alert notifications', {
                alertId: alert.id,
                error: error.message
            });
        }
    }

    /**
     * Send email alert (basic implementation)
     */
    async sendEmailAlert(alert) {
        try {
            // In a real implementation, you would integrate with an email service
            // like SendGrid, AWS SES, or SMTP
            logger.info('Email alert would be sent', {
                alertId: alert.id,
                to: this.config.alertEmailTo,
                subject: `[${alert.severity.toUpperCase()}] CAOS CRM Alert: ${alert.type}`,
                message: alert.message
            });
        } catch (error) {
            logger.error('Failed to send email alert', {
                alertId: alert.id,
                error: error.message
            });
        }
    }

    /**
     * Send webhook alert
     */
    async sendWebhookAlert(alert) {
        try {
            // In a real implementation, you would make HTTP request to webhook URL
            logger.info('Webhook alert would be sent', {
                alertId: alert.id,
                url: this.config.alertWebhookUrl,
                payload: alert
            });
        } catch (error) {
            logger.error('Failed to send webhook alert', {
                alertId: alert.id,
                error: error.message
            });
        }
    }

    /**
     * Send Slack alert
     */
    async sendSlackAlert(alert) {
        try {
            const color = alert.severity === 'critical' ? 'danger' : 'warning';
            const emoji = alert.severity === 'critical' ? '🚨' : '⚠️';

            const slackPayload = {
                channel: this.config.slackChannel,
                username: 'CAOS CRM Alerts',
                icon_emoji: ':exclamation:',
                attachments: [{
                    color: color,
                    title: `${emoji} ${alert.severity.toUpperCase()} Alert: ${alert.type}`,
                    text: alert.message,
                    fields: [
                        {
                            title: 'Environment',
                            value: alert.environment,
                            short: true
                        },
                        {
                            title: 'Timestamp',
                            value: new Date(alert.timestamp).toISOString(),
                            short: true
                        }
                    ],
                    footer: 'CAOS CRM Monitoring',
                    ts: Math.floor(alert.timestamp / 1000)
                }]
            };

            logger.info('Slack alert would be sent', {
                alertId: alert.id,
                channel: this.config.slackChannel,
                payload: slackPayload
            });
        } catch (error) {
            logger.error('Failed to send Slack alert', {
                alertId: alert.id,
                error: error.message
            });
        }
    }

    /**
     * Add alert to history
     */
    addToHistory(alert) {
        this.alertHistory.push(alert);

        // Keep only recent entries
        if (this.alertHistory.length > this.maxHistoryEntries) {
            this.alertHistory.shift();
        }
    }

    /**
     * Get current active alerts
     */
    getActiveAlerts() {
        return Array.from(this.alerts.values()).filter(alert => !alert.resolved);
    }

    /**
     * Get alert history
     */
    getAlertHistory(limit = 50) {
        return this.alertHistory
            .slice(-limit)
            .sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * Get alert statistics
     */
    getAlertStatistics() {
        const now = Date.now();
        const last24h = now - (24 * 60 * 60 * 1000);
        const last7d = now - (7 * 24 * 60 * 60 * 1000);

        const recent24h = this.alertHistory.filter(alert => alert.timestamp > last24h);
        const recent7d = this.alertHistory.filter(alert => alert.timestamp > last7d);

        return {
            active: this.getActiveAlerts().length,
            total: this.alertHistory.length,
            last24h: recent24h.length,
            last7d: recent7d.length,
            byType: this.groupAlertsByField(this.alertHistory, 'type'),
            bySeverity: this.groupAlertsByField(this.alertHistory, 'severity'),
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Group alerts by field
     */
    groupAlertsByField(alerts, field) {
        return alerts.reduce((groups, alert) => {
            const key = alert[field];
            groups[key] = (groups[key] || 0) + 1;
            return groups;
        }, {});
    }

    /**
     * Resolve an alert
     */
    resolveAlert(alertId) {
        for (const [key, alert] of this.alerts.entries()) {
            if (alert.id === alertId) {
                alert.resolved = true;
                alert.resolvedAt = Date.now();
                this.alerts.set(key, alert);

                logger.info('Alert resolved', { alertId });
                return alert;
            }
        }

        return null;
    }

    /**
     * Create Express endpoints for alert management
     */
    createAlertsEndpoint() {
        const express = require('express');
        const router = express.Router();

        // Get active alerts
        router.get('/active', (req, res) => {
            res.json({
                alerts: this.getActiveAlerts(),
                count: this.getActiveAlerts().length,
                timestamp: new Date().toISOString()
            });
        });

        // Get alert history
        router.get('/history', (req, res) => {
            const limit = parseInt(req.query.limit) || 50;
            res.json({
                alerts: this.getAlertHistory(limit),
                timestamp: new Date().toISOString()
            });
        });

        // Get alert statistics
        router.get('/stats', (req, res) => {
            res.json(this.getAlertStatistics());
        });

        // Resolve alert
        router.post('/:alertId/resolve', (req, res) => {
            const alertId = req.params.alertId;
            const resolvedAlert = this.resolveAlert(alertId);

            if (resolvedAlert) {
                res.json({
                    success: true,
                    alert: resolvedAlert
                });
            } else {
                res.status(404).json({
                    error: 'Alert not found',
                    alertId
                });
            }
        });

        return router;
    }
}

// Create singleton instance
const alertingSystem = new AlertingSystem();

module.exports = {
    alertingSystem,
    AlertingSystem
};
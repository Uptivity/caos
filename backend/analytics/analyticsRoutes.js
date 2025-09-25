// Analytics API Routes - RESTful endpoints for analytics and reporting
const express = require('express');
const router = express.Router();
const analyticsModel = require('./analyticsModel');
const auth = require('../auth/auth');
const { requireAuth, getAuthenticatedUserId } = require('../middleware/authMiddleware');
const { logger } = require('../utils/secureLogger');

// Apply authentication middleware to all analytics routes
router.use(auth.authenticateToken);

// =============================================================================
// METRICS ENDPOINTS
// =============================================================================

/**
 * GET /api/analytics/metrics
 * Get calculated metrics for specified data source and date range
 * Query params: dataSource, dateRange (7d, 30d, 90d)
 */
router.get('/metrics', requireAuth, async (req, res) => {
    try {
        const { dataSource = 'all', dateRange = '30d' } = req.query;

        // Validate date range
        const validRanges = ['7d', '30d', '90d'];
        if (!validRanges.includes(dateRange)) {
            return res.status(400).json({
                error: 'Invalid date range',
                validRanges: validRanges
            });
        }

        const metrics = await analyticsModel.calculateMetrics(dataSource, dateRange);

        res.json({
            success: true,
            data: metrics,
            dataSource,
            dateRange,
            retrievedAt: new Date()
        });
    } catch (error) {
        logger.error('Error getting metrics', { error: error.message });
        res.status(500).json({
            error: 'Failed to retrieve metrics',
            details: error.message
        });
    }
});

/**
 * GET /api/analytics/metrics/realtime
 * Get real-time metrics for dashboard
 */
router.get('/metrics/realtime', requireAuth, async (req, res) => {
    try {
        const realtimeData = await analyticsModel.getRealtimeMetrics();

        res.json({
            success: true,
            data: realtimeData,
            isRealtime: true
        });
    } catch (error) {
        logger.error('Error getting realtime metrics', { error: error.message });
        res.status(500).json({
            error: 'Failed to retrieve realtime metrics',
            details: error.message
        });
    }
});

/**
 * GET /api/analytics/metrics/performance
 * Get system performance metrics
 */
router.get('/metrics/performance', requireAuth, async (req, res) => {
    try {
        const performanceData = await analyticsModel.getPerformanceMetrics();

        res.json({
            success: true,
            data: performanceData,
            category: 'performance'
        });
    } catch (error) {
        logger.error('Error getting performance metrics', { error: error.message });
        res.status(500).json({
            error: 'Failed to retrieve performance metrics',
            details: error.message
        });
    }
});

// =============================================================================
// CUSTOM REPORTS ENDPOINTS
// =============================================================================

/**
 * GET /api/analytics/reports
 * Get all custom reports with optional filtering
 * Query params: type, includeDefault
 */
router.get('/reports', requireAuth, async (req, res) => {
    try {
        const filters = {
            type: req.query.type,
            includeDefault: req.query.includeDefault !== 'false'
        };

        const reports = await analyticsModel.getAllCustomReports(filters);

        res.json({
            success: true,
            data: reports,
            count: reports.length,
            filters: filters
        });
    } catch (error) {
        logger.error('Error getting reports', { error: error.message });
        res.status(500).json({
            error: 'Failed to retrieve reports',
            details: error.message
        });
    }
});

/**
 * GET /api/analytics/reports/:reportId
 * Get specific custom report
 */
router.get('/reports/:reportId', requireAuth, async (req, res) => {
    try {
        const { reportId } = req.params;
        const report = await analyticsModel.getCustomReport(reportId);

        if (!report) {
            return res.status(404).json({
                error: 'Report not found',
                reportId: reportId
            });
        }

        res.json({
            success: true,
            data: report
        });
    } catch (error) {
        logger.error('Error getting report', { error: error.message });
        res.status(500).json({
            error: 'Failed to retrieve report',
            details: error.message
        });
    }
});

/**
 * POST /api/analytics/reports
 * Create new custom report
 */
router.post('/reports', requireAuth, async (req, res) => {
    try {
        const reportData = req.body;

        // Validate required fields
        if (!reportData.name || !reportData.type) {
            return res.status(400).json({
                error: 'Missing required fields',
                required: ['name', 'type']
            });
        }

        // Validate report type
        const validTypes = ['pipeline', 'conversion', 'campaign', 'product', 'activity', 'custom'];
        if (!validTypes.includes(reportData.type)) {
            return res.status(400).json({
                error: 'Invalid report type',
                validTypes: validTypes
            });
        }

        const report = await analyticsModel.createCustomReport({
            ...reportData,
            createdBy: req.user.id
        });

        res.status(201).json({
            success: true,
            data: report,
            message: 'Report created successfully'
        });
    } catch (error) {
        logger.error('Error creating report', { error: error.message });
        res.status(500).json({
            error: 'Failed to create report',
            details: error.message
        });
    }
});

/**
 * PUT /api/analytics/reports/:reportId
 * Update custom report
 */
router.put('/reports/:reportId', requireAuth, async (req, res) => {
    try {
        const { reportId } = req.params;
        const updates = req.body;

        const updatedReport = await analyticsModel.updateCustomReport(reportId, {
            ...updates,
            updatedBy: req.user.id
        });

        res.json({
            success: true,
            data: updatedReport,
            message: 'Report updated successfully'
        });
    } catch (error) {
        logger.error('Error updating report', { error: error.message });

        if (error.message === 'Report not found') {
            return res.status(404).json({ error: error.message });
        }
        if (error.message === 'Cannot modify default reports') {
            return res.status(403).json({ error: error.message });
        }

        res.status(500).json({
            error: 'Failed to update report',
            details: error.message
        });
    }
});

/**
 * DELETE /api/analytics/reports/:reportId
 * Delete custom report
 */
router.delete('/reports/:reportId', requireAuth, async (req, res) => {
    try {
        const { reportId } = req.params;
        const deleted = await analyticsModel.deleteCustomReport(reportId);

        if (!deleted) {
            return res.status(404).json({
                error: 'Report not found'
            });
        }

        res.json({
            success: true,
            message: 'Report deleted successfully',
            reportId: reportId
        });
    } catch (error) {
        logger.error('Error deleting report', { error: error.message });

        if (error.message === 'Report not found') {
            return res.status(404).json({ error: error.message });
        }
        if (error.message === 'Cannot delete default reports') {
            return res.status(403).json({ error: error.message });
        }

        res.status(500).json({
            error: 'Failed to delete report',
            details: error.message
        });
    }
});

// =============================================================================
// DASHBOARD ENDPOINTS
// =============================================================================

/**
 * GET /api/analytics/dashboard/layout
 * Get dashboard widget layout
 */
router.get('/dashboard/layout', requireAuth, async (req, res) => {
    try {
        const layout = await analyticsModel.getDashboardLayout();

        res.json({
            success: true,
            data: layout,
            count: layout.length
        });
    } catch (error) {
        logger.error('Error getting dashboard layout', { error: error.message });
        res.status(500).json({
            error: 'Failed to retrieve dashboard layout',
            details: error.message
        });
    }
});

/**
 * PUT /api/analytics/dashboard/layout
 * Update dashboard widget layout
 */
router.put('/dashboard/layout', requireAuth, async (req, res) => {
    try {
        const { widgets } = req.body;

        if (!Array.isArray(widgets)) {
            return res.status(400).json({
                error: 'Widgets must be an array'
            });
        }

        const updatedLayout = await analyticsModel.updateDashboardLayout(widgets);

        res.json({
            success: true,
            data: updatedLayout,
            message: 'Dashboard layout updated successfully'
        });
    } catch (error) {
        logger.error('Error updating dashboard layout', { error: error.message });
        res.status(500).json({
            error: 'Failed to update dashboard layout',
            details: error.message
        });
    }
});

// =============================================================================
// EXPORT ENDPOINTS
// =============================================================================

/**
 * GET /api/analytics/export/:reportId
 * Export analytics data for a specific report
 * Query params: format (json, csv, excel)
 */
router.get('/export/:reportId', requireAuth, async (req, res) => {
    try {
        const { reportId } = req.params;
        const { format = 'json' } = req.query;

        // Validate format
        const validFormats = ['json', 'csv', 'excel'];
        if (!validFormats.includes(format)) {
            return res.status(400).json({
                error: 'Invalid export format',
                validFormats: validFormats
            });
        }

        const exportData = await analyticsModel.exportAnalyticsData(reportId, format);

        // Set appropriate headers based on format
        switch (format) {
            case 'csv':
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename="report-${reportId}.csv"`);
                break;
            case 'excel':
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', `attachment; filename="report-${reportId}.xlsx"`);
                break;
            default:
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Content-Disposition', `attachment; filename="report-${reportId}.json"`);
        }

        res.json({
            success: true,
            data: exportData,
            format: format,
            exportedAt: new Date()
        });
    } catch (error) {
        logger.error('Error exporting data', { error: error.message });

        if (error.message === 'Report not found') {
            return res.status(404).json({ error: error.message });
        }

        res.status(500).json({
            error: 'Failed to export data',
            details: error.message
        });
    }
});

// =============================================================================
// REPORT EXECUTION ENDPOINTS
// =============================================================================

/**
 * POST /api/analytics/reports/:reportId/execute
 * Execute a report and get results
 */
router.post('/reports/:reportId/execute', requireAuth, async (req, res) => {
    try {
        const { reportId } = req.params;
        const { parameters = {} } = req.body;

        const report = await analyticsModel.getCustomReport(reportId);
        if (!report) {
            return res.status(404).json({
                error: 'Report not found',
                reportId: reportId
            });
        }

        // Execute the report with parameters
        const dateRange = parameters.dateRange || `${report.dateRange}d`;
        const metrics = await analyticsModel.calculateMetrics('all', dateRange);

        // Filter metrics based on report configuration
        const reportResults = {
            report: report,
            parameters: parameters,
            results: metrics,
            executedAt: new Date(),
            executedBy: req.user.id
        };

        res.json({
            success: true,
            data: reportResults
        });
    } catch (error) {
        logger.error('Error executing report', { error: error.message });
        res.status(500).json({
            error: 'Failed to execute report',
            details: error.message
        });
    }
});

/**
 * GET /api/analytics/health
 * Analytics service health check
 */
router.get('/health', requireAuth, async (req, res) => {
    try {
        const performanceMetrics = await analyticsModel.getPerformanceMetrics();
        const isHealthy = performanceMetrics.errorRate < 0.05; // Less than 5% error rate

        res.status(isHealthy ? 200 : 503).json({
            status: isHealthy ? 'healthy' : 'unhealthy',
            service: 'analytics',
            performance: performanceMetrics,
            timestamp: new Date()
        });
    } catch (error) {
        logger.error('Error checking analytics health', { error: error.message });
        res.status(503).json({
            status: 'unhealthy',
            service: 'analytics',
            error: error.message,
            timestamp: new Date()
        });
    }
});

module.exports = router;
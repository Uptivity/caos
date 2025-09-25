/**
 * Reports Routes
 * RESTful API endpoints for comprehensive reporting system
 * Module 14: Reports
 */

const express = require('express');
const router = express.Router();
const { requireAuth, getAuthenticatedUserId } = require('../middleware/authMiddleware');
const { logger } = require('../utils/secureLogger');
const {
    REPORT_TYPES,
    REPORT_CATEGORIES,
    CHART_TYPES,
    EXPORT_FORMATS,
    saveReportTemplate,
    generateReport,
    getAllReportTemplates,
    getAllReports,
    saveDashboard,
    getDashboardById,
    getAllDashboards,
    generateSalesReport,
    generateMarketingReport,
    generateProductivityReport,
    generateTrendReport
} = require('./reportsModel');

// Validation middleware
const validateReportTemplate = (req, res, next) => {
    const { name, category, dataSource } = req.body;
    const errors = [];

    if (!name || name.trim().length === 0) {
        errors.push('Report template name is required');
    }

    if (!category || !Object.values(REPORT_CATEGORIES).includes(category)) {
        errors.push('Valid report category is required');
    }

    if (!dataSource || dataSource.trim().length === 0) {
        errors.push('Data source is required');
    }

    if (errors.length > 0) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors
        });
    }

    next();
};

const validateDashboard = (req, res, next) => {
    const { name } = req.body;
    const errors = [];

    if (!name || name.trim().length === 0) {
        errors.push('Dashboard name is required');
    }

    if (errors.length > 0) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors
        });
    }

    next();
};

const validateReportGeneration = (req, res, next) => {
    const { templateId } = req.params;

    if (!templateId) {
        return res.status(400).json({
            success: false,
            message: 'Template ID is required'
        });
    }

    next();
};

// Report Templates Management

// Create report template
router.post('/templates', validateReportTemplate, (req, res) => {
    try {
        const template = saveReportTemplate({
            ...req.body,
            createdBy: getAuthenticatedUserId(req)
        });

        res.status(201).json({
            success: true,
            message: 'Report template created successfully',
            data: template
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: 'Failed to create report template',
            error: error.message
        });
    }
});

// Get all report templates
router.get('/templates', (req, res) => {
    try {
        const filters = {
            category: req.query.category,
            type: req.query.type,
            isActive: req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined
        };

        // Remove undefined values
        Object.keys(filters).forEach(key => {
            if (filters[key] === undefined) {
                delete filters[key];
            }
        });

        const templates = getAllReportTemplates(filters);

        res.json({
            success: true,
            message: 'Report templates retrieved successfully',
            data: templates,
            count: templates.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve report templates',
            error: error.message
        });
    }
});

// Report Generation and Management

// Generate report from template
router.post('/templates/:templateId/generate', validateReportGeneration, (req, res) => {
    try {
        const { templateId } = req.params;
        const parameters = req.body || {};

        const report = generateReport(templateId, {
            ...parameters,
            userId: getAuthenticatedUserId(req)
        });

        res.status(201).json({
            success: true,
            message: 'Report generated successfully',
            data: report
        });
    } catch (error) {
        if (error.message === 'Report template not found') {
            return res.status(404).json({
                success: false,
                message: error.message
            });
        }

        res.status(500).json({
            success: false,
            message: 'Failed to generate report',
            error: error.message
        });
    }
});

// Get all reports
router.get('/', (req, res) => {
    try {
        const filters = {
            category: req.query.category,
            userId: req.query.userId,
            dateFrom: req.query.dateFrom,
            limit: req.query.limit ? parseInt(req.query.limit) : undefined,
            offset: req.query.offset ? parseInt(req.query.offset) : undefined
        };

        // Remove undefined values
        Object.keys(filters).forEach(key => {
            if (filters[key] === undefined) {
                delete filters[key];
            }
        });

        const reports = getAllReports(filters);

        res.json({
            success: true,
            message: 'Reports retrieved successfully',
            data: reports,
            count: reports.length,
            filters
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve reports',
            error: error.message
        });
    }
});

// Get specific report by ID
router.get('/:id', (req, res) => {
    try {
        const report = getAllReports().find(r => r.id === req.params.id);

        if (!report) {
            return res.status(404).json({
                success: false,
                message: 'Report not found'
            });
        }

        res.json({
            success: true,
            message: 'Report retrieved successfully',
            data: report
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve report',
            error: error.message
        });
    }
});

// Quick Report Generation (without templates)

// Generate sales report
router.post('/quick/sales', (req, res) => {
    try {
        const filters = req.body || {};
        const reportData = generateSalesReport(filters);

        const report = {
            id: 'quick_sales_' + Date.now(),
            name: 'Quick Sales Report',
            type: REPORT_TYPES.SUMMARY,
            category: REPORT_CATEGORIES.SALES,
            data: reportData.data,
            chartData: reportData.chartData,
            summary: reportData.summary,
            generatedAt: new Date(),
            parameters: filters
        };

        res.json({
            success: true,
            message: 'Sales report generated successfully',
            data: report
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to generate sales report',
            error: error.message
        });
    }
});

// Generate marketing report
router.post('/quick/marketing', (req, res) => {
    try {
        const filters = req.body || {};
        const reportData = generateMarketingReport(filters);

        const report = {
            id: 'quick_marketing_' + Date.now(),
            name: 'Quick Marketing Report',
            type: REPORT_TYPES.DETAILED,
            category: REPORT_CATEGORIES.MARKETING,
            data: reportData.data,
            chartData: reportData.chartData,
            summary: reportData.summary,
            generatedAt: new Date(),
            parameters: filters
        };

        res.json({
            success: true,
            message: 'Marketing report generated successfully',
            data: report
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to generate marketing report',
            error: error.message
        });
    }
});

// Generate productivity report
router.post('/quick/productivity', (req, res) => {
    try {
        const filters = req.body || {};
        const reportData = generateProductivityReport(filters);

        const report = {
            id: 'quick_productivity_' + Date.now(),
            name: 'Quick Productivity Report',
            type: REPORT_TYPES.SUMMARY,
            category: REPORT_CATEGORIES.PRODUCTIVITY,
            data: reportData.data,
            chartData: reportData.chartData,
            summary: reportData.summary,
            generatedAt: new Date(),
            parameters: filters
        };

        res.json({
            success: true,
            message: 'Productivity report generated successfully',
            data: report
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to generate productivity report',
            error: error.message
        });
    }
});

// Generate trends report
router.post('/quick/trends', (req, res) => {
    try {
        const filters = req.body || {};
        const reportData = generateTrendReport(filters);

        const report = {
            id: 'quick_trends_' + Date.now(),
            name: 'Quick Trends Report',
            type: REPORT_TYPES.TREND,
            category: REPORT_CATEGORIES.OPERATIONS,
            data: reportData.data,
            chartData: reportData.chartData,
            summary: reportData.summary || {},
            generatedAt: new Date(),
            parameters: filters
        };

        res.json({
            success: true,
            message: 'Trends report generated successfully',
            data: report
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to generate trends report',
            error: error.message
        });
    }
});

// Dashboard Management

// Create dashboard
router.post('/dashboards', validateDashboard, (req, res) => {
    try {
        const dashboard = saveDashboard({
            ...req.body,
            createdBy: getAuthenticatedUserId(req)
        });

        res.status(201).json({
            success: true,
            message: 'Dashboard created successfully',
            data: dashboard
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: 'Failed to create dashboard',
            error: error.message
        });
    }
});

// Get all dashboards
router.get('/dashboards', (req, res) => {
    try {
        const dashboards = getAllDashboards();

        res.json({
            success: true,
            message: 'Dashboards retrieved successfully',
            data: dashboards,
            count: dashboards.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve dashboards',
            error: error.message
        });
    }
});

// Get dashboard by ID
router.get('/dashboards/:id', (req, res) => {
    try {
        const dashboard = getDashboardById(req.params.id);

        if (!dashboard) {
            return res.status(404).json({
                success: false,
                message: 'Dashboard not found'
            });
        }

        res.json({
            success: true,
            message: 'Dashboard retrieved successfully',
            data: dashboard
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve dashboard',
            error: error.message
        });
    }
});

// Analytics and Insights

// Get reporting overview
router.get('/overview', (req, res) => {
    try {
        const templates = getAllReportTemplates();
        const reports = getAllReports();
        const dashboards = getAllDashboards();

        const overview = {
            totalTemplates: templates.length,
            activeTemplates: templates.filter(t => t.isActive).length,
            totalReports: reports.length,
            reportsThisWeek: reports.filter(r => {
                const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                return new Date(r.generatedAt) > weekAgo;
            }).length,
            totalDashboards: dashboards.length,
            categoryBreakdown: {
                sales: reports.filter(r => r.category === REPORT_CATEGORIES.SALES).length,
                marketing: reports.filter(r => r.category === REPORT_CATEGORIES.MARKETING).length,
                productivity: reports.filter(r => r.category === REPORT_CATEGORIES.PRODUCTIVITY).length,
                operations: reports.filter(r => r.category === REPORT_CATEGORIES.OPERATIONS).length
            },
            recentReports: reports.slice(0, 5).map(r => ({
                id: r.id,
                name: r.name,
                category: r.category,
                generatedAt: r.generatedAt,
                executionTime: r.executionTime
            }))
        };

        res.json({
            success: true,
            message: 'Reporting overview retrieved successfully',
            data: overview
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve reporting overview',
            error: error.message
        });
    }
});

// Get report statistics
router.get('/stats/performance', (req, res) => {
    try {
        const reports = getAllReports();

        const stats = {
            totalReports: reports.length,
            avgExecutionTime: reports.length > 0
                ? Math.round(reports.reduce((sum, r) => sum + r.executionTime, 0) / reports.length)
                : 0,
            reportsByCategory: {
                sales: reports.filter(r => r.category === REPORT_CATEGORIES.SALES).length,
                marketing: reports.filter(r => r.category === REPORT_CATEGORIES.MARKETING).length,
                productivity: reports.filter(r => r.category === REPORT_CATEGORIES.PRODUCTIVITY).length,
                operations: reports.filter(r => r.category === REPORT_CATEGORIES.OPERATIONS).length,
                financial: reports.filter(r => r.category === REPORT_CATEGORIES.FINANCIAL).length,
                customer: reports.filter(r => r.category === REPORT_CATEGORIES.CUSTOMER).length
            },
            reportsByType: {
                summary: reports.filter(r => r.type === REPORT_TYPES.SUMMARY).length,
                detailed: reports.filter(r => r.type === REPORT_TYPES.DETAILED).length,
                trend: reports.filter(r => r.type === REPORT_TYPES.TREND).length,
                comparison: reports.filter(r => r.type === REPORT_TYPES.COMPARISON).length,
                custom: reports.filter(r => r.type === REPORT_TYPES.CUSTOM).length
            },
            recentActivity: reports
                .filter(r => new Date(r.generatedAt) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
                .length
        };

        res.json({
            success: true,
            message: 'Report performance statistics retrieved successfully',
            data: stats
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve report statistics',
            error: error.message
        });
    }
});

// Export functionality (placeholder for future implementation)
router.post('/:id/export', (req, res) => {
    try {
        const { format = 'json' } = req.body;
        const report = getAllReports().find(r => r.id === req.params.id);

        if (!report) {
            return res.status(404).json({
                success: false,
                message: 'Report not found'
            });
        }

        // For now, return JSON format
        // Future implementation could handle PDF, CSV, Excel exports
        res.json({
            success: true,
            message: `Report exported successfully as ${format.toUpperCase()}`,
            data: {
                format,
                exportedAt: new Date(),
                report: report
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to export report',
            error: error.message
        });
    }
});

// Utility endpoints

// Get report constants
router.get('/constants', (req, res) => {
    try {
        res.json({
            success: true,
            message: 'Report constants retrieved successfully',
            data: {
                REPORT_TYPES,
                REPORT_CATEGORIES,
                CHART_TYPES,
                EXPORT_FORMATS
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve constants',
            error: error.message
        });
    }
});

// Get available data sources
router.get('/data-sources', (req, res) => {
    try {
        const dataSources = [
            {
                id: 'leads',
                name: 'Leads',
                description: 'Lead management and pipeline data',
                fields: ['status', 'source', 'value', 'assignedTo', 'createdAt']
            },
            {
                id: 'campaigns',
                name: 'Campaigns',
                description: 'Marketing campaigns and performance',
                fields: ['status', 'type', 'recipients', 'sent', 'opened', 'clicked']
            },
            {
                id: 'products',
                name: 'Products',
                description: 'Product catalog and sales data',
                fields: ['category', 'price', 'stock', 'sales', 'revenue']
            },
            {
                id: 'tasks',
                name: 'Tasks',
                description: 'Task management and productivity',
                fields: ['status', 'priority', 'assignedTo', 'dueDate', 'completedAt']
            },
            {
                id: 'emails',
                name: 'Emails',
                description: 'Email communications and delivery',
                fields: ['status', 'type', 'deliveryStatus', 'opened', 'clicked']
            },
            {
                id: 'calendar',
                name: 'Calendar',
                description: 'Events and scheduling data',
                fields: ['type', 'status', 'attendees', 'duration', 'createdAt']
            }
        ];

        res.json({
            success: true,
            message: 'Data sources retrieved successfully',
            data: dataSources
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve data sources',
            error: error.message
        });
    }
});

// Error handling middleware
router.use((error, req, res, next) => {
    logger.error('Reports API Error', { error: error.message });

    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
});

module.exports = router;
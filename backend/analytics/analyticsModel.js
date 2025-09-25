// Analytics Model - In-memory analytics and metrics calculation
const crypto = require('crypto');

class AnalyticsModel {
    constructor() {
        // Analytics data storage
        this.metricsCache = new Map();
        this.reportQueries = new Map();
        this.customReports = new Map();

        // Metric calculation history
        this.metricsHistory = new Map();
        this.lastCalculation = new Map();

        // Dashboard widgets configuration
        this.widgets = new Map();

        this.initializeDefaultReports();
    }

    initializeDefaultReports() {
        // Default report templates
        const defaultReports = [
            {
                id: 'sales-pipeline',
                name: 'Sales Pipeline Analysis',
                description: 'Analyze lead progression through sales stages',
                type: 'pipeline',
                dateRange: 30,
                groupBy: 'status',
                metrics: ['count', 'value', 'conversionRate']
            },
            {
                id: 'lead-conversion',
                name: 'Lead Conversion Metrics',
                description: 'Track lead conversion rates and patterns',
                type: 'conversion',
                dateRange: 90,
                groupBy: 'source',
                metrics: ['conversionRate', 'avgDealTime', 'valuePerLead']
            },
            {
                id: 'campaign-performance',
                name: 'Campaign Performance Report',
                description: 'Analyze campaign effectiveness and ROI',
                type: 'campaign',
                dateRange: 60,
                groupBy: 'campaign',
                metrics: ['opens', 'clicks', 'conversions', 'roi']
            },
            {
                id: 'product-sales',
                name: 'Product Sales Analysis',
                description: 'Track product performance and inventory',
                type: 'product',
                dateRange: 30,
                groupBy: 'category',
                metrics: ['unitsSold', 'revenue', 'profitMargin']
            },
            {
                id: 'user-activity',
                name: 'User Activity Report',
                description: 'Monitor team productivity and engagement',
                type: 'activity',
                dateRange: 7,
                groupBy: 'user',
                metrics: ['logins', 'actions', 'leadsProcessed']
            }
        ];

        defaultReports.forEach(report => {
            this.customReports.set(report.id, {
                ...report,
                createdAt: new Date(),
                updatedAt: new Date(),
                isDefault: true
            });
        });

        // Initialize default dashboard widgets
        this.initializeDefaultWidgets();
    }

    initializeDefaultWidgets() {
        const defaultWidgets = [
            {
                id: 'total-leads',
                type: 'metric',
                title: 'Total Leads',
                position: { x: 0, y: 0, w: 3, h: 2 },
                config: { metric: 'totalLeads', period: '30d' }
            },
            {
                id: 'conversion-rate',
                type: 'metric',
                title: 'Conversion Rate',
                position: { x: 3, y: 0, w: 3, h: 2 },
                config: { metric: 'conversionRate', period: '30d' }
            },
            {
                id: 'revenue-trend',
                type: 'chart',
                title: 'Revenue Trend',
                position: { x: 0, y: 2, w: 6, h: 4 },
                config: { type: 'line', metric: 'revenue', period: '90d' }
            },
            {
                id: 'lead-sources',
                type: 'chart',
                title: 'Lead Sources',
                position: { x: 6, y: 0, w: 6, h: 3 },
                config: { type: 'pie', metric: 'leadSources', period: '30d' }
            },
            {
                id: 'sales-pipeline',
                type: 'chart',
                title: 'Sales Pipeline',
                position: { x: 6, y: 3, w: 6, h: 3 },
                config: { type: 'funnel', metric: 'pipeline', period: '30d' }
            }
        ];

        defaultWidgets.forEach(widget => {
            this.widgets.set(widget.id, {
                ...widget,
                createdAt: new Date(),
                updatedAt: new Date()
            });
        });
    }

    // Calculate real-time metrics from existing data
    async calculateMetrics(dataSource, dateRange = '30d') {
        const cacheKey = `metrics-${dataSource}-${dateRange}`;
        const cached = this.metricsCache.get(cacheKey);

        if (cached && (Date.now() - cached.timestamp) < 300000) { // 5 minutes cache
            return cached.data;
        }

        const metrics = await this._performMetricsCalculation(dataSource, dateRange);

        this.metricsCache.set(cacheKey, {
            data: metrics,
            timestamp: Date.now()
        });

        // Store in history
        const historyKey = `${dataSource}-${dateRange}`;
        if (!this.metricsHistory.has(historyKey)) {
            this.metricsHistory.set(historyKey, []);
        }
        this.metricsHistory.get(historyKey).push({
            timestamp: new Date(),
            metrics: metrics
        });

        return metrics;
    }

    async _performMetricsCalculation(dataSource, dateRange) {
        // In a real implementation, this would query the actual data
        // For now, we'll simulate with mock data based on existing patterns
        const endDate = new Date();
        const startDate = new Date();

        switch (dateRange) {
            case '7d':
                startDate.setDate(endDate.getDate() - 7);
                break;
            case '30d':
                startDate.setDate(endDate.getDate() - 30);
                break;
            case '90d':
                startDate.setDate(endDate.getDate() - 90);
                break;
            default:
                startDate.setDate(endDate.getDate() - 30);
        }

        // Simulate metrics calculation
        const mockMetrics = this._generateMockMetrics(dataSource, startDate, endDate);
        return mockMetrics;
    }

    _generateMockMetrics(dataSource, startDate, endDate) {
        const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

        // Generate realistic mock data
        return {
            // Lead metrics
            totalLeads: Math.floor(Math.random() * 500) + 100,
            newLeads: Math.floor(Math.random() * 50) + 10,
            qualifiedLeads: Math.floor(Math.random() * 30) + 5,
            convertedLeads: Math.floor(Math.random() * 15) + 2,
            conversionRate: (Math.random() * 0.15 + 0.05).toFixed(3), // 5-20%

            // Revenue metrics
            totalRevenue: Math.floor(Math.random() * 100000) + 10000,
            avgDealValue: Math.floor(Math.random() * 5000) + 1000,
            monthlyRecurringRevenue: Math.floor(Math.random() * 20000) + 5000,

            // Campaign metrics
            totalCampaigns: Math.floor(Math.random() * 20) + 5,
            activeCampaigns: Math.floor(Math.random() * 10) + 2,
            emailsSent: Math.floor(Math.random() * 10000) + 1000,
            emailOpenRate: (Math.random() * 0.3 + 0.15).toFixed(3), // 15-45%
            emailClickRate: (Math.random() * 0.1 + 0.02).toFixed(3), // 2-12%

            // Product metrics
            totalProducts: Math.floor(Math.random() * 100) + 20,
            lowStockProducts: Math.floor(Math.random() * 10) + 1,
            topSellingProduct: `Product ${Math.floor(Math.random() * 50) + 1}`,

            // User activity metrics
            activeUsers: Math.floor(Math.random() * 20) + 5,
            totalLogins: Math.floor(Math.random() * 200) + 50,
            avgSessionDuration: Math.floor(Math.random() * 30) + 10, // minutes

            // Time series data
            leadsTrend: this._generateTrendData(daysDiff, 'leads'),
            revenueTrend: this._generateTrendData(daysDiff, 'revenue'),
            conversionTrend: this._generateTrendData(daysDiff, 'conversion'),

            // Distribution data
            leadSources: this._generateDistributionData('sources'),
            leadStatuses: this._generateDistributionData('statuses'),
            productCategories: this._generateDistributionData('categories'),

            // Funnel data
            salesFunnel: [
                { stage: 'Prospects', count: 1000, value: 500000 },
                { stage: 'Qualified', count: 300, value: 450000 },
                { stage: 'Proposal', count: 100, value: 300000 },
                { stage: 'Negotiation', count: 50, value: 200000 },
                { stage: 'Closed Won', count: 25, value: 150000 }
            ],

            lastUpdated: new Date(),
            dateRange: { startDate, endDate, daysDiff }
        };
    }

    _generateTrendData(days, type) {
        const data = [];
        for (let i = 0; i < days; i++) {
            const date = new Date();
            date.setDate(date.getDate() - (days - i - 1));

            let value;
            switch (type) {
                case 'leads':
                    value = Math.floor(Math.random() * 20) + 5;
                    break;
                case 'revenue':
                    value = Math.floor(Math.random() * 5000) + 1000;
                    break;
                case 'conversion':
                    value = (Math.random() * 0.2 + 0.05).toFixed(3);
                    break;
                default:
                    value = Math.floor(Math.random() * 100);
            }

            data.push({
                date: date.toISOString().split('T')[0],
                value: value
            });
        }
        return data;
    }

    _generateDistributionData(type) {
        const distributions = {
            sources: [
                { label: 'Website', value: Math.floor(Math.random() * 100) + 20 },
                { label: 'Referral', value: Math.floor(Math.random() * 50) + 10 },
                { label: 'Social Media', value: Math.floor(Math.random() * 80) + 15 },
                { label: 'Email Campaign', value: Math.floor(Math.random() * 60) + 12 },
                { label: 'Direct', value: Math.floor(Math.random() * 40) + 8 }
            ],
            statuses: [
                { label: 'New', value: Math.floor(Math.random() * 50) + 10 },
                { label: 'Qualified', value: Math.floor(Math.random() * 40) + 8 },
                { label: 'In Progress', value: Math.floor(Math.random() * 30) + 6 },
                { label: 'Closed Won', value: Math.floor(Math.random() * 20) + 4 },
                { label: 'Closed Lost', value: Math.floor(Math.random() * 25) + 5 }
            ],
            categories: [
                { label: 'Software', value: Math.floor(Math.random() * 80) + 20 },
                { label: 'Hardware', value: Math.floor(Math.random() * 60) + 15 },
                { label: 'Services', value: Math.floor(Math.random() * 70) + 18 },
                { label: 'Consulting', value: Math.floor(Math.random() * 50) + 12 }
            ]
        };

        return distributions[type] || [];
    }

    // Custom reports management
    async createCustomReport(reportData) {
        const reportId = crypto.randomUUID();
        const report = {
            id: reportId,
            ...reportData,
            createdAt: new Date(),
            updatedAt: new Date(),
            isDefault: false
        };

        this.customReports.set(reportId, report);
        return report;
    }

    async updateCustomReport(reportId, updates) {
        const report = this.customReports.get(reportId);
        if (!report) {
            throw new Error('Report not found');
        }

        if (report.isDefault) {
            throw new Error('Cannot modify default reports');
        }

        const updatedReport = {
            ...report,
            ...updates,
            updatedAt: new Date()
        };

        this.customReports.set(reportId, updatedReport);
        return updatedReport;
    }

    async deleteCustomReport(reportId) {
        const report = this.customReports.get(reportId);
        if (!report) {
            throw new Error('Report not found');
        }

        if (report.isDefault) {
            throw new Error('Cannot delete default reports');
        }

        return this.customReports.delete(reportId);
    }

    async getCustomReport(reportId) {
        return this.customReports.get(reportId);
    }

    async getAllCustomReports(filters = {}) {
        let reports = Array.from(this.customReports.values());

        if (filters.type) {
            reports = reports.filter(report => report.type === filters.type);
        }

        if (filters.includeDefault === false) {
            reports = reports.filter(report => !report.isDefault);
        }

        return reports.sort((a, b) => b.updatedAt - a.updatedAt);
    }

    // Dashboard widgets management
    async updateDashboardLayout(widgets) {
        widgets.forEach(widget => {
            if (this.widgets.has(widget.id)) {
                const existing = this.widgets.get(widget.id);
                this.widgets.set(widget.id, {
                    ...existing,
                    position: widget.position,
                    config: { ...existing.config, ...widget.config },
                    updatedAt: new Date()
                });
            }
        });

        return Array.from(this.widgets.values());
    }

    async getDashboardLayout() {
        return Array.from(this.widgets.values())
            .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
    }

    // Export functionality
    async exportAnalyticsData(reportId, format = 'json') {
        const report = await this.getCustomReport(reportId);
        if (!report) {
            throw new Error('Report not found');
        }

        const metrics = await this.calculateMetrics('all', `${report.dateRange}d`);
        const exportData = {
            reportInfo: report,
            metrics: metrics,
            exportedAt: new Date(),
            format: format
        };

        // In a real implementation, this would format the data appropriately
        return exportData;
    }

    // Real-time data for dashboard
    async getRealtimeMetrics() {
        const realtime = {
            activeUsers: Math.floor(Math.random() * 10) + 1,
            newLeadsToday: Math.floor(Math.random() * 15) + 2,
            dealsClosedToday: Math.floor(Math.random() * 5),
            revenueToday: Math.floor(Math.random() * 10000) + 1000,
            ongoingActivities: Math.floor(Math.random() * 25) + 5,
            timestamp: new Date()
        };

        return realtime;
    }

    // Performance metrics for system monitoring
    async getPerformanceMetrics() {
        return {
            cacheHitRatio: (Math.random() * 0.3 + 0.7).toFixed(3), // 70-100%
            avgQueryTime: Math.floor(Math.random() * 50) + 10, // 10-60ms
            memoryUsage: (Math.random() * 0.4 + 0.3).toFixed(3), // 30-70%
            cpuUsage: (Math.random() * 0.3 + 0.1).toFixed(3), // 10-40%
            totalQueries: Math.floor(Math.random() * 1000) + 100,
            errorRate: (Math.random() * 0.01).toFixed(4), // <1%
            uptime: Math.floor(Math.random() * 720) + 168, // hours
            lastOptimized: new Date(Date.now() - Math.random() * 86400000) // random time in last 24h
        };
    }
}

module.exports = new AnalyticsModel();
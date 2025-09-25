/**
 * Reports Model
 * Comprehensive reporting and analytics system for CAOS CRM
 * Module 14: Reports
 */

// Import existing modules for data aggregation
const leadData = require('../leads/leadModel');
const campaignData = require('../campaigns/campaignModel');
const productData = require('../products/productModel');
const taskData = require('../tasks/tasksModel');
const calendarData = require('../calendar/calendarModel');
const emailData = require('../email/emailModel');

// Report types and categories
const REPORT_TYPES = {
    SUMMARY: 'summary',
    DETAILED: 'detailed',
    TREND: 'trend',
    COMPARISON: 'comparison',
    FORECAST: 'forecast',
    CUSTOM: 'custom'
};

const REPORT_CATEGORIES = {
    SALES: 'sales',
    MARKETING: 'marketing',
    OPERATIONS: 'operations',
    FINANCIAL: 'financial',
    PRODUCTIVITY: 'productivity',
    CUSTOMER: 'customer'
};

const CHART_TYPES = {
    LINE: 'line',
    BAR: 'bar',
    PIE: 'pie',
    DOUGHNUT: 'doughnut',
    AREA: 'area',
    SCATTER: 'scatter',
    TABLE: 'table',
    METRIC: 'metric'
};

const EXPORT_FORMATS = {
    PDF: 'pdf',
    CSV: 'csv',
    EXCEL: 'excel',
    JSON: 'json'
};

// In-memory storage
const reports = new Map();
const reportTemplates = new Map();
const reportSchedules = new Map();
const reportHistory = new Map();
const dashboards = new Map();

// Utility functions
const generateId = () => Date.now().toString() + Math.random().toString(36).substr(2, 9);

const dateHelpers = {
    startOfDay: (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()),
    endOfDay: (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999),
    startOfWeek: (date) => {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day;
        return new Date(d.setDate(diff));
    },
    startOfMonth: (date) => new Date(date.getFullYear(), date.getMonth(), 1),
    endOfMonth: (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999),
    addDays: (date, days) => new Date(date.getTime() + (days * 24 * 60 * 60 * 1000)),
    subtractDays: (date, days) => new Date(date.getTime() - (days * 24 * 60 * 60 * 1000)),
    formatDate: (date) => date.toISOString().split('T')[0],
    getDateRange: (period) => {
        const now = new Date();
        const ranges = {
            'today': [dateHelpers.startOfDay(now), dateHelpers.endOfDay(now)],
            'yesterday': [
                dateHelpers.startOfDay(dateHelpers.subtractDays(now, 1)),
                dateHelpers.endOfDay(dateHelpers.subtractDays(now, 1))
            ],
            'this_week': [dateHelpers.startOfWeek(now), now],
            'this_month': [dateHelpers.startOfMonth(now), now],
            'last_7_days': [dateHelpers.subtractDays(now, 7), now],
            'last_30_days': [dateHelpers.subtractDays(now, 30), now],
            'last_90_days': [dateHelpers.subtractDays(now, 90), now],
            'this_year': [new Date(now.getFullYear(), 0, 1), now]
        };
        return ranges[period] || [dateHelpers.subtractDays(now, 30), now];
    }
};

// Report template structure
const createReportTemplate = () => ({
    id: null,
    name: '',
    description: '',
    type: REPORT_TYPES.SUMMARY,
    category: REPORT_CATEGORIES.SALES,
    dataSource: 'leads',
    filters: {},
    groupBy: [],
    orderBy: [],
    metrics: [],
    chartType: CHART_TYPES.BAR,
    layout: {
        showTitle: true,
        showLegend: true,
        showGrid: true,
        colors: ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6']
    },
    schedule: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null
});

// Report instance structure
const createReport = () => ({
    id: null,
    templateId: null,
    name: '',
    type: REPORT_TYPES.SUMMARY,
    category: REPORT_CATEGORIES.SALES,
    data: [],
    chartData: null,
    summary: {},
    dateRange: {
        start: null,
        end: null,
        period: 'last_30_days'
    },
    parameters: {},
    status: 'completed',
    executionTime: 0,
    generatedAt: new Date(),
    expiresAt: null,
    userId: null
});

// Dashboard structure
const createDashboard = () => ({
    id: null,
    name: '',
    description: '',
    layout: [],
    filters: {},
    isDefault: false,
    isShared: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null
});

// Data aggregation functions
const getLeadsData = (filters = {}) => {
    try {
        const { getAllLeads } = require('../leads/leadModel');
        return getAllLeads(filters);
    } catch (error) {
        console.log('Leads module not available, using sample data');
        return generateSampleLeads();
    }
};

const getCampaignsData = (filters = {}) => {
    try {
        const { getAllCampaigns } = require('../campaigns/campaignModel');
        return getAllCampaigns(filters);
    } catch (error) {
        console.log('Campaigns module not available, using sample data');
        return generateSampleCampaigns();
    }
};

const getProductsData = (filters = {}) => {
    try {
        const { getAllProducts } = require('../products/productModel');
        return getAllProducts(filters);
    } catch (error) {
        console.log('Products module not available, using sample data');
        return generateSampleProducts();
    }
};

const getTasksData = (filters = {}) => {
    try {
        const { getAllTasks } = require('../tasks/tasksModel');
        return getAllTasks(filters);
    } catch (error) {
        console.log('Tasks module not available, using sample data');
        return generateSampleTasks();
    }
};

const getEmailsData = (filters = {}) => {
    try {
        const { getAllEmails } = require('../email/emailModel');
        return getAllEmails(filters);
    } catch (error) {
        console.log('Email module not available, using sample data');
        return generateSampleEmails();
    }
};

// Report generation functions
const generateSalesReport = (filters = {}) => {
    const [startDate, endDate] = dateHelpers.getDateRange(filters.period || 'last_30_days');
    const leads = getLeadsData({
        dateFrom: startDate,
        dateTo: endDate,
        ...filters
    });

    const summary = {
        totalLeads: leads.length,
        qualifiedLeads: leads.filter(l => l.status === 'qualified').length,
        convertedLeads: leads.filter(l => l.status === 'customer').length,
        totalValue: leads.reduce((sum, l) => sum + (l.value || 0), 0),
        avgDealSize: leads.length > 0 ? leads.reduce((sum, l) => sum + (l.value || 0), 0) / leads.length : 0,
        conversionRate: leads.length > 0 ? (leads.filter(l => l.status === 'customer').length / leads.length * 100).toFixed(2) : 0
    };

    const chartData = {
        labels: ['New', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Customer'],
        datasets: [{
            label: 'Lead Count',
            data: [
                leads.filter(l => l.status === 'new').length,
                leads.filter(l => l.status === 'contacted').length,
                leads.filter(l => l.status === 'qualified').length,
                leads.filter(l => l.status === 'proposal').length,
                leads.filter(l => l.status === 'negotiation').length,
                leads.filter(l => l.status === 'customer').length
            ],
            backgroundColor: ['#EF4444', '#F59E0B', '#3B82F6', '#8B5CF6', '#10B981', '#059669']
        }]
    };

    return {
        data: leads,
        summary,
        chartData,
        type: CHART_TYPES.BAR
    };
};

const generateMarketingReport = (filters = {}) => {
    const [startDate, endDate] = dateHelpers.getDateRange(filters.period || 'last_30_days');
    const campaigns = getCampaignsData({
        dateFrom: startDate,
        dateTo: endDate,
        ...filters
    });
    const emails = getEmailsData({
        dateFrom: startDate,
        dateTo: endDate,
        ...filters
    });

    const summary = {
        totalCampaigns: campaigns.length,
        activeCampaigns: campaigns.filter(c => c.status === 'active').length,
        totalEmails: emails.length,
        emailsSent: emails.filter(e => e.status === 'sent').length,
        emailsOpened: emails.filter(e => e.deliveryStatus && e.deliveryStatus.opened).length,
        clickRate: emails.length > 0 ? (emails.filter(e => e.deliveryStatus && e.deliveryStatus.clicked).length / emails.length * 100).toFixed(2) : 0
    };

    const chartData = {
        labels: ['Sent', 'Delivered', 'Opened', 'Clicked'],
        datasets: [{
            label: 'Email Performance',
            data: [
                emails.filter(e => e.status === 'sent').length,
                emails.filter(e => e.deliveryStatus && e.deliveryStatus.delivered).length,
                emails.filter(e => e.deliveryStatus && e.deliveryStatus.opened).length,
                emails.filter(e => e.deliveryStatus && e.deliveryStatus.clicked).length
            ],
            backgroundColor: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444']
        }]
    };

    return {
        data: { campaigns, emails },
        summary,
        chartData,
        type: CHART_TYPES.LINE
    };
};

const generateProductivityReport = (filters = {}) => {
    const [startDate, endDate] = dateHelpers.getDateRange(filters.period || 'last_7_days');
    const tasks = getTasksData({
        dateFrom: startDate,
        dateTo: endDate,
        ...filters
    });

    const summary = {
        totalTasks: tasks.length,
        completedTasks: tasks.filter(t => t.status === 'completed').length,
        inProgressTasks: tasks.filter(t => t.status === 'in_progress').length,
        overdueTasks: tasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'completed').length,
        completionRate: tasks.length > 0 ? (tasks.filter(t => t.status === 'completed').length / tasks.length * 100).toFixed(2) : 0,
        avgCompletionTime: calculateAvgCompletionTime(tasks.filter(t => t.status === 'completed'))
    };

    const chartData = {
        labels: ['To Do', 'In Progress', 'Completed', 'Overdue'],
        datasets: [{
            label: 'Task Status',
            data: [
                tasks.filter(t => t.status === 'todo').length,
                tasks.filter(t => t.status === 'in_progress').length,
                tasks.filter(t => t.status === 'completed').length,
                summary.overdueTasks
            ],
            backgroundColor: ['#6B7280', '#F59E0B', '#10B981', '#EF4444']
        }]
    };

    return {
        data: tasks,
        summary,
        chartData,
        type: CHART_TYPES.DOUGHNUT
    };
};

const generateTrendReport = (filters = {}) => {
    const period = filters.period || 'last_30_days';
    const [startDate, endDate] = dateHelpers.getDateRange(period);

    // Generate daily data points
    const days = [];
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
        days.push(new Date(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
    }

    const leads = getLeadsData({ dateFrom: startDate, dateTo: endDate });
    const emails = getEmailsData({ dateFrom: startDate, dateTo: endDate });
    const tasks = getTasksData({ dateFrom: startDate, dateTo: endDate });

    const chartData = {
        labels: days.map(d => dateHelpers.formatDate(d)),
        datasets: [
            {
                label: 'New Leads',
                data: days.map(day => {
                    const dayStart = dateHelpers.startOfDay(day);
                    const dayEnd = dateHelpers.endOfDay(day);
                    return leads.filter(l => {
                        const createdAt = new Date(l.createdAt);
                        return createdAt >= dayStart && createdAt <= dayEnd;
                    }).length;
                }),
                borderColor: '#3B82F6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)'
            },
            {
                label: 'Emails Sent',
                data: days.map(day => {
                    const dayStart = dateHelpers.startOfDay(day);
                    const dayEnd = dateHelpers.endOfDay(day);
                    return emails.filter(e => {
                        const sentAt = new Date(e.sentAt || e.createdAt);
                        return sentAt >= dayStart && sentAt <= dayEnd && e.status === 'sent';
                    }).length;
                }),
                borderColor: '#10B981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)'
            },
            {
                label: 'Tasks Completed',
                data: days.map(day => {
                    const dayStart = dateHelpers.startOfDay(day);
                    const dayEnd = dateHelpers.endOfDay(day);
                    return tasks.filter(t => {
                        const completedAt = new Date(t.completedAt || t.updatedAt);
                        return completedAt >= dayStart && completedAt <= dayEnd && t.status === 'completed';
                    }).length;
                }),
                borderColor: '#F59E0B',
                backgroundColor: 'rgba(245, 158, 11, 0.1)'
            }
        ]
    };

    return {
        data: { leads, emails, tasks },
        chartData,
        type: CHART_TYPES.LINE
    };
};

// Helper functions
const calculateAvgCompletionTime = (completedTasks) => {
    if (completedTasks.length === 0) return 0;

    const totalTime = completedTasks.reduce((sum, task) => {
        const created = new Date(task.createdAt);
        const completed = new Date(task.completedAt || task.updatedAt);
        return sum + (completed - created);
    }, 0);

    const avgMilliseconds = totalTime / completedTasks.length;
    const avgHours = Math.round(avgMilliseconds / (1000 * 60 * 60));
    return avgHours;
};

// Report operations
const saveReportTemplate = (templateData) => {
    const template = { ...createReportTemplate(), ...templateData };
    template.id = generateId();
    template.createdAt = new Date();
    template.updatedAt = new Date();

    if (!template.name || !template.dataSource) {
        throw new Error('Report template must have name and data source');
    }

    reportTemplates.set(template.id, template);
    return template;
};

const generateReport = (templateId, parameters = {}) => {
    const template = reportTemplates.get(templateId);
    if (!template) {
        throw new Error('Report template not found');
    }

    const startTime = Date.now();
    const report = { ...createReport() };
    report.id = generateId();
    report.templateId = templateId;
    report.name = template.name;
    report.type = template.type;
    report.category = template.category;
    report.parameters = parameters;

    // Generate report data based on category
    let reportData;
    switch (template.category) {
        case REPORT_CATEGORIES.SALES:
            reportData = generateSalesReport({ ...template.filters, ...parameters });
            break;
        case REPORT_CATEGORIES.MARKETING:
            reportData = generateMarketingReport({ ...template.filters, ...parameters });
            break;
        case REPORT_CATEGORIES.PRODUCTIVITY:
            reportData = generateProductivityReport({ ...template.filters, ...parameters });
            break;
        default:
            reportData = generateTrendReport({ ...template.filters, ...parameters });
    }

    report.data = reportData.data;
    report.chartData = reportData.chartData;
    report.summary = reportData.summary;
    report.executionTime = Date.now() - startTime;
    report.generatedAt = new Date();
    report.expiresAt = new Date(Date.now() + (24 * 60 * 60 * 1000)); // 24 hours

    reports.set(report.id, report);
    return report;
};

const getAllReportTemplates = (filters = {}) => {
    let templates = Array.from(reportTemplates.values());

    if (filters.category) {
        templates = templates.filter(t => t.category === filters.category);
    }

    if (filters.type) {
        templates = templates.filter(t => t.type === filters.type);
    }

    if (filters.isActive !== undefined) {
        templates = templates.filter(t => t.isActive === filters.isActive);
    }

    return templates.sort((a, b) => a.name.localeCompare(b.name));
};

const getAllReports = (filters = {}) => {
    let reportList = Array.from(reports.values());

    if (filters.category) {
        reportList = reportList.filter(r => r.category === filters.category);
    }

    if (filters.userId) {
        reportList = reportList.filter(r => r.userId === filters.userId);
    }

    if (filters.dateFrom) {
        const fromDate = new Date(filters.dateFrom);
        reportList = reportList.filter(r => new Date(r.generatedAt) >= fromDate);
    }

    return reportList.sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));
};

// Dashboard operations
const saveDashboard = (dashboardData) => {
    const dashboard = { ...createDashboard(), ...dashboardData };
    dashboard.id = generateId();
    dashboard.createdAt = new Date();
    dashboard.updatedAt = new Date();

    if (!dashboard.name) {
        throw new Error('Dashboard must have a name');
    }

    dashboards.set(dashboard.id, dashboard);
    return dashboard;
};

const getDashboardById = (id) => {
    return dashboards.get(id) || null;
};

const getAllDashboards = () => {
    return Array.from(dashboards.values()).sort((a, b) => a.name.localeCompare(b.name));
};

// Sample data generators
const generateSampleLeads = () => {
    const statuses = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'customer'];
    const sources = ['website', 'referral', 'social', 'email', 'cold_call'];

    return Array.from({ length: 50 }, (_, i) => ({
        id: `lead_${i}`,
        name: `Lead ${i + 1}`,
        email: `lead${i + 1}@example.com`,
        status: statuses[Math.floor(Math.random() * statuses.length)],
        source: sources[Math.floor(Math.random() * sources.length)],
        value: Math.floor(Math.random() * 50000) + 5000,
        createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        updatedAt: new Date()
    }));
};

const generateSampleCampaigns = () => {
    return Array.from({ length: 10 }, (_, i) => ({
        id: `campaign_${i}`,
        name: `Campaign ${i + 1}`,
        status: Math.random() > 0.5 ? 'active' : 'completed',
        type: 'email',
        createdAt: new Date(Date.now() - Math.random() * 60 * 24 * 60 * 60 * 1000),
        recipients: Math.floor(Math.random() * 1000) + 100
    }));
};

const generateSampleEmails = () => {
    return Array.from({ length: 100 }, (_, i) => ({
        id: `email_${i}`,
        subject: `Email ${i + 1}`,
        status: Math.random() > 0.3 ? 'sent' : 'draft',
        createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        sentAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        deliveryStatus: {
            delivered: Math.random() > 0.1,
            opened: Math.random() > 0.4,
            clicked: Math.random() > 0.7
        }
    }));
};

const generateSampleTasks = () => {
    const statuses = ['todo', 'in_progress', 'completed'];

    return Array.from({ length: 30 }, (_, i) => ({
        id: `task_${i}`,
        title: `Task ${i + 1}`,
        status: statuses[Math.floor(Math.random() * statuses.length)],
        createdAt: new Date(Date.now() - Math.random() * 14 * 24 * 60 * 60 * 1000),
        dueDate: new Date(Date.now() + Math.random() * 14 * 24 * 60 * 60 * 1000),
        completedAt: Math.random() > 0.5 ? new Date() : null
    }));
};

const generateSampleProducts = () => {
    return Array.from({ length: 20 }, (_, i) => ({
        id: `product_${i}`,
        name: `Product ${i + 1}`,
        category: ['Software', 'Hardware', 'Service'][Math.floor(Math.random() * 3)],
        price: Math.floor(Math.random() * 1000) + 100,
        stock: Math.floor(Math.random() * 100),
        createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000)
    }));
};

// Initialize default templates
const initializeDefaultTemplates = () => {
    const defaultTemplates = [
        {
            name: 'Sales Pipeline Report',
            description: 'Comprehensive sales pipeline analysis',
            type: REPORT_TYPES.SUMMARY,
            category: REPORT_CATEGORIES.SALES,
            dataSource: 'leads',
            chartType: CHART_TYPES.BAR,
            metrics: ['count', 'value', 'conversion_rate']
        },
        {
            name: 'Marketing Performance',
            description: 'Campaign and email marketing metrics',
            type: REPORT_TYPES.DETAILED,
            category: REPORT_CATEGORIES.MARKETING,
            dataSource: 'campaigns',
            chartType: CHART_TYPES.LINE,
            metrics: ['sent', 'opened', 'clicked', 'converted']
        },
        {
            name: 'Team Productivity',
            description: 'Task completion and productivity metrics',
            type: REPORT_TYPES.SUMMARY,
            category: REPORT_CATEGORIES.PRODUCTIVITY,
            dataSource: 'tasks',
            chartType: CHART_TYPES.DOUGHNUT,
            metrics: ['completed', 'in_progress', 'overdue']
        },
        {
            name: 'Activity Trends',
            description: '30-day activity and engagement trends',
            type: REPORT_TYPES.TREND,
            category: REPORT_CATEGORIES.OPERATIONS,
            dataSource: 'multiple',
            chartType: CHART_TYPES.AREA,
            metrics: ['leads', 'emails', 'tasks']
        }
    ];

    defaultTemplates.forEach(template => {
        createReportTemplate(template);
    });
};

// Initialize system
initializeDefaultTemplates();

module.exports = {
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
};
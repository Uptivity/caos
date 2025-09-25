// Settings Model - In-memory storage for CRM configuration
const crypto = require('crypto');

class SettingsModel {
    constructor() {
        // User preferences storage
        this.userPreferences = new Map();

        // System configuration
        this.systemConfig = {
            companyInfo: {
                name: 'CAOS Corporation',
                address: '',
                phone: '',
                email: 'info@caos.com',
                website: 'https://www.caos.com',
                logo: '',
                timezone: 'UTC',
                dateFormat: 'MM/DD/YYYY',
                timeFormat: '12h',
                currency: 'USD',
                fiscalYearStart: '01-01'
            },
            emailSettings: {
                provider: 'smtp',
                host: '',
                port: 587,
                secure: false,
                auth: {
                    user: '',
                    pass: ''
                },
                from: {
                    name: 'CAOS CRM',
                    email: 'noreply@caos.com'
                },
                replyTo: '',
                templates: {
                    welcome: {
                        subject: 'Welcome to CAOS CRM',
                        body: 'Welcome {{name}}! We are excited to have you on board.'
                    },
                    passwordReset: {
                        subject: 'Password Reset Request',
                        body: 'Click here to reset your password: {{link}}'
                    },
                    leadAssignment: {
                        subject: 'New Lead Assigned: {{leadName}}',
                        body: 'You have been assigned a new lead: {{leadName}}'
                    },
                    campaignInvitation: {
                        subject: 'You are invited to: {{campaignName}}',
                        body: 'Join our campaign: {{campaignName}}'
                    }
                }
            },
            customFields: {
                leads: [],
                contacts: [],
                deals: [],
                accounts: []
            },
            roles: [
                {
                    id: 'admin',
                    name: 'Administrator',
                    description: 'Full system access',
                    permissions: ['*']
                },
                {
                    id: 'sales_manager',
                    name: 'Sales Manager',
                    description: 'Manage sales team and pipeline',
                    permissions: [
                        'leads.*',
                        'deals.*',
                        'contacts.*',
                        'campaigns.view',
                        'reports.*',
                        'team.manage'
                    ]
                },
                {
                    id: 'sales_rep',
                    name: 'Sales Representative',
                    description: 'Manage own leads and deals',
                    permissions: [
                        'leads.view',
                        'leads.create',
                        'leads.update.own',
                        'leads.delete.own',
                        'deals.view',
                        'deals.create',
                        'deals.update.own',
                        'contacts.view',
                        'contacts.create'
                    ]
                },
                {
                    id: 'marketing',
                    name: 'Marketing User',
                    description: 'Manage campaigns and marketing activities',
                    permissions: [
                        'campaigns.*',
                        'leads.view',
                        'leads.create',
                        'contacts.view',
                        'reports.marketing'
                    ]
                },
                {
                    id: 'viewer',
                    name: 'Viewer',
                    description: 'Read-only access',
                    permissions: [
                        '*.view'
                    ]
                }
            ],
            integrations: {
                google: {
                    enabled: false,
                    clientId: '',
                    clientSecret: '',
                    redirectUri: '',
                    scopes: ['calendar', 'contacts']
                },
                microsoft: {
                    enabled: false,
                    tenantId: '',
                    clientId: '',
                    clientSecret: '',
                    redirectUri: ''
                },
                slack: {
                    enabled: false,
                    webhookUrl: '',
                    channel: '#sales',
                    notifications: ['new_lead', 'deal_won', 'task_overdue']
                },
                zapier: {
                    enabled: false,
                    apiKey: '',
                    webhooks: []
                },
                mailchimp: {
                    enabled: false,
                    apiKey: '',
                    listId: ''
                }
            },
            features: {
                leadScoring: {
                    enabled: true,
                    algorithm: 'engagement',
                    factors: {
                        emailOpen: 5,
                        emailClick: 10,
                        websiteVisit: 3,
                        formSubmission: 20,
                        phoneCall: 15,
                        meeting: 30
                    }
                },
                automation: {
                    enabled: true,
                    rules: []
                },
                multiLanguage: {
                    enabled: false,
                    defaultLanguage: 'en',
                    supportedLanguages: ['en']
                },
                twoFactorAuth: {
                    enabled: false,
                    enforced: false,
                    methods: ['totp', 'sms']
                },
                apiAccess: {
                    enabled: true,
                    rateLimit: 1000,
                    allowedOrigins: ['*']
                },
                dataRetention: {
                    enabled: false,
                    deletedItemsRetention: 30,
                    activityLogRetention: 365,
                    emailArchiveRetention: 730
                }
            },
            notifications: {
                email: {
                    enabled: true,
                    frequency: 'instant',
                    types: ['lead_assignment', 'task_due', 'deal_won', 'mention']
                },
                inApp: {
                    enabled: true,
                    sound: true,
                    desktop: false,
                    types: ['all']
                },
                mobile: {
                    enabled: false,
                    pushNotifications: false
                }
            },
            backup: {
                autoBackup: {
                    enabled: false,
                    frequency: 'daily',
                    time: '02:00',
                    retention: 30
                },
                exportFormats: ['csv', 'json', 'xlsx'],
                lastBackup: null,
                backupHistory: []
            }
        };

        // Audit log
        this.auditLog = [];

        // Default user preferences template
        this.defaultUserPreferences = {
            theme: 'light',
            language: 'en',
            timezone: 'UTC',
            dateFormat: 'MM/DD/YYYY',
            timeFormat: '12h',
            currency: 'USD',
            notifications: {
                email: true,
                desktop: false,
                mobile: false,
                frequency: 'instant'
            },
            display: {
                itemsPerPage: 25,
                defaultView: 'grid',
                sidebarCollapsed: false,
                compactMode: false,
                showAvatars: true,
                colorBlindMode: false
            },
            dashboard: {
                widgets: ['metrics', 'activities', 'tasks', 'chart'],
                refreshInterval: 30,
                defaultPeriod: 'month'
            },
            leads: {
                defaultView: 'table',
                defaultSort: 'created_desc',
                showScore: true,
                autoAssign: false
            },
            communication: {
                emailSignature: '',
                defaultReplyBehavior: 'reply',
                autoSaveInterval: 30,
                spellCheck: true
            },
            accessibility: {
                highContrast: false,
                reducedMotion: false,
                fontSize: 'normal',
                keyboardShortcuts: true
            },
            privacy: {
                activityTracking: true,
                shareDataForImprovement: false,
                showOnlineStatus: true
            }
        };
    }

    // User Preferences Methods
    getUserPreferences(userId) {
        if (!this.userPreferences.has(userId)) {
            this.userPreferences.set(userId, JSON.parse(JSON.stringify(this.defaultUserPreferences)));
        }
        return this.userPreferences.get(userId);
    }

    updateUserPreferences(userId, updates) {
        const preferences = this.getUserPreferences(userId);
        this.deepMerge(preferences, updates);
        this.userPreferences.set(userId, preferences);
        this.addAuditLog(userId, 'user_preferences_updated', updates);
        return preferences;
    }

    resetUserPreferences(userId) {
        this.userPreferences.set(userId, JSON.parse(JSON.stringify(this.defaultUserPreferences)));
        this.addAuditLog(userId, 'user_preferences_reset', {});
        return this.userPreferences.get(userId);
    }

    // System Configuration Methods
    getSystemConfig(category = null) {
        if (category && this.systemConfig[category]) {
            return this.systemConfig[category];
        }
        return this.systemConfig;
    }

    updateSystemConfig(category, updates, userId) {
        if (!this.systemConfig[category]) {
            throw new Error(`Invalid configuration category: ${category}`);
        }

        this.deepMerge(this.systemConfig[category], updates);
        this.addAuditLog(userId, 'system_config_updated', { category, updates });
        return this.systemConfig[category];
    }

    // Custom Fields Methods
    addCustomField(entity, field, userId) {
        if (!this.systemConfig.customFields[entity]) {
            throw new Error(`Invalid entity type: ${entity}`);
        }

        const fieldId = this.generateId();
        const customField = {
            id: fieldId,
            name: field.name,
            label: field.label,
            type: field.type || 'text',
            required: field.required || false,
            options: field.options || [],
            defaultValue: field.defaultValue || '',
            validation: field.validation || null,
            createdBy: userId,
            createdAt: new Date()
        };

        this.systemConfig.customFields[entity].push(customField);
        this.addAuditLog(userId, 'custom_field_added', { entity, field: customField });
        return customField;
    }

    updateCustomField(entity, fieldId, updates, userId) {
        const fields = this.systemConfig.customFields[entity];
        const fieldIndex = fields.findIndex(f => f.id === fieldId);

        if (fieldIndex === -1) {
            throw new Error('Custom field not found');
        }

        Object.assign(fields[fieldIndex], updates);
        this.addAuditLog(userId, 'custom_field_updated', { entity, fieldId, updates });
        return fields[fieldIndex];
    }

    deleteCustomField(entity, fieldId, userId) {
        const fields = this.systemConfig.customFields[entity];
        const fieldIndex = fields.findIndex(f => f.id === fieldId);

        if (fieldIndex === -1) {
            throw new Error('Custom field not found');
        }

        const deleted = fields.splice(fieldIndex, 1)[0];
        this.addAuditLog(userId, 'custom_field_deleted', { entity, field: deleted });
        return deleted;
    }

    // Role Management Methods
    addRole(role, userId) {
        const roleId = this.generateId();
        const newRole = {
            id: roleId,
            name: role.name,
            description: role.description,
            permissions: role.permissions || [],
            createdBy: userId,
            createdAt: new Date()
        };

        this.systemConfig.roles.push(newRole);
        this.addAuditLog(userId, 'role_added', newRole);
        return newRole;
    }

    updateRole(roleId, updates, userId) {
        const roleIndex = this.systemConfig.roles.findIndex(r => r.id === roleId);

        if (roleIndex === -1) {
            throw new Error('Role not found');
        }

        // Prevent modification of admin role
        if (this.systemConfig.roles[roleIndex].id === 'admin') {
            throw new Error('Cannot modify administrator role');
        }

        Object.assign(this.systemConfig.roles[roleIndex], updates);
        this.addAuditLog(userId, 'role_updated', { roleId, updates });
        return this.systemConfig.roles[roleIndex];
    }

    deleteRole(roleId, userId) {
        const roleIndex = this.systemConfig.roles.findIndex(r => r.id === roleId);

        if (roleIndex === -1) {
            throw new Error('Role not found');
        }

        // Prevent deletion of system roles
        if (['admin', 'sales_manager', 'sales_rep'].includes(this.systemConfig.roles[roleIndex].id)) {
            throw new Error('Cannot delete system roles');
        }

        const deleted = this.systemConfig.roles.splice(roleIndex, 1)[0];
        this.addAuditLog(userId, 'role_deleted', deleted);
        return deleted;
    }

    // Email Template Methods
    getEmailTemplates() {
        return this.systemConfig.emailSettings.templates;
    }

    updateEmailTemplate(templateKey, updates, userId) {
        if (!this.systemConfig.emailSettings.templates[templateKey]) {
            throw new Error(`Invalid template key: ${templateKey}`);
        }

        Object.assign(this.systemConfig.emailSettings.templates[templateKey], updates);
        this.addAuditLog(userId, 'email_template_updated', { templateKey, updates });
        return this.systemConfig.emailSettings.templates[templateKey];
    }

    addEmailTemplate(key, template, userId) {
        this.systemConfig.emailSettings.templates[key] = {
            subject: template.subject,
            body: template.body,
            createdBy: userId,
            createdAt: new Date()
        };

        this.addAuditLog(userId, 'email_template_added', { key, template });
        return this.systemConfig.emailSettings.templates[key];
    }

    // Integration Methods
    updateIntegration(integration, config, userId) {
        if (!this.systemConfig.integrations[integration]) {
            throw new Error(`Invalid integration: ${integration}`);
        }

        Object.assign(this.systemConfig.integrations[integration], config);
        this.addAuditLog(userId, 'integration_updated', { integration, config });
        return this.systemConfig.integrations[integration];
    }

    testIntegration(integration) {
        // Simulate integration testing
        const config = this.systemConfig.integrations[integration];

        if (!config || !config.enabled) {
            return { success: false, message: 'Integration not configured or disabled' };
        }

        // Simulate different test results
        const testResults = {
            google: { success: true, message: 'Successfully connected to Google Workspace' },
            microsoft: { success: true, message: 'Successfully connected to Microsoft 365' },
            slack: { success: true, message: 'Successfully posted test message to Slack' },
            zapier: { success: true, message: 'Successfully validated Zapier webhook' },
            mailchimp: { success: true, message: 'Successfully connected to Mailchimp' }
        };

        return testResults[integration] || { success: false, message: 'Integration test failed' };
    }

    // Backup & Export Methods
    exportSettings(format = 'json', userId) {
        const exportData = {
            systemConfig: this.systemConfig,
            userPreferences: Array.from(this.userPreferences.entries()).map(([userId, prefs]) => ({
                userId,
                preferences: prefs
            })),
            exportedAt: new Date(),
            exportedBy: userId,
            version: '1.0.0'
        };

        this.addAuditLog(userId, 'settings_exported', { format });

        switch (format) {
            case 'json':
                return JSON.stringify(exportData, null, 2);
            case 'csv':
                // Simplified CSV export for demo
                return this.convertToCSV(exportData);
            default:
                return exportData;
        }
    }

    importSettings(data, format = 'json', userId) {
        try {
            let importData;

            if (format === 'json') {
                importData = typeof data === 'string' ? JSON.parse(data) : data;
            } else {
                throw new Error('Unsupported import format');
            }

            // Validate import data structure
            if (!importData.systemConfig || !importData.userPreferences) {
                throw new Error('Invalid import data structure');
            }

            // Backup current settings
            const backup = {
                systemConfig: JSON.parse(JSON.stringify(this.systemConfig)),
                userPreferences: new Map(this.userPreferences)
            };

            // Apply imported settings
            this.systemConfig = importData.systemConfig;
            this.userPreferences = new Map(
                importData.userPreferences.map(item => [item.userId, item.preferences])
            );

            this.addAuditLog(userId, 'settings_imported', { format });

            return {
                success: true,
                message: 'Settings imported successfully',
                backup
            };
        } catch (error) {
            throw new Error(`Import failed: ${error.message}`);
        }
    }

    createBackup(userId) {
        const backup = {
            id: this.generateId(),
            timestamp: new Date(),
            createdBy: userId,
            data: {
                systemConfig: JSON.parse(JSON.stringify(this.systemConfig)),
                userPreferences: Array.from(this.userPreferences.entries())
            },
            size: JSON.stringify(this.systemConfig).length + JSON.stringify(Array.from(this.userPreferences.entries())).length
        };

        this.systemConfig.backup.backupHistory.unshift(backup);

        // Keep only last 10 backups
        if (this.systemConfig.backup.backupHistory.length > 10) {
            this.systemConfig.backup.backupHistory = this.systemConfig.backup.backupHistory.slice(0, 10);
        }

        this.systemConfig.backup.lastBackup = backup.timestamp;
        this.addAuditLog(userId, 'backup_created', { backupId: backup.id });

        return backup;
    }

    restoreBackup(backupId, userId) {
        const backup = this.systemConfig.backup.backupHistory.find(b => b.id === backupId);

        if (!backup) {
            throw new Error('Backup not found');
        }

        // Restore settings
        this.systemConfig = backup.data.systemConfig;
        this.userPreferences = new Map(backup.data.userPreferences);

        this.addAuditLog(userId, 'backup_restored', { backupId });

        return {
            success: true,
            message: `Settings restored from backup dated ${backup.timestamp}`
        };
    }

    // Audit Log Methods
    getAuditLog(filters = {}) {
        let logs = [...this.auditLog];

        if (filters.userId) {
            logs = logs.filter(log => log.userId === filters.userId);
        }

        if (filters.action) {
            logs = logs.filter(log => log.action === filters.action);
        }

        if (filters.startDate) {
            logs = logs.filter(log => new Date(log.timestamp) >= new Date(filters.startDate));
        }

        if (filters.endDate) {
            logs = logs.filter(log => new Date(log.timestamp) <= new Date(filters.endDate));
        }

        return logs;
    }

    // Helper Methods
    generateId() {
        return crypto.randomBytes(16).toString('hex');
    }

    deepMerge(target, source) {
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                if (!target[key]) {
                    target[key] = {};
                }
                this.deepMerge(target[key], source[key]);
            } else {
                target[key] = source[key];
            }
        }
        return target;
    }

    addAuditLog(userId, action, details) {
        this.auditLog.unshift({
            id: this.generateId(),
            userId,
            action,
            details,
            timestamp: new Date(),
            ip: '127.0.0.1' // Would be actual IP in production
        });

        // Keep only last 1000 audit entries
        if (this.auditLog.length > 1000) {
            this.auditLog = this.auditLog.slice(0, 1000);
        }
    }

    convertToCSV(data) {
        // Simplified CSV conversion for demo
        const rows = [];
        rows.push(['Setting Category', 'Key', 'Value']);

        for (const [category, settings] of Object.entries(data.systemConfig)) {
            for (const [key, value] of Object.entries(settings)) {
                rows.push([category, key, JSON.stringify(value)]);
            }
        }

        return rows.map(row => row.join(',')).join('\n');
    }

    // Search settings
    searchSettings(query) {
        const results = [];
        const searchTerm = query.toLowerCase();

        // Search in system config
        const searchObject = (obj, path = '') => {
            for (const [key, value] of Object.entries(obj)) {
                const currentPath = path ? `${path}.${key}` : key;

                if (key.toLowerCase().includes(searchTerm)) {
                    results.push({
                        type: 'config',
                        path: currentPath,
                        key,
                        value
                    });
                }

                if (value && typeof value === 'object' && !Array.isArray(value)) {
                    searchObject(value, currentPath);
                }
            }
        };

        searchObject(this.systemConfig);

        return results;
    }
}

module.exports = new SettingsModel();
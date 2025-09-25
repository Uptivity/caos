// Lead Model - MySQL implementation for production
// Module 06: Leads Management

const LeadsService = require('../services/LeadsService');
const { logger } = require('../utils/logger');

// Initialize LeadsService
LeadsService.initialize().catch(error => {
    logger.error('CRITICAL: Failed to initialize LeadsService', {
        error: error.message,
        stack: error.stack,
        service: 'LeadsService',
        critical: true
    });
});

// Lead status enum
const LEAD_STATUS = {
    NEW: 'new',
    CONTACTED: 'contacted',
    QUALIFIED: 'qualified',
    PROPOSAL: 'proposal',
    CONVERTED: 'converted',
    LOST: 'lost',
    NURTURING: 'nurturing'
};

// Lead priority enum
const LEAD_PRIORITY = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high'
};

// Activity types
const ACTIVITY_TYPES = {
    EMAIL: 'email',
    CALL: 'call',
    MEETING: 'meeting',
    DEMO: 'demo',
    PROPOSAL: 'proposal',
    FOLLOW_UP: 'follow_up',
    NOTE: 'note',
    STATUS_CHANGE: 'status_change'
};

// Lead scoring rules
const scoringRules = {
    companySize: {
        '1-10': 10,
        '11-50': 25,
        '51-200': 40,
        '201-1000': 35,
        '1000+': 50
    },
    source: {
        'website': 20,
        'referral': 35,
        'campaign': 25,
        'cold-outreach': 15,
        'trade-show': 30
    },
    industry: {
        'Technology': 30,
        'Healthcare': 25,
        'Finance': 35,
        'Manufacturing': 20,
        'Education': 15,
        'Retail': 20,
        'Services': 25
    }
};

// Calculate lead score
function calculateLeadScore(leadData) {
    let score = 0;

    // Company size scoring
    if (leadData.company_size && scoringRules.companySize[leadData.company_size]) {
        score += scoringRules.companySize[leadData.company_size];
    }

    // Source scoring
    if (leadData.source && scoringRules.source[leadData.source]) {
        score += scoringRules.source[leadData.source];
    }

    // Industry scoring
    if (leadData.industry && scoringRules.industry[leadData.industry]) {
        score += scoringRules.industry[leadData.industry];
    }

    // Activity bonus (will be calculated based on positive activities)
    const activities = leadActivities.get(leadData.id) || [];
    const positiveActivities = activities.filter(a => a.outcome === 'positive').length;
    score += Math.min(20, positiveActivities * 3);

    // Ensure score is within bounds
    return Math.max(0, Math.min(100, score));
}

// Lead model class
class Lead {
    constructor(data) {
        this.id = crypto.randomUUID();
        this.name = data.name;
        this.email = data.email;
        this.phone = data.phone || null;
        this.company = data.company || null;
        this.title = data.title || null;
        this.industry = data.industry || null;
        this.company_size = data.company_size || null;

        this.status = data.status || LEAD_STATUS.NEW;
        this.priority = data.priority || LEAD_PRIORITY.MEDIUM;
        this.source = data.source || null;

        this.city = data.city || null;
        this.state = data.state || null;
        this.country = data.country || 'USA';

        this.assigned_to = data.assigned_to || null;
        this.assigned_date = data.assigned_to ? new Date().toISOString() : null;

        this.estimated_value = data.estimated_value || 0;
        this.expected_close_date = data.expected_close_date || null;

        this.created_at = new Date().toISOString();
        this.updated_at = new Date().toISOString();
        this.created_by = data.created_by || null;
        this.last_activity_at = null;

        this.deleted_at = null;

        // Calculate initial score
        this.score = calculateLeadScore(this);
    }

    update(updates) {
        // Track status changes for activity logging
        const oldStatus = this.status;

        Object.keys(updates).forEach(key => {
            if (key !== 'id' && key !== 'created_at' && key !== 'created_by') {
                this[key] = updates[key];
            }
        });

        this.updated_at = new Date().toISOString();

        // Recalculate score
        this.score = calculateLeadScore(this);

        // Log status change as activity
        if (oldStatus !== this.status) {
            this.logStatusChange(oldStatus, this.status);
        }

        return this;
    }

    logStatusChange(oldStatus, newStatus) {
        const activity = {
            id: crypto.randomUUID(),
            lead_id: this.id,
            type: ACTIVITY_TYPES.STATUS_CHANGE,
            subject: `Status changed from ${oldStatus} to ${newStatus}`,
            description: 'Lead status automatically updated',
            completed_at: new Date().toISOString(),
            created_at: new Date().toISOString()
        };

        const activities = leadActivities.get(this.id) || [];
        activities.push(activity);
        leadActivities.set(this.id, activities);

        this.last_activity_at = activity.created_at;
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            email: this.email,
            phone: this.phone,
            company: this.company,
            title: this.title,
            industry: this.industry,
            company_size: this.company_size,
            status: this.status,
            priority: this.priority,
            score: this.score,
            source: this.source,
            city: this.city,
            state: this.state,
            country: this.country,
            assigned_to: this.assigned_to,
            assigned_date: this.assigned_date,
            estimated_value: this.estimated_value,
            expected_close_date: this.expected_close_date,
            created_at: this.created_at,
            updated_at: this.updated_at,
            created_by: this.created_by,
            last_activity_at: this.last_activity_at
        };
    }
}

// Lead Activity class
class LeadActivity {
    constructor(leadId, data) {
        this.id = crypto.randomUUID();
        this.lead_id = leadId;
        this.user_id = data.user_id;
        this.type = data.type;
        this.subject = data.subject;
        this.description = data.description || null;
        this.outcome = data.outcome || 'neutral';
        this.scheduled_at = data.scheduled_at || null;
        this.completed_at = data.completed_at || new Date().toISOString();
        this.duration_minutes = data.duration_minutes || null;
        this.next_action = data.next_action || null;
        this.next_action_date = data.next_action_date || null;
        this.contact_method = data.contact_method || null;
        this.created_at = new Date().toISOString();
        this.updated_at = new Date().toISOString();
    }
}

// Lead Note class
class LeadNote {
    constructor(leadId, data) {
        this.id = crypto.randomUUID();
        this.lead_id = leadId;
        this.user_id = data.user_id;
        this.content = data.content;
        this.is_private = data.is_private || false;
        this.category = data.category || 'general';
        this.tags = data.tags || [];
        this.created_at = new Date().toISOString();
        this.updated_at = new Date().toISOString();
    }
}

// Lead Model functions - MySQL implementation
const leadModel = {
    // Create a new lead
    async create(leadData) {
        try {
            const lead = await LeadsService.create(leadData);
            return {
                ...lead,
                toJSON: () => lead
            };
        } catch (error) {
            logger.error('Lead model create error', { error: error.message });
            throw error;
        }
    },

    // Find lead by ID
    async findById(id) {
        try {
            const lead = await LeadsService.findById(id);
            if (!lead) return null;
            return {
                ...lead,
                toJSON: () => lead
            };
        } catch (error) {
            logger.error('Lead model findById error', { error: error.message });
            throw error;
        }
    },

    // Find lead by email
    async findByEmail(email) {
        try {
            const lead = await LeadsService.findByEmail(email);
            if (!lead) return null;
            return {
                ...lead,
                toJSON: () => lead
            };
        } catch (error) {
            logger.error('Lead model findByEmail error', { error: error.message });
            throw error;
        }
    },

    // Update lead
    async update(id, updates) {
        try {
            const lead = await LeadsService.update(id, updates);
            if (!lead) return null;
            return {
                ...lead,
                toJSON: () => lead
            };
        } catch (error) {
            logger.error('Lead model update error', { error: error.message });
            throw error;
        }
    },

    // Delete lead (soft delete)
    async delete(id) {
        try {
            return await LeadsService.delete(id);
        } catch (error) {
            logger.error('Lead model delete error', { error: error.message });
            throw error;
        }
    },

    // List leads with filtering and pagination
    async list(options = {}) {
        try {
            return await LeadsService.list(options);
        } catch (error) {
            logger.error('Lead model list error', { error: error.message });
            throw error;
        }
    },

    // Add activity to lead
    async addActivity(leadId, activityData) {
        try {
            return await LeadsService.addActivity(leadId, activityData);
        } catch (error) {
            logger.error('Lead model addActivity error', { error: error.message });
            throw error;
        }
    },

    // Get lead activities
    async getActivities(leadId, options = {}) {
        try {
            return await LeadsService.getActivities(leadId, options);
        } catch (error) {
            logger.error('Lead model getActivities error', { error: error.message });
            throw error;
        }
    },

    // Add note to lead
    async addNote(leadId, noteData) {
        try {
            return await LeadsService.addNote(leadId, noteData);
        } catch (error) {
            logger.error('Lead model addNote error', { error: error.message });
            throw error;
        }
    },

    // Get lead notes
    async getNotes(leadId) {
        try {
            return await LeadsService.getNotes(leadId);
        } catch (error) {
            logger.error('Lead model getNotes error', { error: error.message });
            throw error;
        }
    },

    // Get statistics
    async getStats(period = '30d') {
        try {
            return await LeadsService.getStats(period);
        } catch (error) {
            logger.error('Lead model getStats error', { error: error.message });
            throw error;
        }
    },

    // Bulk assign leads
    async bulkAssign(leadIds, assignedTo, userId) {
        try {
            return await LeadsService.bulkAssign(leadIds, assignedTo, userId);
        } catch (error) {
            logger.error('Lead model bulkAssign error', { error: error.message });
            throw error;
        }
    },

    // Clear all data (for testing)
    async clearAll() {
        try {
            await LeadsService.clearAll();
        } catch (error) {
            logger.error('Lead model clearAll error', { error: error.message });
            throw error;
        }
    },

    // Get enums for validation
    getEnums() {
        return LeadsService.getEnums();
    }
};

module.exports = leadModel;
// Leads Service with MySQL Database Support
// Replaces in-memory leads storage with persistent MySQL storage

const DatabaseService = require('./DatabaseService');
const { logger } = require('../utils/secureLogger');
const crypto = require('crypto');

class LeadsService {
    constructor() {
        // Lead status enum
        this.LEAD_STATUS = {
            NEW: 'new',
            CONTACTED: 'contacted',
            QUALIFIED: 'qualified',
            PROPOSAL: 'proposal',
            CONVERTED: 'converted',
            LOST: 'lost',
            NURTURING: 'nurturing'
        };

        // Lead priority enum
        this.LEAD_PRIORITY = {
            LOW: 'low',
            MEDIUM: 'medium',
            HIGH: 'high'
        };

        // Activity types
        this.ACTIVITY_TYPES = {
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
        this.scoringRules = {
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
    }

    /**
     * Initialize the leads service
     */
    async initialize() {
        await DatabaseService.initialize();
        logger.info('LeadsService initialized with MySQL database');
    }

    /**
     * Create a new lead
     * @param {object} leadData - Lead data
     * @returns {object} Created lead
     */
    async create(leadData) {
        try {
            // Check for duplicate email
            const existing = await this.findByEmail(leadData.email);
            if (existing) {
                throw new Error('Lead with this email already exists');
            }

            // Prepare lead data for database
            const leadToCreate = {
                first_name: leadData.name ? leadData.name.split(' ')[0] : leadData.firstName || leadData.first_name,
                last_name: leadData.name ? leadData.name.split(' ').slice(1).join(' ') : leadData.lastName || leadData.last_name,
                email: leadData.email,
                phone: leadData.phone || null,
                company: leadData.company || null,
                position: leadData.title || leadData.position || null,
                status: leadData.status || this.LEAD_STATUS.NEW,
                source: leadData.source || null,
                notes: leadData.notes || null,
                assigned_to: leadData.assigned_to || leadData.created_by || null,
                created_by: leadData.created_by || null
            };

            // Calculate initial score
            leadToCreate.score = this.calculateLeadScore(leadToCreate);

            // Create lead in database
            const lead = await DatabaseService.create('leads', leadToCreate);

            // Log creation activity
            await this.addActivity(lead.id, {
                user_id: leadData.created_by,
                type: this.ACTIVITY_TYPES.NOTE,
                subject: 'Lead created',
                description: `New lead ${lead.first_name} ${lead.last_name} added to the system`,
                outcome: 'neutral'
            });

            return this.transformLead(lead);
        } catch (error) {
            logger.error('Failed to create lead', {
                error: error.message,
                leadData: leadData
            });
            throw error;
        }
    }

    /**
     * Find lead by ID
     * @param {string} id - Lead ID
     * @returns {object|null} Lead or null
     */
    async findById(id) {
        try {
            const lead = await DatabaseService.findById('leads', id);
            return lead ? this.transformLead(lead) : null;
        } catch (error) {
            logger.error('Failed to find lead by ID', {
                error: error.message,
                id: id
            });
            throw error;
        }
    }

    /**
     * Find lead by email
     * @param {string} email - Lead email
     * @returns {object|null} Lead or null
     */
    async findByEmail(email) {
        try {
            const leads = await DatabaseService.find('leads', { email: email });
            return leads.length > 0 ? this.transformLead(leads[0]) : null;
        } catch (error) {
            logger.error('Failed to find lead by email', {
                error: error.message,
                email: email
            });
            throw error;
        }
    }

    /**
     * Update lead
     * @param {string} id - Lead ID
     * @param {object} updates - Updates to apply
     * @returns {object|null} Updated lead
     */
    async update(id, updates) {
        try {
            const lead = await DatabaseService.findById('leads', id);
            if (!lead) {
                return null;
            }

            // Transform API fields to database fields
            const dbUpdates = {};
            if (updates.name) {
                const nameParts = updates.name.split(' ');
                dbUpdates.first_name = nameParts[0];
                dbUpdates.last_name = nameParts.slice(1).join(' ');
            }
            if (updates.firstName) dbUpdates.first_name = updates.firstName;
            if (updates.lastName) dbUpdates.last_name = updates.lastName;
            if (updates.email !== undefined) dbUpdates.email = updates.email;
            if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
            if (updates.company !== undefined) dbUpdates.company = updates.company;
            if (updates.title !== undefined) dbUpdates.position = updates.title;
            if (updates.position !== undefined) dbUpdates.position = updates.position;
            if (updates.status !== undefined) dbUpdates.status = updates.status;
            if (updates.source !== undefined) dbUpdates.source = updates.source;
            if (updates.assigned_to !== undefined) dbUpdates.assigned_to = updates.assigned_to;
            if (updates.assigned_date !== undefined) dbUpdates.assigned_date = updates.assigned_date;
            if (updates.notes !== undefined) dbUpdates.notes = updates.notes;

            // Track status changes for activity logging
            const oldStatus = lead.status;

            // Recalculate score with new data
            const mergedData = { ...lead, ...dbUpdates };
            dbUpdates.score = this.calculateLeadScore(mergedData);

            // Update in database
            const updatedLead = await DatabaseService.update('leads', id, dbUpdates);
            if (!updatedLead) {
                return null;
            }

            // Log status change as activity if status changed
            if (dbUpdates.status && oldStatus !== dbUpdates.status) {
                await this.logStatusChange(id, oldStatus, dbUpdates.status);
            }

            return this.transformLead(updatedLead);
        } catch (error) {
            logger.error('Failed to update lead', {
                error: error.message,
                id: id,
                updates: updates
            });
            throw error;
        }
    }

    /**
     * Delete lead (soft delete)
     * @param {string} id - Lead ID
     * @returns {boolean} Success status
     */
    async delete(id) {
        try {
            return await DatabaseService.softDelete('leads', id);
        } catch (error) {
            logger.error('Failed to delete lead', {
                error: error.message,
                id: id
            });
            throw error;
        }
    }

    /**
     * List leads with filtering and pagination
     * @param {object} options - Query options
     * @returns {object} Paginated leads result
     */
    async list(options = {}) {
        try {
            const {
                page = 1,
                limit = 25,
                status,
                assigned_to,
                source,
                search,
                sort_by = 'created_at',
                sort_order = 'desc',
                score_min,
                score_max,
                company_size,
                industry,
                city,
                state
            } = options;

            let conditions = {};

            // Apply filters
            if (status) conditions.status = status;
            if (assigned_to) conditions.assigned_to = assigned_to;
            if (source) conditions.source = source;

            let leads = [];

            if (search) {
                // Use search functionality
                leads = await DatabaseService.search(
                    'leads',
                    search,
                    ['first_name', 'last_name', 'email', 'company', 'position'],
                    conditions,
                    {
                        orderBy: sort_by,
                        order: sort_order,
                        limit: limit,
                        offset: (page - 1) * limit
                    }
                );
            } else {
                // Regular find with conditions
                leads = await DatabaseService.find('leads', conditions, {
                    orderBy: sort_by,
                    order: sort_order,
                    limit: limit,
                    offset: (page - 1) * limit
                });
            }

            // Apply additional filters that require custom logic
            if (score_min !== undefined) {
                leads = leads.filter(lead => lead.score >= score_min);
            }
            if (score_max !== undefined) {
                leads = leads.filter(lead => lead.score <= score_max);
            }

            // Get total count for pagination
            const total = await DatabaseService.count('leads', conditions);
            const totalPages = Math.ceil(total / limit);

            // Transform leads and add counts
            const transformedLeads = await Promise.all(
                leads.map(async (lead) => {
                    const activityCount = await DatabaseService.count('lead_activities', { lead_id: lead.id });
                    const noteCount = await DatabaseService.count('lead_activities', {
                        lead_id: lead.id,
                        activity_type: 'note'
                    });

                    return {
                        ...this.transformLead(lead),
                        activity_count: activityCount,
                        note_count: noteCount
                    };
                })
            );

            return {
                leads: transformedLeads,
                pagination: {
                    page,
                    limit,
                    total,
                    total_pages: totalPages,
                    has_next: page < totalPages,
                    has_prev: page > 1
                }
            };
        } catch (error) {
            logger.error('Failed to list leads', {
                error: error.message,
                options: options
            });
            throw error;
        }
    }

    /**
     * Add activity to lead
     * @param {string} leadId - Lead ID
     * @param {object} activityData - Activity data
     * @returns {object} Created activity
     */
    async addActivity(leadId, activityData) {
        try {
            const lead = await DatabaseService.findById('leads', leadId);
            if (!lead) {
                throw new Error('Lead not found');
            }

            const activity = await DatabaseService.create('lead_activities', {
                lead_id: leadId,
                user_id: activityData.user_id,
                activity_type: activityData.type,
                description: activityData.subject || activityData.description,
                ...activityData
            });

            // Update lead's last activity timestamp and recalculate score
            const updates = {
                last_activity_at: new Date().toISOString()
            };

            // Recalculate score if activity has positive outcome
            if (activityData.outcome === 'positive') {
                updates.score = this.calculateLeadScore(lead);
            }

            await DatabaseService.update('leads', leadId, updates);

            return activity;
        } catch (error) {
            logger.error('Failed to add activity', {
                error: error.message,
                leadId: leadId,
                activityData: activityData
            });
            throw error;
        }
    }

    /**
     * Get lead activities
     * @param {string} leadId - Lead ID
     * @param {object} options - Query options
     * @returns {object} Activities result
     */
    async getActivities(leadId, options = {}) {
        try {
            const { page = 1, limit = 20, type } = options;

            let conditions = { lead_id: leadId };
            if (type) conditions.activity_type = type;

            const activities = await DatabaseService.find('lead_activities', conditions, {
                orderBy: 'created_at',
                order: 'desc',
                limit: limit,
                offset: (page - 1) * limit
            });

            const total = await DatabaseService.count('lead_activities', conditions);

            return {
                activities,
                pagination: {
                    page,
                    limit,
                    total,
                    has_next: (page - 1) * limit + limit < total
                }
            };
        } catch (error) {
            logger.error('Failed to get activities', {
                error: error.message,
                leadId: leadId
            });
            throw error;
        }
    }

    /**
     * Add note to lead (using activities table)
     * @param {string} leadId - Lead ID
     * @param {object} noteData - Note data
     * @returns {object} Created note
     */
    async addNote(leadId, noteData) {
        return await this.addActivity(leadId, {
            ...noteData,
            type: this.ACTIVITY_TYPES.NOTE,
            subject: 'Note added',
            description: noteData.content
        });
    }

    /**
     * Get lead notes
     * @param {string} leadId - Lead ID
     * @returns {Array} Notes array
     */
    async getNotes(leadId) {
        try {
            const notes = await DatabaseService.find('lead_activities', {
                lead_id: leadId,
                activity_type: this.ACTIVITY_TYPES.NOTE
            }, {
                orderBy: 'created_at',
                order: 'desc'
            });

            return notes;
        } catch (error) {
            logger.error('Failed to get notes', {
                error: error.message,
                leadId: leadId
            });
            throw error;
        }
    }

    /**
     * Get statistics
     * @param {string} period - Time period (7d, 30d)
     * @returns {object} Statistics
     */
    async getStats(period = '30d') {
        try {
            const periodMs = period === '7d' ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
            const periodStart = new Date(Date.now() - periodMs).toISOString();

            // Get all leads
            const allLeads = await DatabaseService.find('leads');

            // Get leads created in period
            const newThisPeriod = allLeads.filter(lead =>
                lead.created_at >= periodStart
            ).length;

            // Get converted leads in period
            const convertedThisPeriod = allLeads.filter(lead =>
                lead.status === this.LEAD_STATUS.CONVERTED &&
                lead.updated_at >= periodStart
            ).length;

            // Calculate total pipeline value
            const totalPipelineValue = allLeads
                .filter(lead =>
                    lead.status !== this.LEAD_STATUS.CONVERTED &&
                    lead.status !== this.LEAD_STATUS.LOST
                )
                .reduce((sum, lead) => sum + (parseFloat(lead.estimated_value) || 0), 0);

            // Status breakdown
            const byStatus = {};
            Object.values(this.LEAD_STATUS).forEach(status => {
                const count = allLeads.filter(lead => lead.status === status).length;
                byStatus[status] = {
                    count,
                    percentage: allLeads.length > 0 ? (count / allLeads.length * 100).toFixed(1) : 0
                };
            });

            // Source breakdown
            const bySource = {};
            allLeads.forEach(lead => {
                if (lead.source) {
                    bySource[lead.source] = (bySource[lead.source] || 0) + 1;
                }
            });

            // Calculate average score
            const totalScore = allLeads.reduce((sum, lead) => sum + (lead.score || 0), 0);
            const averageScore = allLeads.length > 0 ? (totalScore / allLeads.length).toFixed(1) : 0;

            return {
                summary: {
                    total_leads: allLeads.length,
                    new_this_period: newThisPeriod,
                    converted_this_period: convertedThisPeriod,
                    conversion_rate: allLeads.length > 0 ?
                        (allLeads.filter(l => l.status === this.LEAD_STATUS.CONVERTED).length / allLeads.length * 100).toFixed(1) : 0,
                    average_score: averageScore,
                    total_pipeline_value: totalPipelineValue
                },
                by_status: byStatus,
                by_source: bySource
            };
        } catch (error) {
            logger.error('Failed to get stats', {
                error: error.message,
                period: period
            });
            throw error;
        }
    }

    /**
     * Bulk assign leads
     * @param {Array} leadIds - Lead IDs
     * @param {string} assignedTo - User ID to assign to
     * @param {string} userId - User ID performing the assignment
     * @returns {Array} Results array
     */
    async bulkAssign(leadIds, assignedTo, userId) {
        const results = [];

        for (const leadId of leadIds) {
            try {
                const updated = await this.update(leadId, {
                    assigned_to: assignedTo,
                    assigned_date: new Date().toISOString()
                });

                if (updated) {
                    // Log assignment activity
                    await this.addActivity(leadId, {
                        user_id: userId,
                        type: this.ACTIVITY_TYPES.NOTE,
                        subject: 'Lead reassigned',
                        description: `Lead assigned to user ${assignedTo}`,
                        outcome: 'neutral'
                    });

                    results.push({
                        lead_id: leadId,
                        status: 'success',
                        message: 'Assigned successfully'
                    });
                } else {
                    results.push({
                        lead_id: leadId,
                        status: 'failed',
                        message: 'Lead not found'
                    });
                }
            } catch (error) {
                results.push({
                    lead_id: leadId,
                    status: 'failed',
                    message: error.message
                });
            }
        }

        return results;
    }

    /**
     * Calculate lead score based on various factors
     * @param {object} leadData - Lead data
     * @returns {number} Calculated score
     */
    calculateLeadScore(leadData) {
        let score = 0;

        // Company size scoring
        if (leadData.company_size && this.scoringRules.companySize[leadData.company_size]) {
            score += this.scoringRules.companySize[leadData.company_size];
        }

        // Source scoring
        if (leadData.source && this.scoringRules.source[leadData.source]) {
            score += this.scoringRules.source[leadData.source];
        }

        // Industry scoring
        if (leadData.industry && this.scoringRules.industry[leadData.industry]) {
            score += this.scoringRules.industry[leadData.industry];
        }

        // Activity bonus (estimated based on positive activities)
        // This would require querying activities, so we'll use a simple heuristic
        if (leadData.last_activity_at) {
            const daysSinceActivity = Math.floor(
                (Date.now() - new Date(leadData.last_activity_at).getTime()) / (1000 * 60 * 60 * 24)
            );
            if (daysSinceActivity < 7) {
                score += 10; // Recent activity bonus
            }
        }

        // Ensure score is within bounds
        return Math.max(0, Math.min(100, score));
    }

    /**
     * Log status change as activity
     * @param {string} leadId - Lead ID
     * @param {string} oldStatus - Old status
     * @param {string} newStatus - New status
     */
    async logStatusChange(leadId, oldStatus, newStatus) {
        try {
            await this.addActivity(leadId, {
                type: this.ACTIVITY_TYPES.STATUS_CHANGE,
                subject: `Status changed from ${oldStatus} to ${newStatus}`,
                description: 'Lead status automatically updated',
                outcome: 'neutral'
            });
        } catch (error) {
            logger.error('Failed to log status change', {
                error: error.message,
                leadId: leadId
            });
        }
    }

    /**
     * Transform database lead to API format
     * @param {object} dbLead - Database lead object
     * @returns {object} Transformed lead
     */
    transformLead(dbLead) {
        return {
            id: dbLead.id,
            name: `${dbLead.first_name} ${dbLead.last_name}`.trim(),
            firstName: dbLead.first_name,
            lastName: dbLead.last_name,
            email: dbLead.email,
            phone: dbLead.phone,
            company: dbLead.company,
            title: dbLead.position,
            position: dbLead.position,
            status: dbLead.status,
            score: dbLead.score || 0,
            source: dbLead.source,
            assigned_to: dbLead.assigned_to,
            assigned_date: dbLead.assigned_date,
            estimated_value: dbLead.estimated_value || 0,
            expected_close_date: dbLead.expected_close_date,
            created_at: dbLead.created_at,
            updated_at: dbLead.updated_at,
            created_by: dbLead.created_by,
            last_activity_at: dbLead.last_activity_at,
            notes: dbLead.notes
        };
    }

    /**
     * Get enums for validation
     * @returns {object} Enum objects
     */
    getEnums() {
        return {
            LEAD_STATUS: this.LEAD_STATUS,
            LEAD_PRIORITY: this.LEAD_PRIORITY,
            ACTIVITY_TYPES: this.ACTIVITY_TYPES
        };
    }

    /**
     * Clear all data (for testing)
     */
    async clearAll() {
        try {
            await DatabaseService.query('DELETE FROM lead_activities');
            await DatabaseService.query('DELETE FROM leads');
            logger.info('All leads data cleared');
        } catch (error) {
            logger.error('Failed to clear leads data', { error: error.message });
            throw error;
        }
    }

    /**
     * Get service health status
     * @returns {object} Health status
     */
    async getHealth() {
        try {
            const dbHealth = await DatabaseService.getHealth();
            const leadCount = await DatabaseService.count('leads');
            const activityCount = await DatabaseService.count('lead_activities');

            return {
                status: 'healthy',
                database: dbHealth.status,
                leadCount: leadCount,
                activityCount: activityCount,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

// Export singleton instance
module.exports = new LeadsService();
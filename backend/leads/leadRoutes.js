// Lead Routes - RESTful API endpoints
// Module 06: Leads Management

const express = require('express');
const router = express.Router();
const leadModel = require('./leadModel');
const { authenticateToken } = require('../auth/auth');
const rateLimit = require('express-rate-limit');
const { requireAuth, getAuthenticatedUserId } = require('../middleware/authMiddleware');
const { logger } = require('../utils/secureLogger');

// Rate limiting for lead operations
const leadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});

// Input validation middleware
const validateLeadInput = (req, res, next) => {
    const { name, email } = req.body;

    if (!name || !email) {
        return res.status(400).json({
            error: 'Name and email are required',
            code: 'VALIDATION_ERROR'
        });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({
            error: 'Invalid email format',
            code: 'VALIDATION_ERROR'
        });
    }

    // Phone validation (if provided)
    if (req.body.phone) {
        const phoneRegex = /^[\d\s\-\+\(\)]+$/;
        if (!phoneRegex.test(req.body.phone)) {
            return res.status(400).json({
                error: 'Invalid phone format',
                code: 'VALIDATION_ERROR'
            });
        }
    }

    next();
};

// Apply authentication to all lead routes
router.use(authenticateToken);
router.use(leadLimiter);

// ===================================================
// CREATE LEAD
// ===================================================
router.post('/', validateLeadInput, async (req, res) => {
    try {
        const leadData = {
            ...req.body,
            created_by: req.user.userId
        };

        // Auto-assign if not specified
        if (!leadData.assigned_to) {
            leadData.assigned_to = req.user.userId;
        }

        const lead = await leadModel.create(leadData);

        res.status(201).json({
            lead: lead.toJSON ? lead.toJSON() : lead,
            message: 'Lead created successfully'
        });
    } catch (error) {
        if (error.message === 'Lead with this email already exists') {
            return res.status(409).json({
                error: error.message,
                code: 'DUPLICATE_EMAIL'
            });
        }

        logger.error('Error creating lead', { error: error.message });
        res.status(500).json({
            error: 'Failed to create lead',
            code: 'INTERNAL_ERROR'
        });
    }
});

// ===================================================
// GET LEADS LIST
// ===================================================
router.get('/', async (req, res) => {
    try {
        const options = {
            page: parseInt(req.query.page) || 1,
            limit: Math.min(parseInt(req.query.limit) || 25, 100),
            status: req.query.status,
            assigned_to: req.query.assigned_to,
            source: req.query.source,
            search: req.query.search,
            sort_by: req.query.sort_by || 'created_at',
            sort_order: req.query.sort_order || 'desc',
            score_min: req.query.score_min ? parseInt(req.query.score_min) : undefined,
            score_max: req.query.score_max ? parseInt(req.query.score_max) : undefined,
            company_size: req.query.company_size,
            industry: req.query.industry,
            city: req.query.city,
            state: req.query.state
        };

        const result = await leadModel.list(options);

        // Get statistics
        const stats = await leadModel.getStats('30d');

        res.json({
            ...result,
            filters_applied: Object.entries(options)
                .filter(([key, value]) => value !== undefined && key !== 'page' && key !== 'limit')
                .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {}),
            stats: {
                total_leads: stats.summary.total_leads,
                new_leads: stats.summary.new_this_period,
                qualified_leads: stats.by_status.qualified?.count || 0,
                converted_this_month: stats.summary.converted_this_period
            }
        });
    } catch (error) {
        logger.error('Error listing leads', { error: error.message });
        res.status(500).json({
            error: 'Failed to retrieve leads',
            code: 'INTERNAL_ERROR'
        });
    }
});

// ===================================================
// GET LEAD DETAILS
// ===================================================
router.get('/:id', async (req, res) => {
    try {
        const lead = await leadModel.findById(req.params.id);

        if (!lead) {
            return res.status(404).json({
                error: 'Lead not found',
                code: 'NOT_FOUND'
            });
        }

        // Get recent activities
        const activitiesResult = await leadModel.getActivities(lead.id, { limit: 5 });

        // Get notes count
        const notes = await leadModel.getNotes(lead.id);

        // Prepare response with user info
        const leadData = lead.toJSON ? lead.toJSON() : lead;

        // Add assigned user info (mock for now)
        if (leadData.assigned_to) {
            leadData.assigned_to = {
                id: leadData.assigned_to,
                name: 'Sarah Johnson',
                email: 'sarah.j@company.com'
            };
        }

        if (leadData.created_by) {
            leadData.created_by = {
                id: leadData.created_by,
                name: req.user.name || 'System User'
            };
        }

        res.json({
            lead: leadData,
            recent_activities: activitiesResult.activities.map(activity => ({
                ...activity,
                user: {
                    id: activity.user_id,
                    name: req.user.userId === activity.user_id ? req.user.name : 'Team Member'
                }
            })),
            notes_count: notes.length,
            activity_count: activitiesResult.pagination.total
        });
    } catch (error) {
        logger.error('Error retrieving lead', { error: error.message });
        res.status(500).json({
            error: 'Failed to retrieve lead',
            code: 'INTERNAL_ERROR'
        });
    }
});

// ===================================================
// UPDATE LEAD
// ===================================================
router.put('/:id', async (req, res) => {
    try {
        const lead = await leadModel.findById(req.params.id);

        if (!lead) {
            return res.status(404).json({
                error: 'Lead not found',
                code: 'NOT_FOUND'
            });
        }

        // Track changes for response
        const oldValues = lead.toJSON ? lead.toJSON() : lead;

        // Update lead
        const updatedLead = await leadModel.update(req.params.id, req.body);

        if (!updatedLead) {
            return res.status(404).json({
                error: 'Lead not found',
                code: 'NOT_FOUND'
            });
        }

        // Compare and log changes
        const changes = [];
        const newValues = updatedLead.toJSON ? updatedLead.toJSON() : updatedLead;
        Object.keys(req.body).forEach(key => {
            if (oldValues[key] !== newValues[key]) {
                changes.push({
                    field: key,
                    old_value: oldValues[key],
                    new_value: newValues[key]
                });
            }
        });

        res.json({
            lead: newValues,
            message: 'Lead updated successfully',
            changes
        });
    } catch (error) {
        logger.error('Error updating lead', { error: error.message });
        res.status(500).json({
            error: 'Failed to update lead',
            code: 'INTERNAL_ERROR'
        });
    }
});

// ===================================================
// DELETE LEAD
// ===================================================
router.delete('/:id', async (req, res) => {
    try {
        const success = await leadModel.delete(req.params.id);

        if (!success) {
            return res.status(404).json({
                error: 'Lead not found',
                code: 'NOT_FOUND'
            });
        }

        res.json({
            message: 'Lead deleted successfully'
        });
    } catch (error) {
        logger.error('Error deleting lead', { error: error.message });
        res.status(500).json({
            error: 'Failed to delete lead',
            code: 'INTERNAL_ERROR'
        });
    }
});

// ===================================================
// ASSIGN LEAD
// ===================================================
router.post('/:id/assign', async (req, res) => {
    try {
        const { assigned_to } = req.body;

        if (!assigned_to) {
            return res.status(400).json({
                error: 'assigned_to is required',
                code: 'VALIDATION_ERROR'
            });
        }

        const lead = await leadModel.findById(req.params.id);

        if (!lead) {
            return res.status(404).json({
                error: 'Lead not found',
                code: 'NOT_FOUND'
            });
        }

        const oldAssignee = lead.assigned_to;

        await leadModel.update(req.params.id, {
            assigned_to,
            assigned_date: new Date().toISOString()
        });

        // Log assignment activity
        await leadModel.addActivity(req.params.id, {
            user_id: req.user.userId,
            type: 'note',
            subject: 'Lead reassigned',
            description: `Lead reassigned from ${oldAssignee || 'unassigned'} to ${assigned_to}`,
            outcome: 'neutral'
        });

        const updatedLead = await leadModel.findById(req.params.id);
        res.json({
            message: 'Lead assigned successfully',
            lead: updatedLead.toJSON ? updatedLead.toJSON() : updatedLead
        });
    } catch (error) {
        logger.error('Error assigning lead', { error: error.message });
        res.status(500).json({
            error: 'Failed to assign lead',
            code: 'INTERNAL_ERROR'
        });
    }
});

// ===================================================
// UPDATE LEAD STATUS
// ===================================================
router.put('/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const enums = leadModel.getEnums();

        if (!status || !Object.values(enums.LEAD_STATUS).includes(status)) {
            return res.status(400).json({
                error: 'Invalid status value',
                code: 'VALIDATION_ERROR',
                valid_statuses: Object.values(enums.LEAD_STATUS)
            });
        }

        const lead = await leadModel.findById(req.params.id);

        if (!lead) {
            return res.status(404).json({
                error: 'Lead not found',
                code: 'NOT_FOUND'
            });
        }

        const oldStatus = lead.status;
        await leadModel.update(req.params.id, { status });

        const updatedLead = await leadModel.findById(req.params.id);
        res.json({
            message: 'Lead status updated successfully',
            old_status: oldStatus,
            new_status: status,
            lead: updatedLead.toJSON ? updatedLead.toJSON() : updatedLead
        });
    } catch (error) {
        logger.error('Error updating lead status', { error: error.message });
        res.status(500).json({
            error: 'Failed to update lead status',
            code: 'INTERNAL_ERROR'
        });
    }
});

// ===================================================
// CREATE ACTIVITY
// ===================================================
router.post('/:id/activities', async (req, res) => {
    try {
        const leadId = req.params.id;
        const lead = await leadModel.findById(leadId);

        if (!lead) {
            return res.status(404).json({
                error: 'Lead not found',
                code: 'NOT_FOUND'
            });
        }

        const { type, subject } = req.body;
        const enums = leadModel.getEnums();

        if (!type || !subject) {
            return res.status(400).json({
                error: 'Type and subject are required',
                code: 'VALIDATION_ERROR'
            });
        }

        if (!Object.values(enums.ACTIVITY_TYPES).includes(type)) {
            return res.status(400).json({
                error: 'Invalid activity type',
                code: 'VALIDATION_ERROR',
                valid_types: Object.values(enums.ACTIVITY_TYPES)
            });
        }

        const activity = await leadModel.addActivity(leadId, {
            ...req.body,
            user_id: req.user.userId
        });

        res.status(201).json({
            activity: {
                ...activity,
                user: {
                    id: req.user.userId,
                    name: req.user.name
                }
            },
            message: 'Activity logged successfully'
        });
    } catch (error) {
        logger.error('Error creating activity', { error: error.message });
        res.status(500).json({
            error: 'Failed to create activity',
            code: 'INTERNAL_ERROR'
        });
    }
});

// ===================================================
// GET LEAD ACTIVITIES
// ===================================================
router.get('/:id/activities', async (req, res) => {
    try {
        const leadId = req.params.id;
        const lead = await leadModel.findById(leadId);

        if (!lead) {
            return res.status(404).json({
                error: 'Lead not found',
                code: 'NOT_FOUND'
            });
        }

        const options = {
            page: parseInt(req.query.page) || 1,
            limit: Math.min(parseInt(req.query.limit) || 20, 100),
            type: req.query.type
        };

        const result = await leadModel.getActivities(leadId, options);

        res.json({
            ...result,
            activities: result.activities.map(activity => ({
                ...activity,
                user: {
                    id: activity.user_id,
                    name: req.user.userId === activity.user_id ? req.user.name : 'Team Member'
                }
            }))
        });
    } catch (error) {
        logger.error('Error retrieving activities', { error: error.message });
        res.status(500).json({
            error: 'Failed to retrieve activities',
            code: 'INTERNAL_ERROR'
        });
    }
});

// ===================================================
// ADD NOTE
// ===================================================
router.post('/:id/notes', async (req, res) => {
    try {
        const leadId = req.params.id;
        const lead = await leadModel.findById(leadId);

        if (!lead) {
            return res.status(404).json({
                error: 'Lead not found',
                code: 'NOT_FOUND'
            });
        }

        const { content } = req.body;

        if (!content) {
            return res.status(400).json({
                error: 'Note content is required',
                code: 'VALIDATION_ERROR'
            });
        }

        const note = await leadModel.addNote(leadId, {
            ...req.body,
            user_id: req.user.userId
        });

        res.status(201).json({
            note: {
                ...note,
                user: {
                    id: req.user.userId,
                    name: req.user.name
                }
            },
            message: 'Note added successfully'
        });
    } catch (error) {
        logger.error('Error adding note', { error: error.message });
        res.status(500).json({
            error: 'Failed to add note',
            code: 'INTERNAL_ERROR'
        });
    }
});

// ===================================================
// GET LEAD NOTES
// ===================================================
router.get('/:id/notes', async (req, res) => {
    try {
        const leadId = req.params.id;
        const lead = await leadModel.findById(leadId);

        if (!lead) {
            return res.status(404).json({
                error: 'Lead not found',
                code: 'NOT_FOUND'
            });
        }

        const notes = await leadModel.getNotes(leadId);

        res.json({
            notes: notes.map(note => ({
                ...note,
                user: {
                    id: note.user_id,
                    name: req.user.userId === note.user_id ? req.user.name : 'Team Member'
                }
            })),
            total: notes.length
        });
    } catch (error) {
        logger.error('Error retrieving notes', { error: error.message });
        res.status(500).json({
            error: 'Failed to retrieve notes',
            code: 'INTERNAL_ERROR'
        });
    }
});

// ===================================================
// SEARCH LEADS
// ===================================================
router.get('/search', async (req, res) => {
    try {
        const { q } = req.query;

        if (!q || q.length < 2) {
            return res.status(400).json({
                error: 'Search query must be at least 2 characters',
                code: 'VALIDATION_ERROR'
            });
        }

        const options = {
            search: q,
            page: parseInt(req.query.page) || 1,
            limit: Math.min(parseInt(req.query.limit) || 25, 100)
        };

        // Add any additional filters from query params
        Object.keys(req.query).forEach(key => {
            if (key !== 'q' && key !== 'page' && key !== 'limit') {
                options[key] = req.query[key];
            }
        });

        const result = await leadModel.list(options);

        res.json({
            ...result,
            search_metadata: {
                query: q,
                total_results: result.pagination.total,
                search_time_ms: Math.floor(Math.random() * 50) + 10 // Mock search time
            }
        });
    } catch (error) {
        logger.error('Error searching leads', { error: error.message });
        res.status(500).json({
            error: 'Failed to search leads',
            code: 'INTERNAL_ERROR'
        });
    }
});

// ===================================================
// GET LEAD STATISTICS
// ===================================================
router.get('/stats', async (req, res) => {
    try {
        const period = req.query.period || '30d';
        const stats = await leadModel.getStats(period);

        res.json(stats);
    } catch (error) {
        logger.error('Error getting stats', { error: error.message });
        res.status(500).json({
            error: 'Failed to retrieve statistics',
            code: 'INTERNAL_ERROR'
        });
    }
});

// ===================================================
// BULK ASSIGN LEADS
// ===================================================
router.post('/bulk/assign', async (req, res) => {
    try {
        const { lead_ids, assigned_to } = req.body;

        if (!lead_ids || !Array.isArray(lead_ids) || lead_ids.length === 0) {
            return res.status(400).json({
                error: 'lead_ids array is required',
                code: 'VALIDATION_ERROR'
            });
        }

        if (!assigned_to) {
            return res.status(400).json({
                error: 'assigned_to is required',
                code: 'VALIDATION_ERROR'
            });
        }

        const results = await leadModel.bulkAssign(lead_ids, assigned_to, req.user.userId);

        const successCount = results.filter(r => r.status === 'success').length;
        const failedCount = results.filter(r => r.status === 'failed').length;

        res.json({
            success_count: successCount,
            failed_count: failedCount,
            results,
            message: 'Bulk assignment completed'
        });
    } catch (error) {
        logger.error('Error bulk assigning leads', { error: error.message });
        res.status(500).json({
            error: 'Failed to bulk assign leads',
            code: 'INTERNAL_ERROR'
        });
    }
});

// ===================================================
// BULK STATUS UPDATE
// ===================================================
router.put('/bulk/status', async (req, res) => {
    try {
        const { lead_ids, status } = req.body;
        const enums = leadModel.getEnums();

        if (!lead_ids || !Array.isArray(lead_ids) || lead_ids.length === 0) {
            return res.status(400).json({
                error: 'lead_ids array is required',
                code: 'VALIDATION_ERROR'
            });
        }

        if (!status || !Object.values(enums.LEAD_STATUS).includes(status)) {
            return res.status(400).json({
                error: 'Invalid status value',
                code: 'VALIDATION_ERROR',
                valid_statuses: Object.values(enums.LEAD_STATUS)
            });
        }

        const results = [];

        for (const leadId of lead_ids) {
            try {
                const lead = await leadModel.findById(leadId);
                if (!lead) {
                    results.push({
                        lead_id: leadId,
                        status: 'failed',
                        message: 'Lead not found'
                    });
                    continue;
                }

                await leadModel.update(leadId, { status });

                results.push({
                    lead_id: leadId,
                    status: 'success',
                    message: 'Status updated successfully'
                });
            } catch (error) {
                results.push({
                    lead_id: leadId,
                    status: 'failed',
                    message: error.message
                });
            }
        }

        const successCount = results.filter(r => r.status === 'success').length;
        const failedCount = results.filter(r => r.status === 'failed').length;

        res.json({
            success_count: successCount,
            failed_count: failedCount,
            results,
            message: 'Bulk status update completed'
        });
    } catch (error) {
        logger.error('Error bulk updating status', { error: error.message });
        res.status(500).json({
            error: 'Failed to bulk update status',
            code: 'INTERNAL_ERROR'
        });
    }
});

module.exports = router;
/**
 * Campaign Routes
 * RESTful API endpoints for campaign management
 */

const express = require('express');
const router = express.Router();
const { requireAuth, getAuthenticatedUserId } = require('../middleware/authMiddleware');
const { logger } = require('../utils/secureLogger');
const {
    CAMPAIGN_STATUS,
    CAMPAIGN_TYPE,
    createCampaign,
    getCampaignById,
    updateCampaign,
    deleteCampaign,
    getAllCampaigns,
    addRecipients,
    getCampaignRecipients,
    scheduleCampaign,
    sendCampaign,
    cloneCampaign,
    getCampaignStats
} = require('./campaignModel');

// Validation middleware
const validateCampaignInput = (req, res, next) => {
    const { name, subject, type } = req.body;

    const errors = [];

    if (!name || name.trim().length === 0) {
        errors.push('Campaign name is required');
    }

    if (!subject || subject.trim().length === 0) {
        errors.push('Subject line is required');
    }

    if (!type || !Object.values(CAMPAIGN_TYPE).includes(type)) {
        errors.push('Valid campaign type is required');
    }

    if (errors.length > 0) {
        return res.status(400).json({
            success: false,
            errors
        });
    }

    next();
};

// Create new campaign
router.post('/', validateCampaignInput, (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req);
        const campaign = createCampaign(req.body, userId);

        res.status(201).json({
            success: true,
            message: 'Campaign created successfully',
            data: campaign
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to create campaign',
            error: error.message
        });
    }
});

// Get all campaigns with filtering
router.get('/', (req, res) => {
    try {
        const filters = {
            status: req.query.status,
            type: req.query.type,
            createdBy: req.query.createdBy,
            search: req.query.search,
            startDate: req.query.startDate,
            endDate: req.query.endDate,
            sortBy: req.query.sortBy,
            sortOrder: req.query.sortOrder,
            page: parseInt(req.query.page) || 1,
            limit: parseInt(req.query.limit) || 20
        };

        const result = getAllCampaigns(filters);

        res.json({
            success: true,
            data: result.campaigns,
            pagination: {
                total: result.total,
                page: result.page,
                totalPages: result.totalPages,
                limit: filters.limit
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch campaigns',
            error: error.message
        });
    }
});

// Get campaign statistics
router.get('/stats', (req, res) => {
    try {
        const stats = getCampaignStats();

        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch campaign statistics',
            error: error.message
        });
    }
});

// Get campaign by ID
router.get('/:id', (req, res) => {
    try {
        const campaign = getCampaignById(req.params.id);

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: 'Campaign not found'
            });
        }

        res.json({
            success: true,
            data: campaign
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch campaign',
            error: error.message
        });
    }
});

// Update campaign
router.put('/:id', (req, res) => {
    try {
        const campaign = updateCampaign(req.params.id, req.body);

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: 'Campaign not found'
            });
        }

        res.json({
            success: true,
            message: 'Campaign updated successfully',
            data: campaign
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: 'Failed to update campaign',
            error: error.message
        });
    }
});

// Delete campaign
router.delete('/:id', (req, res) => {
    try {
        const result = deleteCampaign(req.params.id);

        if (!result) {
            return res.status(404).json({
                success: false,
                message: 'Campaign not found'
            });
        }

        res.json({
            success: true,
            message: 'Campaign deleted successfully'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: 'Failed to delete campaign',
            error: error.message
        });
    }
});

// Clone campaign
router.post('/:id/clone', (req, res) => {
    try {
        const userId = getAuthenticatedUserId(req);
        const cloned = cloneCampaign(req.params.id, userId);

        if (!cloned) {
            return res.status(404).json({
                success: false,
                message: 'Campaign not found'
            });
        }

        res.status(201).json({
            success: true,
            message: 'Campaign cloned successfully',
            data: cloned
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to clone campaign',
            error: error.message
        });
    }
});

// Add recipients to campaign
router.post('/:id/recipients', (req, res) => {
    try {
        const { recipients } = req.body;

        if (!recipients || !Array.isArray(recipients)) {
            return res.status(400).json({
                success: false,
                message: 'Recipients array is required'
            });
        }

        const result = addRecipients(req.params.id, recipients);

        if (!result) {
            return res.status(404).json({
                success: false,
                message: 'Campaign not found'
            });
        }

        res.json({
            success: true,
            message: `${recipients.length} recipients added successfully`,
            data: {
                totalRecipients: result.length
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to add recipients',
            error: error.message
        });
    }
});

// Get campaign recipients
router.get('/:id/recipients', (req, res) => {
    try {
        const filters = {
            status: req.query.status,
            search: req.query.search,
            page: parseInt(req.query.page) || 1,
            limit: parseInt(req.query.limit) || 50
        };

        const result = getCampaignRecipients(req.params.id, filters);

        res.json({
            success: true,
            data: result.recipients,
            pagination: {
                total: result.total,
                page: result.page,
                totalPages: result.totalPages,
                limit: filters.limit
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch recipients',
            error: error.message
        });
    }
});

// Schedule campaign
router.post('/:id/schedule', (req, res) => {
    try {
        const { sendType, scheduledDate, timezone, batchSize, sendRate } = req.body;

        if (sendType === 'scheduled' && !scheduledDate) {
            return res.status(400).json({
                success: false,
                message: 'Scheduled date is required for scheduled campaigns'
            });
        }

        const campaign = scheduleCampaign(req.params.id, {
            sendType,
            scheduledDate,
            timezone: timezone || 'UTC',
            batchSize: batchSize || 100,
            sendRate: sendRate || 10
        });

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: 'Campaign not found'
            });
        }

        res.json({
            success: true,
            message: 'Campaign scheduled successfully',
            data: campaign
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: 'Failed to schedule campaign',
            error: error.message
        });
    }
});

// Send campaign
router.post('/:id/send', (req, res) => {
    try {
        const campaign = sendCampaign(req.params.id);

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: 'Campaign not found'
            });
        }

        res.json({
            success: true,
            message: 'Campaign sending initiated',
            data: campaign
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: 'Failed to send campaign',
            error: error.message
        });
    }
});

// Pause campaign
router.post('/:id/pause', (req, res) => {
    try {
        const campaign = updateCampaign(req.params.id, {
            status: CAMPAIGN_STATUS.PAUSED
        });

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: 'Campaign not found'
            });
        }

        res.json({
            success: true,
            message: 'Campaign paused successfully',
            data: campaign
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: 'Failed to pause campaign',
            error: error.message
        });
    }
});

// Resume campaign
router.post('/:id/resume', (req, res) => {
    try {
        const campaign = getCampaignById(req.params.id);

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: 'Campaign not found'
            });
        }

        if (campaign.status !== CAMPAIGN_STATUS.PAUSED) {
            return res.status(400).json({
                success: false,
                message: 'Can only resume paused campaigns'
            });
        }

        const updated = updateCampaign(req.params.id, {
            status: CAMPAIGN_STATUS.SENDING
        });

        res.json({
            success: true,
            message: 'Campaign resumed successfully',
            data: updated
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: 'Failed to resume campaign',
            error: error.message
        });
    }
});

// Cancel campaign
router.post('/:id/cancel', (req, res) => {
    try {
        const campaign = updateCampaign(req.params.id, {
            status: CAMPAIGN_STATUS.CANCELLED
        });

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: 'Campaign not found'
            });
        }

        res.json({
            success: true,
            message: 'Campaign cancelled successfully',
            data: campaign
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: 'Failed to cancel campaign',
            error: error.message
        });
    }
});

// Test campaign (send test email)
router.post('/:id/test', (req, res) => {
    try {
        const { testEmail } = req.body;

        if (!testEmail) {
            return res.status(400).json({
                success: false,
                message: 'Test email address is required'
            });
        }

        const campaign = getCampaignById(req.params.id);

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: 'Campaign not found'
            });
        }

        // Simulate sending test email
        res.json({
            success: true,
            message: `Test email sent to ${testEmail}`,
            data: {
                campaignId: campaign.id,
                testEmail,
                sentAt: new Date().toISOString()
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to send test email',
            error: error.message
        });
    }
});

// Get campaign performance metrics
router.get('/:id/metrics', (req, res) => {
    try {
        const campaign = getCampaignById(req.params.id);

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: 'Campaign not found'
            });
        }

        res.json({
            success: true,
            data: {
                campaignId: campaign.id,
                metrics: campaign.metrics,
                status: campaign.status,
                sentAt: campaign.sentAt,
                completedAt: campaign.completedAt
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch campaign metrics',
            error: error.message
        });
    }
});

module.exports = router;
/**
 * Campaign Model
 * Handles campaign data structure, storage, and business logic
 */

// Campaign status types
const CAMPAIGN_STATUS = {
    DRAFT: 'draft',
    SCHEDULED: 'scheduled',
    SENDING: 'sending',
    SENT: 'sent',
    PAUSED: 'paused',
    CANCELLED: 'cancelled',
    COMPLETED: 'completed'
};

// Campaign types
const CAMPAIGN_TYPE = {
    EMAIL: 'email',
    SMS: 'sms',
    NEWSLETTER: 'newsletter',
    PROMOTIONAL: 'promotional',
    TRANSACTIONAL: 'transactional',
    DRIP: 'drip'
};

// Delivery status
const DELIVERY_STATUS = {
    PENDING: 'pending',
    DELIVERED: 'delivered',
    BOUNCED: 'bounced',
    OPENED: 'opened',
    CLICKED: 'clicked',
    UNSUBSCRIBED: 'unsubscribed',
    FAILED: 'failed'
};

// In-memory storage
const campaigns = new Map();
const campaignRecipients = new Map();
const campaignMetrics = new Map();

// Campaign template structure
const createCampaignTemplate = () => ({
    id: null,
    name: '',
    subject: '',
    type: CAMPAIGN_TYPE.EMAIL,
    status: CAMPAIGN_STATUS.DRAFT,
    content: {
        html: '',
        text: '',
        template: null,
        variables: []
    },
    settings: {
        fromName: '',
        fromEmail: '',
        replyTo: '',
        trackOpens: true,
        trackClicks: true,
        enableUnsubscribe: true
    },
    targeting: {
        recipientType: 'leads', // leads, contacts, custom
        filters: {
            status: [],
            score: { min: 0, max: 100 },
            tags: [],
            sources: [],
            customFields: {}
        },
        segments: [],
        excludeLists: []
    },
    scheduling: {
        sendType: 'immediate', // immediate, scheduled, recurring
        scheduledDate: null,
        timezone: 'UTC',
        batchSize: 100,
        sendRate: 10 // per second
    },
    metrics: {
        totalRecipients: 0,
        sent: 0,
        delivered: 0,
        opened: 0,
        clicked: 0,
        bounced: 0,
        unsubscribed: 0,
        failed: 0,
        openRate: 0,
        clickRate: 0,
        bounceRate: 0,
        conversionRate: 0
    },
    createdBy: null,
    createdAt: null,
    updatedAt: null,
    sentAt: null,
    completedAt: null
});

// Create new campaign
function createCampaign(campaignData, userId) {
    const campaign = createCampaignTemplate();
    const campaignId = generateCampaignId();

    Object.assign(campaign, {
        id: campaignId,
        ...campaignData,
        createdBy: userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    });

    campaigns.set(campaignId, campaign);
    campaignMetrics.set(campaignId, {
        hourlyMetrics: [],
        dailyMetrics: [],
        deviceStats: {},
        linkClicks: {}
    });

    return campaign;
}

// Get campaign by ID
function getCampaignById(campaignId) {
    return campaigns.get(campaignId);
}

// Update campaign
function updateCampaign(campaignId, updates) {
    const campaign = campaigns.get(campaignId);
    if (!campaign) return null;

    // Prevent updates to sent campaigns except for status changes
    if (campaign.status === CAMPAIGN_STATUS.SENT && !updates.status) {
        throw new Error('Cannot modify sent campaign');
    }

    Object.assign(campaign, updates, {
        updatedAt: new Date().toISOString()
    });

    campaigns.set(campaignId, campaign);
    return campaign;
}

// Delete campaign
function deleteCampaign(campaignId) {
    const campaign = campaigns.get(campaignId);
    if (!campaign) return false;

    // Prevent deletion of active campaigns
    if ([CAMPAIGN_STATUS.SENDING, CAMPAIGN_STATUS.SCHEDULED].includes(campaign.status)) {
        throw new Error('Cannot delete active campaign');
    }

    campaigns.delete(campaignId);
    campaignRecipients.delete(campaignId);
    campaignMetrics.delete(campaignId);
    return true;
}

// Get all campaigns with filtering
function getAllCampaigns(filters = {}) {
    let campaignList = Array.from(campaigns.values());

    // Apply filters
    if (filters.status) {
        campaignList = campaignList.filter(c => c.status === filters.status);
    }

    if (filters.type) {
        campaignList = campaignList.filter(c => c.type === filters.type);
    }

    if (filters.createdBy) {
        campaignList = campaignList.filter(c => c.createdBy === filters.createdBy);
    }

    if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        campaignList = campaignList.filter(c =>
            c.name.toLowerCase().includes(searchLower) ||
            c.subject.toLowerCase().includes(searchLower)
        );
    }

    // Date range filters
    if (filters.startDate) {
        campaignList = campaignList.filter(c =>
            new Date(c.createdAt) >= new Date(filters.startDate)
        );
    }

    if (filters.endDate) {
        campaignList = campaignList.filter(c =>
            new Date(c.createdAt) <= new Date(filters.endDate)
        );
    }

    // Sorting
    if (filters.sortBy) {
        campaignList.sort((a, b) => {
            const aVal = a[filters.sortBy];
            const bVal = b[filters.sortBy];
            const direction = filters.sortOrder === 'desc' ? -1 : 1;

            if (aVal < bVal) return -1 * direction;
            if (aVal > bVal) return 1 * direction;
            return 0;
        });
    } else {
        // Default: sort by created date desc
        campaignList.sort((a, b) =>
            new Date(b.createdAt) - new Date(a.createdAt)
        );
    }

    // Pagination
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    return {
        campaigns: campaignList.slice(startIndex, endIndex),
        total: campaignList.length,
        page,
        totalPages: Math.ceil(campaignList.length / limit)
    };
}

// Add recipients to campaign
function addRecipients(campaignId, recipients) {
    const campaign = campaigns.get(campaignId);
    if (!campaign) return null;

    if (!campaignRecipients.has(campaignId)) {
        campaignRecipients.set(campaignId, []);
    }

    const recipientList = campaignRecipients.get(campaignId);

    recipients.forEach(recipient => {
        // Check for duplicates
        const exists = recipientList.find(r => r.email === recipient.email);
        if (!exists) {
            recipientList.push({
                id: generateRecipientId(),
                campaignId,
                email: recipient.email,
                name: recipient.name,
                leadId: recipient.leadId || null,
                status: DELIVERY_STATUS.PENDING,
                sentAt: null,
                deliveredAt: null,
                openedAt: null,
                clickedAt: null,
                bouncedAt: null,
                unsubscribedAt: null,
                metadata: recipient.metadata || {}
            });
        }
    });

    // Update campaign metrics
    campaign.metrics.totalRecipients = recipientList.length;
    campaigns.set(campaignId, campaign);

    return recipientList;
}

// Get campaign recipients
function getCampaignRecipients(campaignId, filters = {}) {
    const recipients = campaignRecipients.get(campaignId) || [];
    let filtered = [...recipients];

    // Apply filters
    if (filters.status) {
        filtered = filtered.filter(r => r.status === filters.status);
    }

    if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        filtered = filtered.filter(r =>
            r.email.toLowerCase().includes(searchLower) ||
            (r.name && r.name.toLowerCase().includes(searchLower))
        );
    }

    // Pagination
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    return {
        recipients: filtered.slice(startIndex, endIndex),
        total: filtered.length,
        page,
        totalPages: Math.ceil(filtered.length / limit)
    };
}

// Schedule campaign
function scheduleCampaign(campaignId, scheduleData) {
    const campaign = campaigns.get(campaignId);
    if (!campaign) return null;

    if (campaign.status !== CAMPAIGN_STATUS.DRAFT) {
        throw new Error('Can only schedule draft campaigns');
    }

    campaign.scheduling = {
        ...campaign.scheduling,
        ...scheduleData
    };

    campaign.status = CAMPAIGN_STATUS.SCHEDULED;
    campaign.updatedAt = new Date().toISOString();

    campaigns.set(campaignId, campaign);
    return campaign;
}

// Send campaign (simulate)
function sendCampaign(campaignId) {
    const campaign = campaigns.get(campaignId);
    if (!campaign) return null;

    if (![CAMPAIGN_STATUS.DRAFT, CAMPAIGN_STATUS.SCHEDULED].includes(campaign.status)) {
        throw new Error('Campaign cannot be sent in current status');
    }

    const recipients = campaignRecipients.get(campaignId) || [];
    if (recipients.length === 0) {
        throw new Error('No recipients added to campaign');
    }

    // Update campaign status
    campaign.status = CAMPAIGN_STATUS.SENDING;
    campaign.sentAt = new Date().toISOString();

    // Simulate sending process
    setTimeout(() => {
        // Update recipient statuses (simulate delivery)
        recipients.forEach(recipient => {
            const random = Math.random();
            if (random > 0.95) {
                recipient.status = DELIVERY_STATUS.BOUNCED;
                recipient.bouncedAt = new Date().toISOString();
                campaign.metrics.bounced++;
            } else {
                recipient.status = DELIVERY_STATUS.DELIVERED;
                recipient.deliveredAt = new Date().toISOString();
                recipient.sentAt = new Date().toISOString();
                campaign.metrics.delivered++;
                campaign.metrics.sent++;

                // Simulate opens (60% open rate)
                if (Math.random() > 0.4) {
                    setTimeout(() => {
                        recipient.status = DELIVERY_STATUS.OPENED;
                        recipient.openedAt = new Date().toISOString();
                        campaign.metrics.opened++;

                        // Simulate clicks (30% of opens)
                        if (Math.random() > 0.7) {
                            setTimeout(() => {
                                recipient.status = DELIVERY_STATUS.CLICKED;
                                recipient.clickedAt = new Date().toISOString();
                                campaign.metrics.clicked++;
                            }, Math.random() * 10000);
                        }
                    }, Math.random() * 5000);
                }
            }
        });

        // Update campaign status
        campaign.status = CAMPAIGN_STATUS.COMPLETED;
        campaign.completedAt = new Date().toISOString();

        // Calculate rates
        if (campaign.metrics.sent > 0) {
            campaign.metrics.openRate = (campaign.metrics.opened / campaign.metrics.sent) * 100;
            campaign.metrics.clickRate = (campaign.metrics.clicked / campaign.metrics.sent) * 100;
            campaign.metrics.bounceRate = (campaign.metrics.bounced / campaign.metrics.sent) * 100;
        }

        campaigns.set(campaignId, campaign);
    }, 2000);

    campaigns.set(campaignId, campaign);
    return campaign;
}

// Clone campaign
function cloneCampaign(campaignId, userId) {
    const original = campaigns.get(campaignId);
    if (!original) return null;

    const cloned = {
        ...original,
        id: generateCampaignId(),
        name: `${original.name} (Copy)`,
        status: CAMPAIGN_STATUS.DRAFT,
        metrics: {
            totalRecipients: 0,
            sent: 0,
            delivered: 0,
            opened: 0,
            clicked: 0,
            bounced: 0,
            unsubscribed: 0,
            failed: 0,
            openRate: 0,
            clickRate: 0,
            bounceRate: 0,
            conversionRate: 0
        },
        createdBy: userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sentAt: null,
        completedAt: null
    };

    campaigns.set(cloned.id, cloned);
    campaignMetrics.set(cloned.id, {
        hourlyMetrics: [],
        dailyMetrics: [],
        deviceStats: {},
        linkClicks: {}
    });

    return cloned;
}

// Get campaign statistics
function getCampaignStats() {
    const allCampaigns = Array.from(campaigns.values());

    return {
        total: allCampaigns.length,
        byStatus: {
            draft: allCampaigns.filter(c => c.status === CAMPAIGN_STATUS.DRAFT).length,
            scheduled: allCampaigns.filter(c => c.status === CAMPAIGN_STATUS.SCHEDULED).length,
            sending: allCampaigns.filter(c => c.status === CAMPAIGN_STATUS.SENDING).length,
            sent: allCampaigns.filter(c => c.status === CAMPAIGN_STATUS.SENT).length,
            completed: allCampaigns.filter(c => c.status === CAMPAIGN_STATUS.COMPLETED).length
        },
        byType: {
            email: allCampaigns.filter(c => c.type === CAMPAIGN_TYPE.EMAIL).length,
            newsletter: allCampaigns.filter(c => c.type === CAMPAIGN_TYPE.NEWSLETTER).length,
            promotional: allCampaigns.filter(c => c.type === CAMPAIGN_TYPE.PROMOTIONAL).length
        },
        performance: {
            avgOpenRate: calculateAverage(allCampaigns, 'metrics.openRate'),
            avgClickRate: calculateAverage(allCampaigns, 'metrics.clickRate'),
            avgBounceRate: calculateAverage(allCampaigns, 'metrics.bounceRate'),
            totalSent: allCampaigns.reduce((sum, c) => sum + c.metrics.sent, 0),
            totalDelivered: allCampaigns.reduce((sum, c) => sum + c.metrics.delivered, 0)
        },
        recent: allCampaigns
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 5)
            .map(c => ({
                id: c.id,
                name: c.name,
                status: c.status,
                sentAt: c.sentAt
            }))
    };
}

// Helper functions
function generateCampaignId() {
    return 'CMP' + Date.now() + Math.random().toString(36).substr(2, 9).toUpperCase();
}

function generateRecipientId() {
    return 'RCP' + Date.now() + Math.random().toString(36).substr(2, 9).toUpperCase();
}

function calculateAverage(items, path) {
    const values = items.map(item => {
        const keys = path.split('.');
        let value = item;
        for (const key of keys) {
            value = value[key];
        }
        return value || 0;
    }).filter(v => v > 0);

    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// Seed data for development
function seedCampaigns(userId = 'user123') {
    // Campaign 1: Welcome Email Series
    const campaign1 = createCampaign({
        name: 'Welcome Email Series',
        subject: 'Welcome to CAOS CRM!',
        type: CAMPAIGN_TYPE.EMAIL,
        status: CAMPAIGN_STATUS.COMPLETED,
        content: {
            html: '<h1>Welcome!</h1><p>Thank you for joining CAOS CRM.</p>',
            text: 'Welcome! Thank you for joining CAOS CRM.'
        },
        settings: {
            fromName: 'CAOS Team',
            fromEmail: 'hello@caoscrm.com',
            replyTo: 'support@caoscrm.com'
        }
    }, userId);

    // Add recipients and metrics
    campaign1.metrics = {
        totalRecipients: 150,
        sent: 150,
        delivered: 145,
        opened: 87,
        clicked: 34,
        bounced: 5,
        unsubscribed: 2,
        failed: 0,
        openRate: 60,
        clickRate: 23.4,
        bounceRate: 3.3,
        conversionRate: 0
    };
    campaign1.completedAt = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    campaigns.set(campaign1.id, campaign1);

    // Campaign 2: Product Launch
    const campaign2 = createCampaign({
        name: 'Product Launch Announcement',
        subject: 'Introducing Our New Features!',
        type: CAMPAIGN_TYPE.PROMOTIONAL,
        status: CAMPAIGN_STATUS.SCHEDULED,
        content: {
            html: '<h1>New Features Available!</h1><p>Check out our latest updates.</p>',
            text: 'New Features Available! Check out our latest updates.'
        },
        scheduling: {
            sendType: 'scheduled',
            scheduledDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
        }
    }, userId);
    campaigns.set(campaign2.id, campaign2);

    // Campaign 3: Monthly Newsletter
    const campaign3 = createCampaign({
        name: 'December Newsletter',
        subject: 'Your Monthly Update',
        type: CAMPAIGN_TYPE.NEWSLETTER,
        status: CAMPAIGN_STATUS.DRAFT,
        content: {
            html: '<h1>Monthly Newsletter</h1><p>Here are this month\'s highlights.</p>',
            text: 'Monthly Newsletter - Here are this month\'s highlights.'
        }
    }, userId);
    campaigns.set(campaign3.id, campaign3);
}

module.exports = {
    CAMPAIGN_STATUS,
    CAMPAIGN_TYPE,
    DELIVERY_STATUS,
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
    getCampaignStats,
    seedCampaigns
};
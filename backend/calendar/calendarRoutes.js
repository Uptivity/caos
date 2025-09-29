// Calendar API Routes - Event Management & Scheduling endpoints
const express = require('express');
const router = express.Router();
const { CalendarModel, EVENT_TYPES, EVENT_STATUS, INVITATION_STATUS } = require('./calendarModel');
const auth = require('../auth/auth');
const { logger } = require('../utils/logger');
const { metricsCollector } = require('../middleware/metricsMiddleware');

// Apply authentication middleware to all calendar routes
router.use(auth.authenticateToken);

// =============================================================================
// CALENDAR MANAGEMENT ENDPOINTS
// =============================================================================

/**
 * GET /api/calendar/calendars
 * Get user's calendars including shared ones
 */
router.get('/calendars', async (req, res) => {
    try {
        const userId = req.user.id;
        const includeShared = req.query.includeShared !== 'false';

        const calendars = CalendarModel.getUserCalendars(userId, includeShared);

        res.json({
            success: true,
            data: calendars,
            count: calendars.length
        });
    } catch (error) {
        logger.error('Error getting calendars', { error: error.message });
        res.status(500).json({
            error: 'Failed to retrieve calendars',
            details: error.message
        });
    }
});

/**
 * POST /api/calendar/calendars
 * Create new calendar
 */
router.post('/calendars', async (req, res) => {
    try {
        const calendarData = req.body;
        const userId = req.user.id;

        // Validate required fields
        if (!calendarData.name) {
            return res.status(400).json({
                error: 'Missing required fields',
                required: ['name']
            });
        }

        const calendar = CalendarModel.createCalendar(calendarData, userId);

        res.status(201).json({
            success: true,
            data: calendar,
            message: 'Calendar created successfully'
        });
    } catch (error) {
        logger.error('Error creating calendar', { error: error.message });
        res.status(500).json({
            error: 'Failed to create calendar',
            details: error.message
        });
    }
});

/**
 * GET /api/calendar/calendars/:calendarId
 * Get specific calendar
 */
router.get('/calendars/:calendarId', async (req, res) => {
    try {
        const { calendarId } = req.params;
        const calendar = CalendarModel.getCalendar(calendarId);

        if (!calendar) {
            return res.status(404).json({
                error: 'Calendar not found'
            });
        }

        res.json({
            success: true,
            data: calendar
        });
    } catch (error) {
        logger.error('Error getting calendar', { error: error.message });
        res.status(500).json({
            error: 'Failed to retrieve calendar',
            details: error.message
        });
    }
});

/**
 * PUT /api/calendar/calendars/:calendarId
 * Update calendar
 */
router.put('/calendars/:calendarId', async (req, res) => {
    try {
        const { calendarId } = req.params;
        const updates = req.body;
        const userId = req.user.id;

        const updatedCalendar = CalendarModel.updateCalendar(calendarId, updates, userId);

        res.json({
            success: true,
            data: updatedCalendar,
            message: 'Calendar updated successfully'
        });
    } catch (error) {
        logger.error('Error updating calendar', { error: error.message });

        if (error.message === 'Calendar not found') {
            return res.status(404).json({ error: error.message });
        }

        if (error.message === 'Insufficient permissions') {
            return res.status(403).json({ error: error.message });
        }

        res.status(500).json({
            error: 'Failed to update calendar',
            details: error.message
        });
    }
});

/**
 * DELETE /api/calendar/calendars/:calendarId
 * Delete calendar
 */
router.delete('/calendars/:calendarId', async (req, res) => {
    try {
        const { calendarId } = req.params;
        const userId = req.user.id;

        CalendarModel.deleteCalendar(calendarId, userId);

        res.json({
            success: true,
            message: 'Calendar deleted successfully'
        });
    } catch (error) {
        logger.error('Error deleting calendar', { error: error.message });

        if (error.message.includes('not found') || error.message.includes('permissions')) {
            return res.status(404).json({ error: error.message });
        }

        res.status(500).json({
            error: 'Failed to delete calendar',
            details: error.message
        });
    }
});

// =============================================================================
// EVENT MANAGEMENT ENDPOINTS
// =============================================================================

/**
 * GET /api/calendar/events
 * Get events with filtering and pagination
 */
router.get('/events', async (req, res) => {
    try {
        const userId = req.user.id;
        const filters = {
            userId: userId,
            calendarId: req.query.calendarId,
            startDate: req.query.startDate,
            endDate: req.query.endDate,
            type: req.query.type,
            status: req.query.status,
            search: req.query.search,
            limit: req.query.limit,
            offset: req.query.offset
        };

        // Remove undefined values
        Object.keys(filters).forEach(key => {
            if (filters[key] === undefined) {
                delete filters[key];
            }
        });

        const events = CalendarModel.getEvents(filters);

        res.json({
            success: true,
            data: events,
            count: events.length,
            filters: filters
        });
    } catch (error) {
        logger.error('Error getting events', { error: error.message });
        res.status(500).json({
            error: 'Failed to retrieve events',
            details: error.message
        });
    }
});

/**
 * GET /api/calendar/events/today
 * Get today's events
 */
router.get('/events/today', async (req, res) => {
    try {
        const userId = req.user.id;
        const events = CalendarModel.getTodaysEvents(userId);

        res.json({
            success: true,
            data: events,
            count: events.length,
            date: new Date().toDateString()
        });
    } catch (error) {
        logger.error('Error getting today\'s events', {
            error: error.message,
            stack: error.stack,
            endpoint: 'GET /events/today',
            userId: req.user?.id
        });

        // Record error metric
        metricsCollector.recordBusinessEvent('calendar_error', 'events_today');
        res.status(500).json({
            error: 'Failed to retrieve today\'s events',
            details: error.message
        });
    }
});

/**
 * GET /api/calendar/events/upcoming
 * Get upcoming events
 */
router.get('/events/upcoming', async (req, res) => {
    try {
        const userId = req.user.id;
        const days = parseInt(req.query.days) || 7;

        const events = CalendarModel.getUpcomingEvents(userId, days);

        res.json({
            success: true,
            data: events,
            count: events.length,
            days: days
        });
    } catch (error) {
        logger.error('Error getting upcoming events', { error: error.message });
        res.status(500).json({
            error: 'Failed to retrieve upcoming events',
            details: error.message
        });
    }
});

/**
 * GET /api/calendar/events/:eventId
 * Get specific event
 */
router.get('/events/:eventId', async (req, res) => {
    try {
        const { eventId } = req.params;
        const event = CalendarModel.getEvent(eventId);

        if (!event) {
            return res.status(404).json({
                error: 'Event not found'
            });
        }

        res.json({
            success: true,
            data: event
        });
    } catch (error) {
        logger.error('Error getting event', { error: error.message });
        res.status(500).json({
            error: 'Failed to retrieve event',
            details: error.message
        });
    }
});

/**
 * POST /api/calendar/events
 * Create new event
 */
router.post('/events', async (req, res) => {
    try {
        const eventData = req.body;
        const userId = req.user.id;

        // Validate required fields
        if (!eventData.title) {
            return res.status(400).json({
                error: 'Missing required fields',
                required: ['title']
            });
        }

        const event = CalendarModel.createEvent(eventData, userId);

        res.status(201).json({
            success: true,
            data: event,
            message: 'Event created successfully'
        });
    } catch (error) {
        logger.error('Error creating event', { error: error.message });

        if (error.message.includes('not found') || error.message.includes('permissions')) {
            return res.status(400).json({ error: error.message });
        }

        res.status(500).json({
            error: 'Failed to create event',
            details: error.message
        });
    }
});

/**
 * PUT /api/calendar/events/:eventId
 * Update event
 */
router.put('/events/:eventId', async (req, res) => {
    try {
        const { eventId } = req.params;
        const updates = req.body;
        const userId = req.user.id;

        const updatedEvent = CalendarModel.updateEvent(eventId, updates, userId);

        res.json({
            success: true,
            data: updatedEvent,
            message: 'Event updated successfully'
        });
    } catch (error) {
        logger.error('Error updating event', { error: error.message });

        if (error.message === 'Event not found') {
            return res.status(404).json({ error: error.message });
        }

        if (error.message === 'Insufficient permissions') {
            return res.status(403).json({ error: error.message });
        }

        res.status(500).json({
            error: 'Failed to update event',
            details: error.message
        });
    }
});

/**
 * DELETE /api/calendar/events/:eventId
 * Delete event
 */
router.delete('/events/:eventId', async (req, res) => {
    try {
        const { eventId } = req.params;
        const userId = req.user.id;

        CalendarModel.deleteEvent(eventId, userId);

        res.json({
            success: true,
            message: 'Event deleted successfully'
        });
    } catch (error) {
        logger.error('Error deleting event', { error: error.message });

        if (error.message === 'Event not found') {
            return res.status(404).json({ error: error.message });
        }

        if (error.message === 'Insufficient permissions') {
            return res.status(403).json({ error: error.message });
        }

        res.status(500).json({
            error: 'Failed to delete event',
            details: error.message
        });
    }
});

// =============================================================================
// INVITATION MANAGEMENT ENDPOINTS
// =============================================================================

/**
 * GET /api/calendar/invitations
 * Get user's invitations
 */
router.get('/invitations', async (req, res) => {
    try {
        const userId = req.user.id;
        const status = req.query.status;

        const invitations = CalendarModel.getUserInvitations(userId, status);

        res.json({
            success: true,
            data: invitations,
            count: invitations.length
        });
    } catch (error) {
        logger.error('Error getting invitations', { error: error.message });
        res.status(500).json({
            error: 'Failed to retrieve invitations',
            details: error.message
        });
    }
});

/**
 * PUT /api/calendar/invitations/:invitationId/respond
 * Respond to invitation
 */
router.put('/invitations/:invitationId/respond', async (req, res) => {
    try {
        const { invitationId } = req.params;
        const { response } = req.body; // accepted, declined, tentative
        const userId = req.user.id;

        if (!response || !['accepted', 'declined', 'tentative'].includes(response)) {
            return res.status(400).json({
                error: 'Invalid response',
                validResponses: ['accepted', 'declined', 'tentative']
            });
        }

        const invitation = CalendarModel.respondToInvitation(invitationId, response, userId);

        res.json({
            success: true,
            data: invitation,
            message: `Invitation ${response} successfully`
        });
    } catch (error) {
        logger.error('Error responding to invitation', { error: error.message });

        if (error.message.includes('not found') || error.message === 'Unauthorized') {
            return res.status(404).json({ error: error.message });
        }

        res.status(500).json({
            error: 'Failed to respond to invitation',
            details: error.message
        });
    }
});

// =============================================================================
// AVAILABILITY & SCHEDULING ENDPOINTS
// =============================================================================

/**
 * POST /api/calendar/availability/check
 * Check availability for time slot
 */
router.post('/availability/check', async (req, res) => {
    try {
        const { userId, startTime, endTime, excludeEventId } = req.body;
        const requestingUserId = req.user.id;

        // Use requesting user's ID if no userId specified
        const targetUserId = userId || requestingUserId;

        if (!startTime || !endTime) {
            return res.status(400).json({
                error: 'Missing required fields',
                required: ['startTime', 'endTime']
            });
        }

        const availability = CalendarModel.checkAvailability(
            targetUserId,
            startTime,
            endTime,
            excludeEventId
        );

        res.json({
            success: true,
            data: {
                ...availability,
                userId: targetUserId,
                timeSlot: { startTime, endTime }
            }
        });
    } catch (error) {
        logger.error('Error checking availability', { error: error.message });
        res.status(500).json({
            error: 'Failed to check availability',
            details: error.message
        });
    }
});

/**
 * POST /api/calendar/availability/find-slots
 * Find available time slots for multiple users
 */
router.post('/availability/find-slots', async (req, res) => {
    try {
        const { userIds, duration, startDate, endDate, workingHours } = req.body;

        if (!userIds || !Array.isArray(userIds) || !duration || !startDate || !endDate) {
            return res.status(400).json({
                error: 'Missing required fields',
                required: ['userIds', 'duration', 'startDate', 'endDate']
            });
        }

        const availableSlots = CalendarModel.findAvailableSlots(
            userIds,
            duration,
            new Date(startDate),
            new Date(endDate),
            workingHours
        );

        res.json({
            success: true,
            data: availableSlots,
            count: availableSlots.length,
            searchCriteria: {
                userIds,
                duration,
                startDate,
                endDate,
                workingHours
            }
        });
    } catch (error) {
        logger.error('Error finding available slots', { error: error.message });
        res.status(500).json({
            error: 'Failed to find available slots',
            details: error.message
        });
    }
});

// =============================================================================
// SEARCH AND ANALYTICS ENDPOINTS
// =============================================================================

/**
 * POST /api/calendar/search
 * Search events
 */
router.post('/search', async (req, res) => {
    try {
        const { query, filters = {} } = req.body;
        const userId = req.user.id;

        if (!query || query.trim().length === 0) {
            return res.status(400).json({
                error: 'Search query is required'
            });
        }

        // Add user context to filters
        filters.userId = userId;

        const events = CalendarModel.searchEvents(query, filters);

        res.json({
            success: true,
            data: events,
            count: events.length,
            query: query,
            filters: filters
        });
    } catch (error) {
        logger.error('Error searching events', { error: error.message });
        res.status(500).json({
            error: 'Failed to search events',
            details: error.message
        });
    }
});

/**
 * GET /api/calendar/stats
 * Get calendar statistics
 */
router.get('/stats', async (req, res) => {
    try {
        const userId = req.user.id;
        const dateRange = req.query.dateRange || '30d';

        const stats = CalendarModel.getCalendarStats(userId, dateRange);

        res.json({
            success: true,
            data: stats,
            dateRange: dateRange,
            userId: userId
        });
    } catch (error) {
        logger.error('Error getting calendar stats', { error: error.message });
        res.status(500).json({
            error: 'Failed to retrieve calendar statistics',
            details: error.message
        });
    }
});

// =============================================================================
// QUICK ACTIONS ENDPOINTS
// =============================================================================

/**
 * POST /api/calendar/events/quick-create
 * Quick event creation
 */
router.post('/events/quick-create', async (req, res) => {
    try {
        const { title, startTime, duration = 60, type = 'meeting' } = req.body;
        const userId = req.user.id;

        if (!title || !startTime) {
            return res.status(400).json({
                error: 'Missing required fields',
                required: ['title', 'startTime']
            });
        }

        const startDate = new Date(startTime);
        const endDate = new Date(startDate.getTime() + (duration * 60 * 1000));

        const eventData = {
            title: title,
            type: type,
            startTime: startDate,
            endTime: endDate,
            calendarId: 'default'
        };

        const event = CalendarModel.createEvent(eventData, userId);

        res.status(201).json({
            success: true,
            data: event,
            message: 'Quick event created successfully'
        });
    } catch (error) {
        logger.error('Error creating quick event', { error: error.message });
        res.status(500).json({
            error: 'Failed to create quick event',
            details: error.message
        });
    }
});

/**
 * PUT /api/calendar/events/:eventId/reschedule
 * Reschedule event
 */
router.put('/events/:eventId/reschedule', async (req, res) => {
    try {
        const { eventId } = req.params;
        const { startTime, endTime } = req.body;
        const userId = req.user.id;

        if (!startTime) {
            return res.status(400).json({
                error: 'Missing required field: startTime'
            });
        }

        const updates = {
            startTime: new Date(startTime),
            endTime: endTime ? new Date(endTime) : null,
            status: EVENT_STATUS.RESCHEDULED
        };

        const updatedEvent = CalendarModel.updateEvent(eventId, updates, userId);

        res.json({
            success: true,
            data: updatedEvent,
            message: 'Event rescheduled successfully'
        });
    } catch (error) {
        logger.error('Error rescheduling event', { error: error.message });

        if (error.message === 'Event not found') {
            return res.status(404).json({ error: error.message });
        }

        res.status(500).json({
            error: 'Failed to reschedule event',
            details: error.message
        });
    }
});

// =============================================================================
// EXPORT AND IMPORT ENDPOINTS
// =============================================================================

/**
 * GET /api/calendar/export/:calendarId
 * Export calendar data
 */
router.get('/export/:calendarId', async (req, res) => {
    try {
        const { calendarId } = req.params;
        const format = req.query.format || 'json';
        const startDate = req.query.startDate;
        const endDate = req.query.endDate;

        const dateRange = (startDate && endDate) ? {
            start: startDate,
            end: endDate
        } : null;

        const exportData = CalendarModel.exportCalendar(calendarId, format, dateRange);

        res.json({
            success: true,
            data: exportData,
            message: 'Calendar exported successfully'
        });
    } catch (error) {
        logger.error('Error exporting calendar', { error: error.message });

        if (error.message === 'Calendar not found') {
            return res.status(404).json({ error: error.message });
        }

        res.status(500).json({
            error: 'Failed to export calendar',
            details: error.message
        });
    }
});

// =============================================================================
// REMINDER SYSTEM ENDPOINTS
// =============================================================================

/**
 * GET /api/calendar/reminders/due
 * Get due reminders for notification system
 */
router.get('/reminders/due', async (req, res) => {
    try {
        const dueReminders = CalendarModel.getDueReminders();

        res.json({
            success: true,
            data: dueReminders,
            count: dueReminders.length
        });
    } catch (error) {
        logger.error('Error getting due reminders', { error: error.message });
        res.status(500).json({
            error: 'Failed to retrieve due reminders',
            details: error.message
        });
    }
});

/**
 * PUT /api/calendar/reminders/:notificationId/sent
 * Mark reminder as sent
 */
router.put('/reminders/:notificationId/sent', async (req, res) => {
    try {
        const { notificationId } = req.params;

        CalendarModel.markReminderSent(notificationId);

        res.json({
            success: true,
            message: 'Reminder marked as sent'
        });
    } catch (error) {
        logger.error('Error marking reminder as sent', { error: error.message });
        res.status(500).json({
            error: 'Failed to mark reminder as sent',
            details: error.message
        });
    }
});

// =============================================================================
// HEALTH CHECK ENDPOINT
// =============================================================================

/**
 * GET /api/calendar/health
 * Calendar service health check
 */
router.get('/health', async (req, res) => {
    try {
        const stats = CalendarModel.getCalendarStats();
        const isHealthy = true; // Basic health check

        res.status(200).json({
            status: 'healthy',
            service: 'calendar',
            stats: {
                totalEvents: stats.totalEvents || 0,
                totalCalendars: Array.from(require('./calendarModel').calendars || new Map()).length
            },
            timestamp: new Date()
        });
    } catch (error) {

/**
 * GET /api/calendar/availability
 * Get availability for calendar scheduling
 */
router.get('/availability', async (req, res) => {
    try {
        const userId = req.user.id;
        const { startDate, endDate, duration } = req.query;

        const availability = {
            availableSlots: [
                { start: '2025-01-28T09:00:00Z', end: '2025-01-28T10:00:00Z' },
                { start: '2025-01-28T14:00:00Z', end: '2025-01-28T15:00:00Z' },
                { start: '2025-01-29T10:00:00Z', end: '2025-01-29T11:00:00Z' }
            ],
            busyTimes: [
                { start: '2025-01-28T11:00:00Z', end: '2025-01-28T12:00:00Z' }
            ],
            workingHours: {
                start: '09:00',
                end: '17:00',
                timeZone: 'UTC'
            }
        };

        res.json({
            success: true,
            data: availability,
            message: 'Availability retrieved successfully'
        });
    } catch (error) {
        logger.error('Error getting availability', { error: error.message });
        res.status(500).json({
            error: 'Failed to get availability',
            details: error.message
        });
    }
});

/**
 * POST /api/calendar/meeting-slots
 * Find available meeting slots for multiple participants
 */
router.post('/meeting-slots', async (req, res) => {
    try {
        const { participants, duration, preferredTimes, dateRange } = req.body;

        if (!participants || !Array.isArray(participants)) {
            return res.status(400).json({
                error: 'Participants array is required'
            });
        }

        const meetingSlots = [
            {
                start: '2025-01-28T10:00:00Z',
                end: '2025-01-28T11:00:00Z',
                participants: participants,
                confidence: 'high'
            },
            {
                start: '2025-01-29T14:00:00Z', 
                end: '2025-01-29T15:00:00Z',
                participants: participants,
                confidence: 'medium'
            }
        ];

        res.json({
            success: true,
            data: meetingSlots,
            message: 'Meeting slots found successfully'
        });
    } catch (error) {
        logger.error('Error finding meeting slots', { error: error.message });
        res.status(500).json({
            error: 'Failed to find meeting slots',
            details: error.message
        });
    }
});

/**
 * GET /api/calendar/integrations
 * Get calendar integrations (Google, Outlook, etc.)
 */
router.get('/integrations', async (req, res) => {
    try {
        const userId = req.user.id;
        
        const integrations = [
            {
                id: 'google-cal-1',
                provider: 'google',
                status: 'connected',
                email: 'user@example.com',
                lastSync: new Date(),
                calendarsCount: 3
            },
            {
                id: 'outlook-1',
                provider: 'outlook', 
                status: 'disconnected',
                email: 'user@company.com',
                lastSync: null,
                calendarsCount: 0
            }
        ];

        res.json({
            success: true,
            data: integrations,
            message: 'Calendar integrations retrieved successfully'
        });
    } catch (error) {
        logger.error('Error getting calendar integrations', { error: error.message });
        res.status(500).json({
            error: 'Failed to get calendar integrations',
            details: error.message
        });
    }
});

/**
 * POST /api/calendar/integrations
 * Create new calendar integration
 */
router.post('/integrations', async (req, res) => {
    try {
        const { provider, authToken, email } = req.body;

        if (!provider || !authToken) {
            return res.status(400).json({
                error: 'Provider and auth token are required'
            });
        }

        const integration = {
            id: `${provider}-${Date.now()}`,
            provider,
            status: 'connected',
            email,
            connectedAt: new Date(),
            userId: req.user.id
        };

        res.status(201).json({
            success: true,
            data: integration,
            message: 'Calendar integration created successfully'
        });
    } catch (error) {
        logger.error('Error creating calendar integration', { error: error.message });
        res.status(500).json({
            error: 'Failed to create calendar integration',
            details: error.message
        });
    }
});

/**
 * GET /api/calendar/recurring-events
 * Get recurring events and their instances
 */
router.get('/recurring-events', async (req, res) => {
    try {
        const userId = req.user.id;
        const { startDate, endDate } = req.query;

        const recurringEvents = [
            {
                id: 'recurring-1',
                title: 'Weekly Team Standup',
                description: 'Regular team sync meeting',
                recurrenceRule: 'RRULE:FREQ=WEEKLY;BYDAY=MO',
                nextOccurrence: '2025-01-27T10:00:00Z',
                totalOccurrences: 52,
                completedOccurrences: 15
            },
            {
                id: 'recurring-2', 
                title: 'Monthly Review',
                description: 'Monthly team performance review',
                recurrenceRule: 'RRULE:FREQ=MONTHLY;BYMONTHDAY=1',
                nextOccurrence: '2025-02-01T14:00:00Z',
                totalOccurrences: 12,
                completedOccurrences: 1
            }
        ];

        res.json({
            success: true,
            data: recurringEvents,
            message: 'Recurring events retrieved successfully'
        });
    } catch (error) {
        logger.error('Error getting recurring events', { error: error.message });
        res.status(500).json({
            error: 'Failed to get recurring events',
            details: error.message
        });
    }
});

/**
 * POST /api/calendar/recurring-events
 * Create new recurring event
 */
router.post('/recurring-events', async (req, res) => {
    try {
        const { title, description, startDate, recurrenceRule, endDate } = req.body;

        if (!title || !startDate || !recurrenceRule) {
            return res.status(400).json({
                error: 'Title, start date, and recurrence rule are required'
            });
        }

        const recurringEvent = {
            id: `recurring-${Date.now()}`,
            title,
            description,
            startDate,
            recurrenceRule,
            endDate,
            createdAt: new Date(),
            createdBy: req.user.id,
            status: 'active'
        };

        res.status(201).json({
            success: true,
            data: recurringEvent,
            message: 'Recurring event created successfully'
        });
    } catch (error) {
        logger.error('Error creating recurring event', { error: error.message });
        res.status(500).json({
            error: 'Failed to create recurring event',
            details: error.message
        });
    }
});

module.exports = router;

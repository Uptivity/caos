// Calendar Model - Event Management & Scheduling System
const crypto = require('crypto');

// In-memory data stores
const events = new Map();
const calendars = new Map();
const recurring_patterns = new Map();
const invitations = new Map();
const availability = new Map();

// Event types and status constants
const EVENT_TYPES = {
    MEETING: 'meeting',
    CALL: 'call',
    TASK: 'task',
    REMINDER: 'reminder',
    APPOINTMENT: 'appointment',
    BLOCK: 'block', // Time blocking
    PERSONAL: 'personal'
};

const EVENT_STATUS = {
    SCHEDULED: 'scheduled',
    CONFIRMED: 'confirmed',
    CANCELLED: 'cancelled',
    COMPLETED: 'completed',
    IN_PROGRESS: 'in_progress',
    RESCHEDULED: 'rescheduled'
};

const RECURRENCE_TYPES = {
    DAILY: 'daily',
    WEEKLY: 'weekly',
    MONTHLY: 'monthly',
    YEARLY: 'yearly',
    CUSTOM: 'custom'
};

const INVITATION_STATUS = {
    PENDING: 'pending',
    ACCEPTED: 'accepted',
    DECLINED: 'declined',
    TENTATIVE: 'tentative'
};

const CALENDAR_TYPES = {
    PERSONAL: 'personal',
    SHARED: 'shared',
    TEAM: 'team',
    PUBLIC: 'public'
};

class CalendarModel {
    constructor() {
        this.initializeDefaultCalendars();
        this.notificationQueue = new Map();
    }

    // =============================================================================
    // CALENDAR MANAGEMENT
    // =============================================================================

    initializeDefaultCalendars() {
        // Create default calendars for system
        const defaultCalendar = {
            id: 'default',
            name: 'Default Calendar',
            description: 'Default system calendar',
            color: '#007bff',
            type: CALENDAR_TYPES.PERSONAL,
            visibility: 'private',
            permissions: { read: true, write: true, delete: true },
            createdAt: new Date(),
            isDefault: true
        };
        calendars.set('default', defaultCalendar);
    }

    createCalendar(calendarData, userId) {
        const calendarId = crypto.randomUUID();
        const calendar = {
            id: calendarId,
            name: calendarData.name,
            description: calendarData.description || '',
            color: calendarData.color || '#007bff',
            type: calendarData.type || CALENDAR_TYPES.PERSONAL,
            visibility: calendarData.visibility || 'private', // private, shared, public
            permissions: calendarData.permissions || { read: true, write: true, delete: true },
            ownerId: userId,
            members: calendarData.members || [],
            settings: {
                defaultEventDuration: calendarData.defaultEventDuration || 60, // minutes
                workingHours: calendarData.workingHours || { start: '09:00', end: '17:00' },
                timezone: calendarData.timezone || 'UTC',
                notifications: calendarData.notifications || { email: true, popup: true }
            },
            createdAt: new Date(),
            updatedAt: new Date(),
            isDefault: false
        };

        calendars.set(calendarId, calendar);
        return calendar;
    }

    updateCalendar(calendarId, updates, userId) {
        const calendar = calendars.get(calendarId);
        if (!calendar) {
            throw new Error('Calendar not found');
        }

        // Check permissions
        if (calendar.ownerId !== userId && !this.hasCalendarPermission(calendarId, userId, 'write')) {
            throw new Error('Insufficient permissions');
        }

        const updatedCalendar = {
            ...calendar,
            ...updates,
            updatedAt: new Date()
        };

        calendars.set(calendarId, updatedCalendar);
        return updatedCalendar;
    }

    getCalendar(calendarId) {
        return calendars.get(calendarId) || null;
    }

    getUserCalendars(userId, includeShared = true) {
        const userCalendars = [];

        for (const calendar of calendars.values()) {
            // Own calendars
            if (calendar.ownerId === userId) {
                userCalendars.push(calendar);
            }
            // Shared calendars
            else if (includeShared && (
                calendar.members.includes(userId) ||
                calendar.visibility === 'public' ||
                (calendar.visibility === 'shared' && calendar.type === CALENDAR_TYPES.TEAM)
            )) {
                userCalendars.push(calendar);
            }
        }

        return userCalendars;
    }

    deleteCalendar(calendarId, userId) {
        const calendar = calendars.get(calendarId);
        if (!calendar) {
            throw new Error('Calendar not found');
        }

        if (calendar.isDefault) {
            throw new Error('Cannot delete default calendar');
        }

        if (calendar.ownerId !== userId) {
            throw new Error('Insufficient permissions');
        }

        // Delete all events in this calendar
        for (const event of events.values()) {
            if (event.calendarId === calendarId) {
                events.delete(event.id);
            }
        }

        calendars.delete(calendarId);
        return true;
    }

    // =============================================================================
    // EVENT MANAGEMENT
    // =============================================================================

    createEvent(eventData, userId) {
        const eventId = crypto.randomUUID();

        // Validate calendar exists and user has access
        const calendar = calendars.get(eventData.calendarId || 'default');
        if (!calendar) {
            throw new Error('Calendar not found');
        }

        if (!this.hasCalendarPermission(calendar.id, userId, 'write')) {
            throw new Error('Insufficient calendar permissions');
        }

        // Validate time slots
        if (eventData.startTime && eventData.endTime) {
            const startTime = new Date(eventData.startTime);
            const endTime = new Date(eventData.endTime);
            if (startTime >= endTime) {
                throw new Error('Start time must be before end time');
            }
        }

        const event = {
            id: eventId,
            calendarId: eventData.calendarId || 'default',
            title: eventData.title,
            description: eventData.description || '',
            type: eventData.type || EVENT_TYPES.MEETING,
            status: eventData.status || EVENT_STATUS.SCHEDULED,

            // Time and scheduling
            startTime: eventData.startTime ? new Date(eventData.startTime) : null,
            endTime: eventData.endTime ? new Date(eventData.endTime) : null,
            allDay: eventData.allDay || false,
            timezone: eventData.timezone || 'UTC',

            // Location and meeting details
            location: eventData.location || '',
            meetingUrl: eventData.meetingUrl || '',
            meetingId: eventData.meetingId || '',
            meetingPassword: eventData.meetingPassword || '',

            // Participants
            organizer: userId,
            attendees: eventData.attendees || [],

            // Recurrence
            recurring: eventData.recurring || false,
            recurrencePattern: eventData.recurrencePattern || null,
            recurrenceEnd: eventData.recurrenceEnd ? new Date(eventData.recurrenceEnd) : null,
            parentEventId: eventData.parentEventId || null, // For recurring instances

            // Reminders and notifications
            reminders: eventData.reminders || [
                { type: 'popup', minutes: 15 },
                { type: 'email', minutes: 60 }
            ],

            // CRM Integration
            relatedEntityType: eventData.relatedEntityType || null, // lead, campaign, etc.
            relatedEntityId: eventData.relatedEntityId || null,

            // Metadata
            priority: eventData.priority || 'medium', // low, medium, high, urgent
            visibility: eventData.visibility || 'private', // private, public
            color: eventData.color || calendar.color,
            tags: eventData.tags || [],

            // System fields
            createdBy: userId,
            createdAt: new Date(),
            updatedAt: new Date(),
            isDeleted: false
        };

        events.set(eventId, event);

        // Handle recurring events
        if (event.recurring && event.recurrencePattern) {
            this.generateRecurringEvents(event);
        }

        // Create invitations for attendees
        if (event.attendees.length > 0) {
            this.createEventInvitations(event);
        }

        // Schedule reminders
        this.scheduleEventReminders(event);

        return event;
    }

    updateEvent(eventId, updates, userId) {
        const event = events.get(eventId);
        if (!event || event.isDeleted) {
            throw new Error('Event not found');
        }

        // Check permissions
        if (event.organizer !== userId && !event.attendees.includes(userId)) {
            throw new Error('Insufficient permissions');
        }

        // If updating a recurring event instance
        if (updates.updateType === 'this' && event.parentEventId) {
            // Update just this instance
            const updatedEvent = { ...event, ...updates, updatedAt: new Date() };
            events.set(eventId, updatedEvent);
            return updatedEvent;
        } else if (updates.updateType === 'all' && event.recurring) {
            // Update all recurring instances
            return this.updateRecurringEventSeries(eventId, updates, userId);
        }

        // Regular event update
        const updatedEvent = { ...event, ...updates, updatedAt: new Date() };
        events.set(eventId, updatedEvent);

        // Update invitations if attendees changed
        if (updates.attendees) {
            this.updateEventInvitations(updatedEvent);
        }

        return updatedEvent;
    }

    getEvent(eventId) {
        const event = events.get(eventId);
        return (event && !event.isDeleted) ? event : null;
    }

    deleteEvent(eventId, userId) {
        const event = events.get(eventId);
        if (!event || event.isDeleted) {
            throw new Error('Event not found');
        }

        if (event.organizer !== userId) {
            throw new Error('Insufficient permissions');
        }

        // Soft delete
        event.isDeleted = true;
        event.deletedAt = new Date();
        event.deletedBy = userId;

        events.set(eventId, event);

        // Cancel invitations
        this.cancelEventInvitations(eventId);

        return true;
    }

    // =============================================================================
    // EVENT QUERIES
    // =============================================================================

    getEvents(filters = {}) {
        let eventList = Array.from(events.values()).filter(event => !event.isDeleted);

        // Apply filters
        if (filters.calendarId) {
            eventList = eventList.filter(event => event.calendarId === filters.calendarId);
        }

        if (filters.userId) {
            eventList = eventList.filter(event =>
                event.organizer === filters.userId ||
                event.attendees.includes(filters.userId)
            );
        }

        if (filters.startDate && filters.endDate) {
            const startDate = new Date(filters.startDate);
            const endDate = new Date(filters.endDate);

            eventList = eventList.filter(event => {
                if (!event.startTime) return false;
                return event.startTime >= startDate && event.startTime <= endDate;
            });
        }

        if (filters.type) {
            const types = Array.isArray(filters.type) ? filters.type : [filters.type];
            eventList = eventList.filter(event => types.includes(event.type));
        }

        if (filters.status) {
            const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
            eventList = eventList.filter(event => statuses.includes(event.status));
        }

        if (filters.search) {
            const searchTerm = filters.search.toLowerCase();
            eventList = eventList.filter(event =>
                event.title.toLowerCase().includes(searchTerm) ||
                event.description.toLowerCase().includes(searchTerm) ||
                event.location.toLowerCase().includes(searchTerm)
            );
        }

        // Sort by start time
        eventList.sort((a, b) => {
            if (!a.startTime && !b.startTime) return 0;
            if (!a.startTime) return 1;
            if (!b.startTime) return -1;
            return a.startTime - b.startTime;
        });

        // Apply pagination
        if (filters.limit || filters.offset) {
            const offset = parseInt(filters.offset) || 0;
            const limit = parseInt(filters.limit) || 50;
            eventList = eventList.slice(offset, offset + limit);
        }

        return eventList;
    }

    getTodaysEvents(userId) {
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

        return this.getEvents({
            userId: userId,
            startDate: startOfDay,
            endDate: endOfDay
        });
    }

    getUpcomingEvents(userId, days = 7) {
        const now = new Date();
        const futureDate = new Date(now.getTime() + (days * 24 * 60 * 60 * 1000));

        return this.getEvents({
            userId: userId,
            startDate: now,
            endDate: futureDate
        });
    }

    // =============================================================================
    // RECURRING EVENTS
    // =============================================================================

    generateRecurringEvents(parentEvent) {
        if (!parentEvent.recurring || !parentEvent.recurrencePattern) return;

        const pattern = parentEvent.recurrencePattern;
        const startDate = new Date(parentEvent.startTime);
        const endDate = parentEvent.recurrenceEnd || new Date(Date.now() + (365 * 24 * 60 * 60 * 1000)); // 1 year default

        let currentDate = new Date(startDate);
        const instances = [];

        while (currentDate <= endDate && instances.length < 100) { // Max 100 instances
            if (currentDate > startDate) { // Skip the original event
                const instanceId = crypto.randomUUID();
                const duration = parentEvent.endTime - parentEvent.startTime;

                const instance = {
                    ...parentEvent,
                    id: instanceId,
                    parentEventId: parentEvent.id,
                    startTime: new Date(currentDate),
                    endTime: new Date(currentDate.getTime() + duration),
                    title: `${parentEvent.title} (Recurring)`,
                    createdAt: new Date()
                };

                events.set(instanceId, instance);
                instances.push(instance);
            }

            // Calculate next occurrence
            switch (pattern.type) {
                case RECURRENCE_TYPES.DAILY:
                    currentDate.setDate(currentDate.getDate() + (pattern.interval || 1));
                    break;
                case RECURRENCE_TYPES.WEEKLY:
                    currentDate.setDate(currentDate.getDate() + (7 * (pattern.interval || 1)));
                    break;
                case RECURRENCE_TYPES.MONTHLY:
                    currentDate.setMonth(currentDate.getMonth() + (pattern.interval || 1));
                    break;
                case RECURRENCE_TYPES.YEARLY:
                    currentDate.setFullYear(currentDate.getFullYear() + (pattern.interval || 1));
                    break;
                default:
                    return instances; // Stop if unknown pattern
            }
        }

        return instances;
    }

    updateRecurringEventSeries(parentEventId, updates, userId) {
        const parentEvent = events.get(parentEventId);
        if (!parentEvent) return null;

        // Update parent event
        const updatedParent = { ...parentEvent, ...updates, updatedAt: new Date() };
        events.set(parentEventId, updatedParent);

        // Update all instances
        const instances = Array.from(events.values()).filter(
            event => event.parentEventId === parentEventId
        );

        instances.forEach(instance => {
            const updatedInstance = { ...instance, ...updates, updatedAt: new Date() };
            events.set(instance.id, updatedInstance);
        });

        return { parent: updatedParent, instances: instances };
    }

    // =============================================================================
    // INVITATIONS & ATTENDEES
    // =============================================================================

    createEventInvitations(event) {
        event.attendees.forEach(attendeeId => {
            const invitationId = crypto.randomUUID();
            const invitation = {
                id: invitationId,
                eventId: event.id,
                inviteeId: attendeeId,
                inviterId: event.organizer,
                status: INVITATION_STATUS.PENDING,
                message: `You're invited to: ${event.title}`,
                sentAt: new Date(),
                respondedAt: null
            };

            invitations.set(invitationId, invitation);
        });
    }

    updateEventInvitations(event) {
        // Remove old invitations
        const oldInvitations = Array.from(invitations.values()).filter(
            inv => inv.eventId === event.id
        );
        oldInvitations.forEach(inv => invitations.delete(inv.id));

        // Create new invitations
        this.createEventInvitations(event);
    }

    cancelEventInvitations(eventId) {
        const eventInvitations = Array.from(invitations.values()).filter(
            inv => inv.eventId === eventId
        );

        eventInvitations.forEach(invitation => {
            invitation.status = 'cancelled';
            invitation.cancelledAt = new Date();
            invitations.set(invitation.id, invitation);
        });
    }

    respondToInvitation(invitationId, response, userId) {
        const invitation = invitations.get(invitationId);
        if (!invitation) {
            throw new Error('Invitation not found');
        }

        if (invitation.inviteeId !== userId) {
            throw new Error('Unauthorized');
        }

        invitation.status = response; // accepted, declined, tentative
        invitation.respondedAt = new Date();
        invitations.set(invitationId, invitation);

        return invitation;
    }

    getUserInvitations(userId, status = null) {
        let userInvitations = Array.from(invitations.values()).filter(
            inv => inv.inviteeId === userId
        );

        if (status) {
            userInvitations = userInvitations.filter(inv => inv.status === status);
        }

        // Include event details
        return userInvitations.map(invitation => ({
            ...invitation,
            event: this.getEvent(invitation.eventId)
        }));
    }

    // =============================================================================
    // AVAILABILITY & SCHEDULING
    // =============================================================================

    checkAvailability(userId, startTime, endTime, excludeEventId = null) {
        const userEvents = this.getEvents({ userId: userId });
        const checkStart = new Date(startTime);
        const checkEnd = new Date(endTime);

        const conflicts = userEvents.filter(event => {
            if (excludeEventId && event.id === excludeEventId) return false;
            if (!event.startTime || !event.endTime) return false;
            if (event.status === EVENT_STATUS.CANCELLED) return false;

            return (
                (checkStart >= event.startTime && checkStart < event.endTime) ||
                (checkEnd > event.startTime && checkEnd <= event.endTime) ||
                (checkStart <= event.startTime && checkEnd >= event.endTime)
            );
        });

        return {
            available: conflicts.length === 0,
            conflicts: conflicts
        };
    }

    findAvailableSlots(userIds, duration, startDate, endDate, workingHours = { start: '09:00', end: '17:00' }) {
        const availableSlots = [];
        const durationMs = duration * 60 * 1000; // Convert minutes to milliseconds

        let currentDate = new Date(startDate);

        while (currentDate < endDate) {
            // Check only working hours
            const dayStart = new Date(currentDate);
            const [startHour, startMinute] = workingHours.start.split(':');
            dayStart.setHours(parseInt(startHour), parseInt(startMinute), 0, 0);

            const dayEnd = new Date(currentDate);
            const [endHour, endMinute] = workingHours.end.split(':');
            dayEnd.setHours(parseInt(endHour), parseInt(endMinute), 0, 0);

            // Check slots in 30-minute intervals
            let slotStart = new Date(dayStart);

            while (slotStart < dayEnd) {
                const slotEnd = new Date(slotStart.getTime() + durationMs);

                if (slotEnd <= dayEnd) {
                    // Check if all users are available
                    const allAvailable = userIds.every(userId => {
                        const availability = this.checkAvailability(userId, slotStart, slotEnd);
                        return availability.available;
                    });

                    if (allAvailable) {
                        availableSlots.push({
                            startTime: new Date(slotStart),
                            endTime: new Date(slotEnd)
                        });
                    }
                }

                // Move to next 30-minute slot
                slotStart.setTime(slotStart.getTime() + (30 * 60 * 1000));
            }

            // Move to next day
            currentDate.setDate(currentDate.getDate() + 1);
        }

        return availableSlots.slice(0, 20); // Return first 20 available slots
    }

    // =============================================================================
    // CALENDAR ANALYTICS & STATS
    // =============================================================================

    getCalendarStats(userId, dateRange = '30d') {
        const days = parseInt(dateRange.replace('d', ''));
        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - (days * 24 * 60 * 60 * 1000));

        const userEvents = this.getEvents({
            userId: userId,
            startDate: startDate,
            endDate: endDate
        });

        const stats = {
            totalEvents: userEvents.length,
            byType: {},
            byStatus: {},
            totalHours: 0,
            averageEventDuration: 0,
            busyDays: 0,
            upcomingEvents: this.getUpcomingEvents(userId, 7).length,
            pendingInvitations: this.getUserInvitations(userId, INVITATION_STATUS.PENDING).length
        };

        // Calculate statistics
        userEvents.forEach(event => {
            // By type
            stats.byType[event.type] = (stats.byType[event.type] || 0) + 1;

            // By status
            stats.byStatus[event.status] = (stats.byStatus[event.status] || 0) + 1;

            // Duration calculation
            if (event.startTime && event.endTime && !event.allDay) {
                const duration = (event.endTime - event.startTime) / (1000 * 60 * 60); // hours
                stats.totalHours += duration;
            }
        });

        stats.averageEventDuration = userEvents.length > 0 ?
            (stats.totalHours / userEvents.length) : 0;

        // Calculate busy days
        const eventDates = userEvents
            .filter(event => event.startTime)
            .map(event => event.startTime.toDateString());
        stats.busyDays = [...new Set(eventDates)].length;

        return stats;
    }

    // =============================================================================
    // REMINDER & NOTIFICATION SYSTEM
    // =============================================================================

    scheduleEventReminders(event) {
        if (!event.reminders || !event.startTime) return;

        event.reminders.forEach(reminder => {
            const reminderTime = new Date(event.startTime.getTime() - (reminder.minutes * 60 * 1000));
            const notificationId = crypto.randomUUID();

            this.notificationQueue.set(notificationId, {
                id: notificationId,
                eventId: event.id,
                userId: event.organizer,
                type: reminder.type,
                scheduledFor: reminderTime,
                message: `Reminder: ${event.title}`,
                sent: false
            });
        });
    }

    getDueReminders() {
        const now = new Date();
        const dueReminders = Array.from(this.notificationQueue.values()).filter(
            notification => !notification.sent && notification.scheduledFor <= now
        );

        return dueReminders;
    }

    markReminderSent(notificationId) {
        const notification = this.notificationQueue.get(notificationId);
        if (notification) {
            notification.sent = true;
            notification.sentAt = new Date();
            this.notificationQueue.set(notificationId, notification);
        }
    }

    // =============================================================================
    // HELPER METHODS
    // =============================================================================

    hasCalendarPermission(calendarId, userId, permission = 'read') {
        const calendar = calendars.get(calendarId);
        if (!calendar) return false;

        // Owner has all permissions
        if (calendar.ownerId === userId) return true;

        // Check member permissions
        if (calendar.members.includes(userId)) {
            return calendar.permissions[permission] || false;
        }

        // Check visibility for read access
        if (permission === 'read') {
            return calendar.visibility === 'public' ||
                   (calendar.visibility === 'shared' && calendar.type === CALENDAR_TYPES.TEAM);
        }

        return false;
    }

    searchEvents(query, filters = {}) {
        const searchTerm = query.toLowerCase();
        let results = Array.from(events.values()).filter(event => !event.isDeleted);

        // Text search
        results = results.filter(event =>
            event.title.toLowerCase().includes(searchTerm) ||
            event.description.toLowerCase().includes(searchTerm) ||
            event.location.toLowerCase().includes(searchTerm) ||
            (event.attendees && event.attendees.some(attendee =>
                attendee.toLowerCase().includes(searchTerm)
            ))
        );

        // Apply additional filters
        if (filters.userId) {
            results = results.filter(event =>
                event.organizer === filters.userId ||
                event.attendees.includes(filters.userId)
            );
        }

        if (filters.type) {
            results = results.filter(event => event.type === filters.type);
        }

        if (filters.calendarId) {
            results = results.filter(event => event.calendarId === filters.calendarId);
        }

        return results.sort((a, b) => b.createdAt - a.createdAt);
    }

    // Export calendar data
    exportCalendar(calendarId, format = 'json', dateRange = null) {
        const calendar = calendars.get(calendarId);
        if (!calendar) {
            throw new Error('Calendar not found');
        }

        let calendarEvents = Array.from(events.values()).filter(
            event => event.calendarId === calendarId && !event.isDeleted
        );

        // Apply date range filter
        if (dateRange && dateRange.start && dateRange.end) {
            const startDate = new Date(dateRange.start);
            const endDate = new Date(dateRange.end);

            calendarEvents = calendarEvents.filter(event =>
                event.startTime >= startDate && event.startTime <= endDate
            );
        }

        const exportData = {
            calendar: calendar,
            events: calendarEvents,
            exportedAt: new Date(),
            format: format
        };

        return exportData;
    }
}

// Export constants and model
module.exports = {
    CalendarModel: new CalendarModel(),
    EVENT_TYPES,
    EVENT_STATUS,
    RECURRENCE_TYPES,
    INVITATION_STATUS,
    CALENDAR_TYPES
};
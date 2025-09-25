/**
 * CAOS CRM - Mobile Model
 * Optimized data structures and utilities for mobile clients
 */

class MobileModel {
    constructor() {
        this.deviceSessions = new Map();
        this.offlineCache = new Map();
        this.pushSubscriptions = new Map();
        this.locationData = new Map();
        this.uploadQueue = [];
    }

    // Device session management
    createDeviceSession(deviceId, userAgent, platform) {
        const session = {
            deviceId,
            userAgent,
            platform,
            lastSeen: new Date(),
            isOnline: true,
            syncStatus: 'connected',
            capabilities: {
                location: false,
                camera: false,
                pushNotifications: false,
                offline: false
            },
            preferences: {
                dataSaver: false,
                syncFrequency: 'real-time', // real-time, hourly, daily
                cacheSize: 50, // MB
                imageQuality: 'medium' // low, medium, high
            }
        };

        this.deviceSessions.set(deviceId, session);
        return session;
    }

    updateDeviceSession(deviceId, updates) {
        const session = this.deviceSessions.get(deviceId);
        if (session) {
            Object.assign(session, updates, { lastSeen: new Date() });
            this.deviceSessions.set(deviceId, session);
        }
        return session;
    }

    getDeviceSession(deviceId) {
        return this.deviceSessions.get(deviceId);
    }

    // Mobile-optimized data compression
    compressDataForMobile(data, compressionLevel = 'medium') {
        const compressed = {
            ...data,
            _compressed: true,
            _level: compressionLevel
        };

        switch (compressionLevel) {
            case 'high':
                // Remove non-essential fields
                delete compressed.detailed_description;
                delete compressed.internal_notes;
                delete compressed.audit_logs;
                break;
            case 'medium':
                // Truncate long text fields
                if (compressed.description && compressed.description.length > 200) {
                    compressed.description = compressed.description.substring(0, 200) + '...';
                }
                break;
            case 'low':
            default:
                // Minimal compression
                break;
        }

        return compressed;
    }

    // Offline cache management
    setCacheData(key, data, ttl = 3600000) { // 1 hour default
        const cacheEntry = {
            data,
            timestamp: Date.now(),
            ttl,
            accessed: 0
        };
        this.offlineCache.set(key, cacheEntry);
    }

    getCacheData(key) {
        const entry = this.offlineCache.get(key);
        if (!entry) return null;

        // Check if expired
        if (Date.now() - entry.timestamp > entry.ttl) {
            this.offlineCache.delete(key);
            return null;
        }

        entry.accessed++;
        return entry.data;
    }

    clearExpiredCache() {
        const now = Date.now();
        for (const [key, entry] of this.offlineCache.entries()) {
            if (now - entry.timestamp > entry.ttl) {
                this.offlineCache.delete(key);
            }
        }
    }

    // Push notification management
    registerPushSubscription(userId, deviceId, subscription) {
        const key = `${userId}-${deviceId}`;
        this.pushSubscriptions.set(key, {
            userId,
            deviceId,
            subscription,
            registered: new Date(),
            active: true
        });
        return true;
    }

    getPushSubscription(userId, deviceId) {
        const key = `${userId}-${deviceId}`;
        return this.pushSubscriptions.get(key);
    }

    // Location services
    updateLocation(userId, deviceId, location) {
        const locationData = {
            userId,
            deviceId,
            latitude: location.latitude,
            longitude: location.longitude,
            accuracy: location.accuracy,
            timestamp: new Date(),
            address: location.address || null
        };

        this.locationData.set(`${userId}-${deviceId}`, locationData);
        return locationData;
    }

    getLocation(userId, deviceId) {
        return this.locationData.get(`${userId}-${deviceId}`);
    }

    // File upload queue for mobile
    addToUploadQueue(file, userId, deviceId, metadata = {}) {
        const uploadItem = {
            id: this.generateId(),
            file,
            userId,
            deviceId,
            metadata,
            status: 'queued',
            created: new Date(),
            progress: 0,
            retries: 0
        };

        this.uploadQueue.push(uploadItem);
        return uploadItem.id;
    }

    getUploadQueue(userId, deviceId) {
        return this.uploadQueue.filter(item =>
            item.userId === userId && item.deviceId === deviceId
        );
    }

    updateUploadProgress(uploadId, progress, status) {
        const item = this.uploadQueue.find(item => item.id === uploadId);
        if (item) {
            item.progress = progress;
            item.status = status;
            item.updated = new Date();
        }
        return item;
    }

    // Mobile-specific lead data optimization
    getMobileLeadSummary(lead) {
        return {
            id: lead.id,
            name: lead.name,
            company: lead.company,
            status: lead.status,
            value: lead.value,
            priority: lead.priority,
            lastContact: lead.lastContact,
            nextAction: lead.nextAction,
            phone: lead.phone,
            email: lead.email,
            avatar: lead.avatar || null
        };
    }

    // Mobile dashboard summary
    getMobileDashboard(userId) {
        const dashboard = {
            summary: {
                totalLeads: 0,
                activeLeads: 0,
                closedDeals: 0,
                revenue: 0,
                tasksToday: 0,
                upcomingMeetings: 0
            },
            quickActions: [
                { id: 'new-lead', title: 'Add Lead', icon: 'user-plus' },
                { id: 'new-task', title: 'New Task', icon: 'plus' },
                { id: 'schedule-meeting', title: 'Schedule', icon: 'calendar' },
                { id: 'scan-card', title: 'Scan Card', icon: 'camera' }
            ],
            recentActivity: [],
            upcomingTasks: [],
            notifications: {
                unread: 0,
                urgent: 0
            }
        };

        return dashboard;
    }

    // Mobile calendar optimization
    getMobileCalendarEvents(startDate, endDate) {
        const events = [];
        // This would integrate with the calendar module
        return events.map(event => ({
            id: event.id,
            title: event.title,
            start: event.start,
            end: event.end,
            type: event.type,
            priority: event.priority,
            attendees: event.attendees ? event.attendees.length : 0,
            location: event.location
        }));
    }

    // Mobile task optimization
    getMobileTasks(userId, filters = {}) {
        const tasks = [];
        // This would integrate with the tasks module
        return tasks.map(task => ({
            id: task.id,
            title: task.title,
            status: task.status,
            priority: task.priority,
            dueDate: task.dueDate,
            assignedTo: task.assignedTo,
            progress: task.progress || 0,
            tags: task.tags || []
        }));
    }

    // Utility functions
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    }

    // Data synchronization status
    getSyncStatus(deviceId) {
        const session = this.getDeviceSession(deviceId);
        if (!session) return { status: 'unknown' };

        return {
            status: session.syncStatus,
            lastSync: session.lastSeen,
            pendingUploads: this.getUploadQueue(session.userId, deviceId).length,
            cacheSize: this.offlineCache.size,
            isOnline: session.isOnline
        };
    }

    // Performance optimization
    getOptimizedResponse(data, deviceSession) {
        if (!deviceSession) return data;

        const compressionLevel = deviceSession.preferences.dataSaver ? 'high' : 'medium';

        if (Array.isArray(data)) {
            return data.map(item => this.compressDataForMobile(item, compressionLevel));
        } else {
            return this.compressDataForMobile(data, compressionLevel);
        }
    }

    // Network condition adaptation
    adaptForNetworkCondition(data, networkType = 'wifi') {
        const adaptations = {
            'slow-2g': { compression: 'high', limit: 10 },
            '2g': { compression: 'high', limit: 20 },
            '3g': { compression: 'medium', limit: 50 },
            '4g': { compression: 'medium', limit: 100 },
            'wifi': { compression: 'low', limit: 200 }
        };

        const config = adaptations[networkType] || adaptations['3g'];

        if (Array.isArray(data) && data.length > config.limit) {
            data = data.slice(0, config.limit);
        }

        return this.compressDataForMobile(data, config.compression);
    }

    // Mobile-specific validation
    validateMobileRequest(req) {
        const errors = [];

        // Check device ID
        if (!req.headers['x-device-id']) {
            errors.push('Device ID is required');
        }

        // Check user agent
        if (!req.headers['user-agent']) {
            errors.push('User agent is required');
        }

        // Validate mobile-specific fields
        if (req.body.location) {
            if (!req.body.location.latitude || !req.body.location.longitude) {
                errors.push('Invalid location data');
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    // Statistics and analytics for mobile usage
    getMobileAnalytics(userId, period = '7d') {
        return {
            deviceCount: 0,
            sessionCount: 0,
            dataUsage: 0,
            offlineUsage: 0,
            popularFeatures: [],
            avgSessionDuration: 0,
            syncEfficiency: 100
        };
    }
}

// Export the mobile model instance
const mobileModel = new MobileModel();

module.exports = mobileModel;
// Tasks Model - In-memory implementation for task management
// Module 11: Tasks Management System

const crypto = require('crypto');

// In-memory task storage
const tasks = new Map();
const taskComments = new Map();
const taskAttachments = new Map();
const taskDependencies = new Map();
const taskHistory = new Map();

// Task status enum
const TASK_STATUS = {
    TODO: 'todo',
    IN_PROGRESS: 'in_progress',
    REVIEW: 'review',
    BLOCKED: 'blocked',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled'
};

// Task priority enum
const TASK_PRIORITY = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    URGENT: 'urgent'
};

// Task types
const TASK_TYPES = {
    GENERAL: 'general',
    LEAD_FOLLOW_UP: 'lead_follow_up',
    CAMPAIGN: 'campaign',
    MEETING: 'meeting',
    CALL: 'call',
    EMAIL: 'email',
    PROPOSAL: 'proposal',
    CONTRACT: 'contract',
    SUPPORT: 'support',
    PROJECT: 'project'
};

// Task category
const TASK_CATEGORIES = {
    SALES: 'sales',
    MARKETING: 'marketing',
    SUPPORT: 'support',
    ADMIN: 'admin',
    PROJECT: 'project',
    PERSONAL: 'personal'
};

// Recurrence patterns
const RECURRENCE_PATTERNS = {
    NONE: 'none',
    DAILY: 'daily',
    WEEKLY: 'weekly',
    MONTHLY: 'monthly',
    QUARTERLY: 'quarterly',
    YEARLY: 'yearly'
};

// Task activity types
const TASK_ACTIVITY_TYPES = {
    CREATED: 'created',
    UPDATED: 'updated',
    STATUS_CHANGED: 'status_changed',
    ASSIGNED: 'assigned',
    UNASSIGNED: 'unassigned',
    COMMENTED: 'commented',
    DUE_DATE_CHANGED: 'due_date_changed',
    PRIORITY_CHANGED: 'priority_changed',
    COMPLETED: 'completed',
    DELETED: 'deleted',
    ATTACHMENT_ADDED: 'attachment_added',
    DEPENDENCY_ADDED: 'dependency_added'
};

class TasksModel {
    constructor() {
        this.initializeSampleTasks();
    }

    initializeSampleTasks() {
        // Sample tasks for demonstration
        const sampleTasks = [
            {
                title: 'Follow up with Johnson Corp lead',
                description: 'Call to discuss proposal timeline and next steps',
                type: TASK_TYPES.LEAD_FOLLOW_UP,
                category: TASK_CATEGORIES.SALES,
                priority: TASK_PRIORITY.HIGH,
                status: TASK_STATUS.TODO,
                dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
                estimatedHours: 1,
                relatedEntityType: 'lead',
                relatedEntityId: 'sample-lead-1',
                tags: ['follow-up', 'hot-lead', 'sales']
            },
            {
                title: 'Prepare Q4 marketing campaign',
                description: 'Design and schedule email marketing campaign for Q4 products',
                type: TASK_TYPES.CAMPAIGN,
                category: TASK_CATEGORIES.MARKETING,
                priority: TASK_PRIORITY.MEDIUM,
                status: TASK_STATUS.IN_PROGRESS,
                dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week from now
                estimatedHours: 8,
                tags: ['marketing', 'campaign', 'q4']
            },
            {
                title: 'Team standup meeting',
                description: 'Weekly team standup to discuss progress and blockers',
                type: TASK_TYPES.MEETING,
                category: TASK_CATEGORIES.ADMIN,
                priority: TASK_PRIORITY.MEDIUM,
                status: TASK_STATUS.TODO,
                dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), // Tomorrow
                estimatedHours: 0.5,
                recurrencePattern: RECURRENCE_PATTERNS.WEEKLY,
                tags: ['meeting', 'team', 'weekly']
            }
        ];

        sampleTasks.forEach(taskData => {
            const task = this.createTask(taskData, 'system');
        });
    }

    // Task CRUD operations
    createTask(taskData, userId) {
        const taskId = crypto.randomUUID();
        const now = new Date();

        // Validate required fields
        if (!taskData.title) {
            throw new Error('Task title is required');
        }

        const task = {
            id: taskId,
            title: taskData.title,
            description: taskData.description || '',
            type: taskData.type || TASK_TYPES.GENERAL,
            category: taskData.category || TASK_CATEGORIES.ADMIN,
            priority: taskData.priority || TASK_PRIORITY.MEDIUM,
            status: taskData.status || TASK_STATUS.TODO,

            // Dates
            createdAt: now,
            updatedAt: now,
            dueDate: taskData.dueDate ? new Date(taskData.dueDate) : null,
            startDate: taskData.startDate ? new Date(taskData.startDate) : null,
            completedAt: null,

            // Assignment
            assignedTo: taskData.assignedTo || null,
            createdBy: userId,

            // Estimation and tracking
            estimatedHours: taskData.estimatedHours || 0,
            actualHours: 0,
            progress: 0, // 0-100

            // Relations
            relatedEntityType: taskData.relatedEntityType || null, // 'lead', 'campaign', 'product'
            relatedEntityId: taskData.relatedEntityId || null,
            parentTaskId: taskData.parentTaskId || null,

            // Organization
            tags: taskData.tags || [],
            labels: taskData.labels || [],

            // Recurrence
            recurrencePattern: taskData.recurrencePattern || RECURRENCE_PATTERNS.NONE,
            recurrenceEnd: taskData.recurrenceEnd ? new Date(taskData.recurrenceEnd) : null,

            // Metadata
            isArchived: false,
            isDeleted: false,

            // Custom fields
            customFields: taskData.customFields || {}
        };

        tasks.set(taskId, task);

        // Log activity
        this.logTaskActivity(taskId, TASK_ACTIVITY_TYPES.CREATED, userId, {
            message: `Task "${task.title}" created`
        });

        // Handle recurrence
        if (task.recurrencePattern !== RECURRENCE_PATTERNS.NONE) {
            this.generateRecurringTasks(task, userId);
        }

        return task;
    }

    getTask(taskId) {
        const task = tasks.get(taskId);
        if (!task || task.isDeleted) {
            return null;
        }
        return { ...task };
    }

    getAllTasks(filters = {}) {
        let taskList = Array.from(tasks.values())
            .filter(task => !task.isDeleted);

        // Apply filters
        if (filters.status) {
            taskList = taskList.filter(task => task.status === filters.status);
        }

        if (filters.priority) {
            taskList = taskList.filter(task => task.priority === filters.priority);
        }

        if (filters.assignedTo) {
            taskList = taskList.filter(task => task.assignedTo === filters.assignedTo);
        }

        if (filters.category) {
            taskList = taskList.filter(task => task.category === filters.category);
        }

        if (filters.type) {
            taskList = taskList.filter(task => task.type === filters.type);
        }

        if (filters.dueBefore) {
            const dueBefore = new Date(filters.dueBefore);
            taskList = taskList.filter(task =>
                task.dueDate && task.dueDate <= dueBefore
            );
        }

        if (filters.dueAfter) {
            const dueAfter = new Date(filters.dueAfter);
            taskList = taskList.filter(task =>
                task.dueDate && task.dueDate >= dueAfter
            );
        }

        if (filters.createdBy) {
            taskList = taskList.filter(task => task.createdBy === filters.createdBy);
        }

        if (filters.tags) {
            const filterTags = Array.isArray(filters.tags) ? filters.tags : [filters.tags];
            taskList = taskList.filter(task =>
                filterTags.some(tag => task.tags.includes(tag))
            );
        }

        if (filters.relatedEntityType && filters.relatedEntityId) {
            taskList = taskList.filter(task =>
                task.relatedEntityType === filters.relatedEntityType &&
                task.relatedEntityId === filters.relatedEntityId
            );
        }

        if (filters.search) {
            const searchTerm = filters.search.toLowerCase();
            taskList = taskList.filter(task =>
                task.title.toLowerCase().includes(searchTerm) ||
                task.description.toLowerCase().includes(searchTerm) ||
                task.tags.some(tag => tag.toLowerCase().includes(searchTerm))
            );
        }

        if (filters.isArchived !== undefined) {
            taskList = taskList.filter(task => task.isArchived === filters.isArchived);
        }

        // Sort tasks
        const sortBy = filters.sortBy || 'dueDate';
        const sortOrder = filters.sortOrder || 'asc';

        taskList.sort((a, b) => {
            let aValue, bValue;

            switch (sortBy) {
                case 'priority':
                    const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
                    aValue = priorityOrder[a.priority] || 0;
                    bValue = priorityOrder[b.priority] || 0;
                    break;
                case 'createdAt':
                case 'updatedAt':
                case 'dueDate':
                    aValue = a[sortBy] ? new Date(a[sortBy]) : new Date(0);
                    bValue = b[sortBy] ? new Date(b[sortBy]) : new Date(0);
                    break;
                case 'title':
                    aValue = a.title.toLowerCase();
                    bValue = b.title.toLowerCase();
                    break;
                case 'status':
                    const statusOrder = {
                        todo: 1,
                        in_progress: 2,
                        review: 3,
                        blocked: 4,
                        completed: 5,
                        cancelled: 6
                    };
                    aValue = statusOrder[a.status] || 0;
                    bValue = statusOrder[b.status] || 0;
                    break;
                default:
                    aValue = a[sortBy] || '';
                    bValue = b[sortBy] || '';
            }

            if (sortOrder === 'desc') {
                return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
            } else {
                return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
            }
        });

        // Pagination
        if (filters.limit || filters.offset) {
            const offset = parseInt(filters.offset) || 0;
            const limit = parseInt(filters.limit) || 50;
            taskList = taskList.slice(offset, offset + limit);
        }

        return taskList;
    }

    updateTask(taskId, updates, userId) {
        const task = tasks.get(taskId);
        if (!task || task.isDeleted) {
            throw new Error('Task not found');
        }

        const originalTask = { ...task };
        const now = new Date();

        // Track what changed for activity log
        const changes = {};

        // Update allowed fields
        const allowedUpdates = [
            'title', 'description', 'type', 'category', 'priority', 'status',
            'dueDate', 'startDate', 'assignedTo', 'estimatedHours', 'actualHours',
            'progress', 'tags', 'labels', 'customFields'
        ];

        allowedUpdates.forEach(field => {
            if (updates.hasOwnProperty(field) && updates[field] !== task[field]) {
                changes[field] = { from: task[field], to: updates[field] };

                if (field === 'dueDate' || field === 'startDate') {
                    task[field] = updates[field] ? new Date(updates[field]) : null;
                } else {
                    task[field] = updates[field];
                }
            }
        });

        // Handle status changes
        if (changes.status) {
            if (updates.status === TASK_STATUS.COMPLETED && originalTask.status !== TASK_STATUS.COMPLETED) {
                task.completedAt = now;
                task.progress = 100;
                this.logTaskActivity(taskId, TASK_ACTIVITY_TYPES.COMPLETED, userId, {
                    message: `Task completed`
                });
            } else if (originalTask.status === TASK_STATUS.COMPLETED && updates.status !== TASK_STATUS.COMPLETED) {
                task.completedAt = null;
            }

            this.logTaskActivity(taskId, TASK_ACTIVITY_TYPES.STATUS_CHANGED, userId, {
                message: `Status changed from ${originalTask.status} to ${updates.status}`,
                changes: changes.status
            });
        }

        // Handle assignment changes
        if (changes.assignedTo) {
            const activityType = updates.assignedTo ? TASK_ACTIVITY_TYPES.ASSIGNED : TASK_ACTIVITY_TYPES.UNASSIGNED;
            const message = updates.assignedTo
                ? `Task assigned to ${updates.assignedTo}`
                : `Task unassigned`;

            this.logTaskActivity(taskId, activityType, userId, {
                message: message,
                changes: changes.assignedTo
            });
        }

        // Handle priority changes
        if (changes.priority) {
            this.logTaskActivity(taskId, TASK_ACTIVITY_TYPES.PRIORITY_CHANGED, userId, {
                message: `Priority changed from ${originalTask.priority} to ${updates.priority}`,
                changes: changes.priority
            });
        }

        // Handle due date changes
        if (changes.dueDate) {
            this.logTaskActivity(taskId, TASK_ACTIVITY_TYPES.DUE_DATE_CHANGED, userId, {
                message: `Due date changed`,
                changes: changes.dueDate
            });
        }

        task.updatedAt = now;
        tasks.set(taskId, task);

        // Log general update if other fields changed
        if (Object.keys(changes).length > 0) {
            this.logTaskActivity(taskId, TASK_ACTIVITY_TYPES.UPDATED, userId, {
                message: `Task updated`,
                changes: changes
            });
        }

        return task;
    }

    deleteTask(taskId, userId) {
        const task = tasks.get(taskId);
        if (!task || task.isDeleted) {
            throw new Error('Task not found');
        }

        // Soft delete
        task.isDeleted = true;
        task.deletedAt = new Date();
        task.deletedBy = userId;
        tasks.set(taskId, task);

        // Log activity
        this.logTaskActivity(taskId, TASK_ACTIVITY_TYPES.DELETED, userId, {
            message: `Task deleted`
        });

        return true;
    }

    // Task comments
    addTaskComment(taskId, commentData, userId) {
        const task = tasks.get(taskId);
        if (!task || task.isDeleted) {
            throw new Error('Task not found');
        }

        const commentId = crypto.randomUUID();
        const comment = {
            id: commentId,
            taskId: taskId,
            content: commentData.content,
            createdBy: userId,
            createdAt: new Date(),
            updatedAt: new Date(),
            isDeleted: false
        };

        if (!taskComments.has(taskId)) {
            taskComments.set(taskId, []);
        }

        taskComments.get(taskId).push(comment);

        // Log activity
        this.logTaskActivity(taskId, TASK_ACTIVITY_TYPES.COMMENTED, userId, {
            message: `Comment added`,
            commentId: commentId
        });

        return comment;
    }

    getTaskComments(taskId) {
        return taskComments.get(taskId) || [];
    }

    // Task dependencies
    addTaskDependency(taskId, dependsOnTaskId, userId) {
        const task = tasks.get(taskId);
        const dependsOnTask = tasks.get(dependsOnTaskId);

        if (!task || task.isDeleted) {
            throw new Error('Task not found');
        }

        if (!dependsOnTask || dependsOnTask.isDeleted) {
            throw new Error('Dependency task not found');
        }

        if (taskId === dependsOnTaskId) {
            throw new Error('Task cannot depend on itself');
        }

        if (!taskDependencies.has(taskId)) {
            taskDependencies.set(taskId, []);
        }

        const dependencies = taskDependencies.get(taskId);
        if (!dependencies.includes(dependsOnTaskId)) {
            dependencies.push(dependsOnTaskId);

            // Log activity
            this.logTaskActivity(taskId, TASK_ACTIVITY_TYPES.DEPENDENCY_ADDED, userId, {
                message: `Dependency added to task: ${dependsOnTask.title}`,
                dependencyTaskId: dependsOnTaskId
            });
        }

        return dependencies;
    }

    getTaskDependencies(taskId) {
        const dependencyIds = taskDependencies.get(taskId) || [];
        return dependencyIds.map(id => tasks.get(id)).filter(Boolean);
    }

    // Task activity logging
    logTaskActivity(taskId, activityType, userId, metadata = {}) {
        if (!taskHistory.has(taskId)) {
            taskHistory.set(taskId, []);
        }

        const activity = {
            id: crypto.randomUUID(),
            taskId: taskId,
            type: activityType,
            userId: userId,
            timestamp: new Date(),
            metadata: metadata
        };

        taskHistory.get(taskId).push(activity);
        return activity;
    }

    getTaskHistory(taskId) {
        return taskHistory.get(taskId) || [];
    }

    // Dashboard and analytics
    getTaskStats(userId = null, filters = {}) {
        let taskList = Array.from(tasks.values())
            .filter(task => !task.isDeleted);

        if (userId) {
            taskList = taskList.filter(task =>
                task.assignedTo === userId || task.createdBy === userId
            );
        }

        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 7);

        const stats = {
            total: taskList.length,
            byStatus: {},
            byPriority: {},
            byCategory: {},
            overdue: 0,
            dueToday: 0,
            dueThisWeek: 0,
            completed: 0,
            completedThisWeek: 0,
            avgCompletionTime: 0,
            productivityScore: 0
        };

        // Calculate statistics
        Object.values(TASK_STATUS).forEach(status => {
            stats.byStatus[status] = 0;
        });

        Object.values(TASK_PRIORITY).forEach(priority => {
            stats.byPriority[priority] = 0;
        });

        Object.values(TASK_CATEGORIES).forEach(category => {
            stats.byCategory[category] = 0;
        });

        let totalCompletionTime = 0;
        let completedTasksCount = 0;

        taskList.forEach(task => {
            stats.byStatus[task.status]++;
            stats.byPriority[task.priority]++;
            stats.byCategory[task.category]++;

            if (task.status === TASK_STATUS.COMPLETED) {
                stats.completed++;

                if (task.completedAt >= startOfWeek && task.completedAt < endOfWeek) {
                    stats.completedThisWeek++;
                }

                if (task.completedAt && task.createdAt) {
                    totalCompletionTime += (task.completedAt - task.createdAt);
                    completedTasksCount++;
                }
            }

            if (task.dueDate) {
                const today = new Date();
                today.setHours(23, 59, 59, 999);

                if (task.dueDate < now && task.status !== TASK_STATUS.COMPLETED) {
                    stats.overdue++;
                }

                if (task.dueDate.toDateString() === now.toDateString()) {
                    stats.dueToday++;
                }

                if (task.dueDate >= startOfWeek && task.dueDate < endOfWeek) {
                    stats.dueThisWeek++;
                }
            }
        });

        // Calculate average completion time in hours
        if (completedTasksCount > 0) {
            stats.avgCompletionTime = Math.round(totalCompletionTime / completedTasksCount / (1000 * 60 * 60));
        }

        // Calculate productivity score (0-100)
        const completionRate = stats.total > 0 ? (stats.completed / stats.total) * 100 : 0;
        const onTimeRate = stats.overdue > 0 ? Math.max(0, 100 - (stats.overdue / stats.total) * 100) : 100;
        stats.productivityScore = Math.round((completionRate + onTimeRate) / 2);

        return stats;
    }

    getUpcomingTasks(userId = null, days = 7) {
        const now = new Date();
        const futureDate = new Date(now);
        futureDate.setDate(now.getDate() + days);

        let taskList = Array.from(tasks.values())
            .filter(task =>
                !task.isDeleted &&
                task.status !== TASK_STATUS.COMPLETED &&
                task.status !== TASK_STATUS.CANCELLED &&
                task.dueDate &&
                task.dueDate >= now &&
                task.dueDate <= futureDate
            );

        if (userId) {
            taskList = taskList.filter(task => task.assignedTo === userId);
        }

        // Sort by due date
        taskList.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

        return taskList;
    }

    // Recurring tasks
    generateRecurringTasks(parentTask, userId) {
        if (parentTask.recurrencePattern === RECURRENCE_PATTERNS.NONE) {
            return [];
        }

        const recurringTasks = [];
        const now = new Date();
        let nextDate = new Date(parentTask.dueDate || now);
        const endDate = parentTask.recurrenceEnd || new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());

        // Generate up to 10 recurring instances or until end date
        for (let i = 0; i < 10 && nextDate <= endDate; i++) {
            switch (parentTask.recurrencePattern) {
                case RECURRENCE_PATTERNS.DAILY:
                    nextDate.setDate(nextDate.getDate() + 1);
                    break;
                case RECURRENCE_PATTERNS.WEEKLY:
                    nextDate.setDate(nextDate.getDate() + 7);
                    break;
                case RECURRENCE_PATTERNS.MONTHLY:
                    nextDate.setMonth(nextDate.getMonth() + 1);
                    break;
                case RECURRENCE_PATTERNS.QUARTERLY:
                    nextDate.setMonth(nextDate.getMonth() + 3);
                    break;
                case RECURRENCE_PATTERNS.YEARLY:
                    nextDate.setFullYear(nextDate.getFullYear() + 1);
                    break;
            }

            if (nextDate <= endDate) {
                const recurringTask = {
                    ...parentTask,
                    id: undefined, // Will be generated in createTask
                    parentTaskId: parentTask.id,
                    dueDate: new Date(nextDate),
                    status: TASK_STATUS.TODO,
                    progress: 0,
                    actualHours: 0,
                    completedAt: null,
                    recurrencePattern: RECURRENCE_PATTERNS.NONE // Recurring instances don't recurse
                };

                const createdTask = this.createTask(recurringTask, userId);
                recurringTasks.push(createdTask);
            }
        }

        return recurringTasks;
    }

    // Bulk operations
    bulkUpdateTasks(taskIds, updates, userId) {
        const updatedTasks = [];
        const errors = [];

        taskIds.forEach(taskId => {
            try {
                const updatedTask = this.updateTask(taskId, updates, userId);
                updatedTasks.push(updatedTask);
            } catch (error) {
                errors.push({ taskId, error: error.message });
            }
        });

        return { updatedTasks, errors };
    }

    bulkDeleteTasks(taskIds, userId) {
        const deletedTasks = [];
        const errors = [];

        taskIds.forEach(taskId => {
            try {
                this.deleteTask(taskId, userId);
                deletedTasks.push(taskId);
            } catch (error) {
                errors.push({ taskId, error: error.message });
            }
        });

        return { deletedTasks, errors };
    }

    // Search and filtering
    searchTasks(query, filters = {}) {
        if (!query || query.trim().length === 0) {
            return this.getAllTasks(filters);
        }

        const searchTerms = query.toLowerCase().split(' ');
        let taskList = Array.from(tasks.values())
            .filter(task => !task.isDeleted);

        // Apply search
        taskList = taskList.filter(task => {
            const searchableText = [
                task.title,
                task.description,
                task.type,
                task.category,
                task.assignedTo || '',
                ...task.tags,
                ...task.labels
            ].join(' ').toLowerCase();

            return searchTerms.every(term => searchableText.includes(term));
        });

        // Apply additional filters
        return this.getAllTasks({ ...filters, tasks: taskList });
    }
}

module.exports = new TasksModel();
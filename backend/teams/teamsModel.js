const crypto = require('crypto');

// In-memory storage for teams
const teams = new Map();
const teamMembers = new Map(); // teamId -> array of member objects
const invitations = new Map(); // invitationId -> invitation object
const teamMetrics = new Map(); // teamId -> metrics object

// Helper function to generate IDs
function generateId(prefix = 'team') {
    return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

// Role definitions with permissions
const ROLES = {
    OWNER: {
        name: 'Owner',
        level: 100,
        permissions: ['*'], // All permissions
        description: 'Full control over team and all resources'
    },
    ADMIN: {
        name: 'Admin',
        level: 80,
        permissions: [
            'manage_team', 'manage_members', 'manage_settings',
            'view_all', 'edit_all', 'delete_all', 'manage_roles'
        ],
        description: 'Can manage team settings and members'
    },
    MANAGER: {
        name: 'Manager',
        level: 60,
        permissions: [
            'view_all', 'edit_all', 'assign_tasks', 'manage_projects',
            'view_reports', 'manage_campaigns', 'manage_leads'
        ],
        description: 'Can manage projects and assignments'
    },
    MEMBER: {
        name: 'Member',
        level: 40,
        permissions: [
            'view_assigned', 'edit_assigned', 'create_tasks',
            'manage_own_leads', 'view_team_calendar'
        ],
        description: 'Can work on assigned tasks and resources'
    },
    VIEWER: {
        name: 'Viewer',
        level: 20,
        permissions: ['view_assigned', 'view_public'],
        description: 'Read-only access to assigned resources'
    }
};

// Team model
class TeamsModel {
    // Create a new team
    static async create(teamData, ownerId) {
        const team = {
            id: generateId('team'),
            name: teamData.name,
            description: teamData.description || '',
            logo: teamData.logo || null,
            industry: teamData.industry || '',
            size: teamData.size || 'small', // small, medium, large, enterprise
            timezone: teamData.timezone || 'UTC',
            settings: {
                visibility: teamData.visibility || 'private', // public, private
                joinPolicy: teamData.joinPolicy || 'invite', // open, request, invite
                allowGuests: teamData.allowGuests || false,
                dataSharing: teamData.dataSharing || 'team', // none, team, organization
                notifications: {
                    email: true,
                    slack: false,
                    teams: false
                },
                features: {
                    campaigns: true,
                    analytics: true,
                    reports: true,
                    calendar: true,
                    tasks: true
                },
                branding: {
                    primaryColor: teamData.primaryColor || '#4F46E5',
                    secondaryColor: teamData.secondaryColor || '#818CF8'
                }
            },
            metadata: {
                createdAt: new Date().toISOString(),
                createdBy: ownerId,
                updatedAt: new Date().toISOString(),
                updatedBy: ownerId,
                isActive: true,
                memberCount: 1,
                projectCount: 0,
                leadCount: 0
            },
            subscription: {
                plan: teamData.plan || 'free', // free, starter, professional, enterprise
                seats: teamData.seats || 5,
                usedSeats: 1,
                billingCycle: teamData.billingCycle || 'monthly',
                renewalDate: null,
                features: []
            },
            hierarchy: {
                parentTeamId: teamData.parentTeamId || null,
                childTeamIds: [],
                level: teamData.parentTeamId ? 2 : 1
            }
        };

        teams.set(team.id, team);

        // Add owner as first member
        const ownerMember = {
            id: generateId('member'),
            teamId: team.id,
            userId: ownerId,
            role: 'OWNER',
            permissions: ROLES.OWNER.permissions,
            joinedAt: new Date().toISOString(),
            isActive: true,
            title: teamData.ownerTitle || 'Team Owner',
            department: teamData.ownerDepartment || '',
            reportingTo: null
        };

        if (!teamMembers.has(team.id)) {
            teamMembers.set(team.id, []);
        }
        teamMembers.get(team.id).push(ownerMember);

        // Initialize team metrics
        teamMetrics.set(team.id, {
            teamId: team.id,
            performance: {
                tasksCompleted: 0,
                leadsConverted: 0,
                campaignsSent: 0,
                revenueGenerated: 0,
                averageResponseTime: 0,
                customerSatisfaction: 0
            },
            activity: {
                dailyActiveUsers: 0,
                weeklyActiveUsers: 0,
                monthlyActiveUsers: 1,
                lastActivityAt: new Date().toISOString()
            },
            resources: {
                totalProjects: 0,
                activeProjects: 0,
                totalTasks: 0,
                openTasks: 0,
                totalLeads: 0,
                activeLeads: 0
            }
        });

        return team;
    }

    // Get team by ID
    static async getById(teamId) {
        const team = teams.get(teamId);
        if (!team) {
            return null;
        }

        // Include members count and metrics
        const members = teamMembers.get(teamId) || [];
        const metrics = teamMetrics.get(teamId) || {};

        return {
            ...team,
            metadata: {
                ...team.metadata,
                memberCount: members.length
            },
            metrics
        };
    }

    // Get all teams for a user
    static async getUserTeams(userId) {
        const userTeams = [];

        for (const [teamId, team] of teams.entries()) {
            const members = teamMembers.get(teamId) || [];
            const userMember = members.find(m => m.userId === userId && m.isActive);

            if (userMember) {
                userTeams.push({
                    ...team,
                    userRole: userMember.role,
                    userPermissions: userMember.permissions,
                    joinedAt: userMember.joinedAt
                });
            }
        }

        return userTeams.sort((a, b) =>
            new Date(b.metadata.updatedAt) - new Date(a.metadata.updatedAt)
        );
    }

    // Update team
    static async update(teamId, updates, userId) {
        const team = teams.get(teamId);
        if (!team) {
            throw new Error('Team not found');
        }

        // Update allowed fields
        const allowedFields = ['name', 'description', 'logo', 'industry', 'size', 'timezone'];
        allowedFields.forEach(field => {
            if (updates[field] !== undefined) {
                team[field] = updates[field];
            }
        });

        // Update settings if provided
        if (updates.settings) {
            team.settings = { ...team.settings, ...updates.settings };
        }

        // Update metadata
        team.metadata.updatedAt = new Date().toISOString();
        team.metadata.updatedBy = userId;

        teams.set(teamId, team);
        return team;
    }

    // Delete team
    static async delete(teamId) {
        const team = teams.get(teamId);
        if (!team) {
            throw new Error('Team not found');
        }

        // Soft delete
        team.metadata.isActive = false;
        team.metadata.deletedAt = new Date().toISOString();
        teams.set(teamId, team);

        return { message: 'Team deleted successfully' };
    }

    // Add team member
    static async addMember(teamId, memberData) {
        const team = teams.get(teamId);
        if (!team) {
            throw new Error('Team not found');
        }

        if (!teamMembers.has(teamId)) {
            teamMembers.set(teamId, []);
        }

        const members = teamMembers.get(teamId);

        // Check if user is already a member
        const existingMember = members.find(m => m.userId === memberData.userId);
        if (existingMember) {
            throw new Error('User is already a team member');
        }

        // Check team seat limit
        if (team.subscription.usedSeats >= team.subscription.seats) {
            throw new Error('Team has reached its seat limit');
        }

        const roleConfig = ROLES[memberData.role] || ROLES.MEMBER;

        const newMember = {
            id: generateId('member'),
            teamId,
            userId: memberData.userId,
            role: memberData.role || 'MEMBER',
            permissions: roleConfig.permissions,
            joinedAt: new Date().toISOString(),
            invitedBy: memberData.invitedBy,
            isActive: true,
            title: memberData.title || '',
            department: memberData.department || '',
            reportingTo: memberData.reportingTo || null,
            settings: {
                notifications: {
                    email: true,
                    inApp: true
                }
            }
        };

        members.push(newMember);
        teamMembers.set(teamId, members);

        // Update team metadata
        team.metadata.memberCount = members.length;
        team.subscription.usedSeats = members.filter(m => m.isActive).length;
        team.metadata.updatedAt = new Date().toISOString();
        teams.set(teamId, team);

        return newMember;
    }

    // Update team member
    static async updateMember(teamId, memberId, updates) {
        const members = teamMembers.get(teamId) || [];
        const memberIndex = members.findIndex(m => m.id === memberId);

        if (memberIndex === -1) {
            throw new Error('Team member not found');
        }

        const member = members[memberIndex];

        // Update role and permissions if role changed
        if (updates.role && updates.role !== member.role) {
            const roleConfig = ROLES[updates.role];
            if (!roleConfig) {
                throw new Error('Invalid role');
            }

            // Prevent removing last owner
            if (member.role === 'OWNER') {
                const ownerCount = members.filter(m => m.role === 'OWNER' && m.isActive).length;
                if (ownerCount <= 1) {
                    throw new Error('Cannot remove last team owner');
                }
            }

            member.role = updates.role;
            member.permissions = roleConfig.permissions;
        }

        // Update other fields
        ['title', 'department', 'reportingTo'].forEach(field => {
            if (updates[field] !== undefined) {
                member[field] = updates[field];
            }
        });

        members[memberIndex] = member;
        teamMembers.set(teamId, members);

        return member;
    }

    // Remove team member
    static async removeMember(teamId, memberId) {
        const members = teamMembers.get(teamId) || [];
        const memberIndex = members.findIndex(m => m.id === memberId);

        if (memberIndex === -1) {
            throw new Error('Team member not found');
        }

        const member = members[memberIndex];

        // Prevent removing last owner
        if (member.role === 'OWNER') {
            const ownerCount = members.filter(m => m.role === 'OWNER' && m.isActive).length;
            if (ownerCount <= 1) {
                throw new Error('Cannot remove last team owner');
            }
        }

        // Soft delete
        member.isActive = false;
        member.leftAt = new Date().toISOString();
        members[memberIndex] = member;
        teamMembers.set(teamId, members);

        // Update team metadata
        const team = teams.get(teamId);
        if (team) {
            team.metadata.memberCount = members.filter(m => m.isActive).length;
            team.subscription.usedSeats = members.filter(m => m.isActive).length;
            team.metadata.updatedAt = new Date().toISOString();
            teams.set(teamId, team);
        }

        return { message: 'Team member removed successfully' };
    }

    // Get team members
    static async getMembers(teamId, options = {}) {
        const members = teamMembers.get(teamId) || [];
        let filteredMembers = [...members];

        // Apply filters
        if (options.role) {
            filteredMembers = filteredMembers.filter(m => m.role === options.role);
        }

        if (options.department) {
            filteredMembers = filteredMembers.filter(m =>
                m.department === options.department
            );
        }

        if (options.isActive !== undefined) {
            filteredMembers = filteredMembers.filter(m =>
                m.isActive === options.isActive
            );
        }

        // Sort by join date
        filteredMembers.sort((a, b) =>
            new Date(a.joinedAt) - new Date(b.joinedAt)
        );

        return filteredMembers;
    }

    // Create team invitation
    static async createInvitation(teamId, invitationData, invitedBy) {
        const team = teams.get(teamId);
        if (!team) {
            throw new Error('Team not found');
        }

        const invitation = {
            id: generateId('invite'),
            teamId,
            teamName: team.name,
            email: invitationData.email,
            role: invitationData.role || 'MEMBER',
            message: invitationData.message || '',
            invitedBy,
            status: 'pending', // pending, accepted, declined, expired
            token: crypto.randomBytes(32).toString('hex'),
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
            acceptedAt: null,
            declinedAt: null
        };

        invitations.set(invitation.id, invitation);
        return invitation;
    }

    // Accept invitation
    static async acceptInvitation(token, userId) {
        let invitation = null;

        for (const [id, inv] of invitations.entries()) {
            if (inv.token === token && inv.status === 'pending') {
                invitation = inv;
                break;
            }
        }

        if (!invitation) {
            throw new Error('Invalid or expired invitation');
        }

        // Check expiration
        if (new Date(invitation.expiresAt) < new Date()) {
            invitation.status = 'expired';
            invitations.set(invitation.id, invitation);
            throw new Error('Invitation has expired');
        }

        // Add member to team
        const memberData = {
            userId,
            role: invitation.role,
            invitedBy: invitation.invitedBy
        };

        const member = await this.addMember(invitation.teamId, memberData);

        // Update invitation status
        invitation.status = 'accepted';
        invitation.acceptedAt = new Date().toISOString();
        invitation.acceptedBy = userId;
        invitations.set(invitation.id, invitation);

        return {
            team: teams.get(invitation.teamId),
            member
        };
    }

    // Get team invitations
    static async getInvitations(teamId, status = 'all') {
        const teamInvitations = [];

        for (const [id, invitation] of invitations.entries()) {
            if (invitation.teamId === teamId) {
                if (status === 'all' || invitation.status === status) {
                    teamInvitations.push(invitation);
                }
            }
        }

        return teamInvitations.sort((a, b) =>
            new Date(b.createdAt) - new Date(a.createdAt)
        );
    }

    // Get team hierarchy
    static async getHierarchy(teamId) {
        const team = teams.get(teamId);
        if (!team) {
            throw new Error('Team not found');
        }

        const hierarchy = {
            current: team,
            parent: null,
            children: [],
            siblings: []
        };

        // Get parent team
        if (team.hierarchy.parentTeamId) {
            hierarchy.parent = teams.get(team.hierarchy.parentTeamId);
        }

        // Get child teams
        for (const childId of team.hierarchy.childTeamIds) {
            const childTeam = teams.get(childId);
            if (childTeam && childTeam.metadata.isActive) {
                hierarchy.children.push(childTeam);
            }
        }

        // Get sibling teams
        if (hierarchy.parent) {
            for (const siblingId of hierarchy.parent.hierarchy.childTeamIds) {
                if (siblingId !== teamId) {
                    const siblingTeam = teams.get(siblingId);
                    if (siblingTeam && siblingTeam.metadata.isActive) {
                        hierarchy.siblings.push(siblingTeam);
                    }
                }
            }
        }

        return hierarchy;
    }

    // Update team metrics
    static async updateMetrics(teamId, metricUpdates) {
        const metrics = teamMetrics.get(teamId) || {
            teamId,
            performance: {},
            activity: {},
            resources: {}
        };

        // Update performance metrics
        if (metricUpdates.performance) {
            metrics.performance = { ...metrics.performance, ...metricUpdates.performance };
        }

        // Update activity metrics
        if (metricUpdates.activity) {
            metrics.activity = { ...metrics.activity, ...metricUpdates.activity };
            metrics.activity.lastActivityAt = new Date().toISOString();
        }

        // Update resource metrics
        if (metricUpdates.resources) {
            metrics.resources = { ...metrics.resources, ...metricUpdates.resources };
        }

        teamMetrics.set(teamId, metrics);
        return metrics;
    }

    // Get team metrics
    static async getMetrics(teamId, period = 'month') {
        const metrics = teamMetrics.get(teamId);
        if (!metrics) {
            return null;
        }

        // In production, this would aggregate data based on the period
        // For now, return current metrics
        return {
            ...metrics,
            period,
            calculated: new Date().toISOString()
        };
    }

    // Check user permission
    static async checkPermission(teamId, userId, permission) {
        const members = teamMembers.get(teamId) || [];
        const member = members.find(m => m.userId === userId && m.isActive);

        if (!member) {
            return false;
        }

        // Check if user has wildcard permission (owner)
        if (member.permissions.includes('*')) {
            return true;
        }

        // Check specific permission
        return member.permissions.includes(permission);
    }

    // Get user role in team
    static async getUserRole(teamId, userId) {
        const members = teamMembers.get(teamId) || [];
        const member = members.find(m => m.userId === userId && m.isActive);

        if (!member) {
            return null;
        }

        return {
            role: member.role,
            roleConfig: ROLES[member.role],
            permissions: member.permissions
        };
    }

    // Search teams
    static async search(query, options = {}) {
        const searchResults = [];
        const searchTerm = query.toLowerCase();

        for (const [teamId, team] of teams.entries()) {
            if (!team.metadata.isActive) continue;

            // Search in name and description
            if (team.name.toLowerCase().includes(searchTerm) ||
                team.description.toLowerCase().includes(searchTerm) ||
                team.industry.toLowerCase().includes(searchTerm)) {

                searchResults.push(team);
            }
        }

        // Apply filters
        let filteredResults = [...searchResults];

        if (options.size) {
            filteredResults = filteredResults.filter(t => t.size === options.size);
        }

        if (options.industry) {
            filteredResults = filteredResults.filter(t =>
                t.industry === options.industry
            );
        }

        if (options.visibility) {
            filteredResults = filteredResults.filter(t =>
                t.settings.visibility === options.visibility
            );
        }

        // Sort by relevance (name matches first)
        filteredResults.sort((a, b) => {
            const aNameMatch = a.name.toLowerCase().includes(searchTerm);
            const bNameMatch = b.name.toLowerCase().includes(searchTerm);

            if (aNameMatch && !bNameMatch) return -1;
            if (!aNameMatch && bNameMatch) return 1;

            return new Date(b.metadata.updatedAt) - new Date(a.metadata.updatedAt);
        });

        // Apply pagination
        const page = options.page || 1;
        const limit = options.limit || 10;
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;

        return {
            teams: filteredResults.slice(startIndex, endIndex),
            total: filteredResults.length,
            page,
            totalPages: Math.ceil(filteredResults.length / limit)
        };
    }

    // Get team statistics
    static async getStatistics() {
        const stats = {
            totalTeams: 0,
            activeTeams: 0,
            totalMembers: 0,
            averageTeamSize: 0,
            teamsBySize: {
                small: 0,
                medium: 0,
                large: 0,
                enterprise: 0
            },
            teamsByPlan: {
                free: 0,
                starter: 0,
                professional: 0,
                enterprise: 0
            }
        };

        for (const [teamId, team] of teams.entries()) {
            stats.totalTeams++;

            if (team.metadata.isActive) {
                stats.activeTeams++;
                stats.teamsBySize[team.size]++;
                stats.teamsByPlan[team.subscription.plan]++;

                const members = teamMembers.get(teamId) || [];
                stats.totalMembers += members.filter(m => m.isActive).length;
            }
        }

        if (stats.activeTeams > 0) {
            stats.averageTeamSize = Math.round(stats.totalMembers / stats.activeTeams);
        }

        return stats;
    }
}

module.exports = TeamsModel;
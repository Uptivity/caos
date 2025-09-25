// Authentication Service with MySQL Database Support
// Replaces in-memory auth storage with persistent MySQL storage

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const DatabaseService = require('./DatabaseService');
const { logger } = require('../utils/secureLogger');

class AuthService {
    constructor() {
        this.refreshTokens = new Set(); // Keep refresh tokens in memory for now
        this.BCRYPT_ROUNDS = 12;
    }

    /**
     * Initialize the auth service
     */
    async initialize() {
        await DatabaseService.initialize();
        logger.info('AuthService initialized with MySQL database');
    }

    /**
     * Register a new user
     * @param {object} userData - User registration data
     * @returns {object} Created user and tokens
     */
    async register(userData) {
        try {
            // Check if user already exists
            const existingUser = await this.findByEmail(userData.email);
            if (existingUser) {
                throw new Error('User already exists with this email address');
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(userData.password, this.BCRYPT_ROUNDS);

            // Prepare user data
            const userToCreate = {
                email: userData.email.toLowerCase(),
                password_hash: hashedPassword,
                first_name: userData.firstName,
                last_name: userData.lastName,
                role: userData.role || 'user',
                is_active: true,
                email_verified: false
            };

            // Create user in database
            const user = await DatabaseService.create('users', userToCreate);

            // Generate tokens
            const tokens = this.generateTokens(user.id, user.email);
            this.refreshTokens.add(tokens.refreshToken);

            // Return sanitized user data
            return {
                user: this.sanitizeUser(user),
                tokens
            };
        } catch (error) {
            logger.error('User registration failed', {
                error: error.message,
                email: userData.email
            });
            throw error;
        }
    }

    /**
     * Authenticate user login
     * @param {string} email - User email
     * @param {string} password - User password
     * @param {boolean} rememberMe - Extended session flag
     * @returns {object} User and tokens
     */
    async login(email, password, rememberMe = false) {
        try {
            // Find user by email
            const user = await this.findByEmail(email);
            if (!user) {
                throw new Error('Invalid email or password');
            }

            // Check if user is active
            if (!user.is_active) {
                throw new Error('Account has been deactivated');
            }

            // Verify password
            const validPassword = await bcrypt.compare(password, user.password_hash);
            if (!validPassword) {
                throw new Error('Invalid email or password');
            }

            // Update last login timestamp
            await DatabaseService.update('users', user.id, {
                last_login: new Date().toISOString()
            });

            // Generate tokens
            const expiresIn = rememberMe ? '30d' : process.env.JWT_EXPIRES_IN || '24h';
            const tokens = this.generateTokens(user.id, user.email, expiresIn);
            this.refreshTokens.add(tokens.refreshToken);

            // Get updated user data
            const updatedUser = await DatabaseService.findById('users', user.id);

            return {
                user: this.sanitizeUser(updatedUser),
                tokens: {
                    ...tokens,
                    expiresIn
                }
            };
        } catch (error) {
            logger.error('User login failed', {
                error: error.message,
                email: email
            });
            throw error;
        }
    }

    /**
     * Refresh access token
     * @param {string} refreshToken - Refresh token
     * @returns {object} New tokens
     */
    async refreshToken(refreshToken) {
        try {
            // Check if refresh token exists in store
            if (!this.refreshTokens.has(refreshToken)) {
                throw new Error('Invalid refresh token');
            }

            // Verify refresh token
            const decoded = this.verifyToken(refreshToken, 'refresh');

            // Find user
            const user = await DatabaseService.findById('users', decoded.userId);
            if (!user || !user.is_active) {
                this.refreshTokens.delete(refreshToken);
                throw new Error('User not found or inactive');
            }

            // Remove old refresh token and generate new tokens
            this.refreshTokens.delete(refreshToken);
            const tokens = this.generateTokens(user.id, user.email);
            this.refreshTokens.add(tokens.refreshToken);

            return tokens;
        } catch (error) {
            logger.error('Token refresh failed', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * User logout
     * @param {string} refreshToken - Refresh token to invalidate
     */
    async logout(refreshToken) {
        if (refreshToken) {
            this.refreshTokens.delete(refreshToken);
        }
    }

    /**
     * Get user profile
     * @param {string} userId - User ID
     * @returns {object} User profile
     */
    async getProfile(userId) {
        try {
            const user = await DatabaseService.findById('users', userId);
            if (!user || !user.is_active) {
                throw new Error('User not found or inactive');
            }

            return this.sanitizeUser(user);
        } catch (error) {
            logger.error('Failed to get user profile', {
                error: error.message,
                userId: userId
            });
            throw error;
        }
    }

    /**
     * Update user profile
     * @param {string} userId - User ID
     * @param {object} updates - Profile updates
     * @returns {object} Updated user profile
     */
    async updateProfile(userId, updates) {
        try {
            // Only allow specific fields to be updated
            const allowedUpdates = {
                first_name: updates.firstName,
                last_name: updates.lastName,
                company: updates.company
            };

            // Remove undefined values
            Object.keys(allowedUpdates).forEach(key => {
                if (allowedUpdates[key] === undefined) {
                    delete allowedUpdates[key];
                }
            });

            const user = await DatabaseService.update('users', userId, allowedUpdates);
            if (!user) {
                throw new Error('User not found or inactive');
            }

            return this.sanitizeUser(user);
        } catch (error) {
            logger.error('Failed to update user profile', {
                error: error.message,
                userId: userId
            });
            throw error;
        }
    }

    /**
     * Change user password
     * @param {string} userId - User ID
     * @param {string} currentPassword - Current password
     * @param {string} newPassword - New password
     */
    async changePassword(userId, currentPassword, newPassword) {
        try {
            const user = await DatabaseService.findById('users', userId);
            if (!user || !user.is_active) {
                throw new Error('User not found or inactive');
            }

            // Verify current password
            const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
            if (!validPassword) {
                throw new Error('Current password is incorrect');
            }

            // Hash new password
            const hashedNewPassword = await bcrypt.hash(newPassword, this.BCRYPT_ROUNDS);

            // Update password in database
            await DatabaseService.update('users', userId, {
                password_hash: hashedNewPassword
            });

            logger.info('Password changed successfully', { userId });
        } catch (error) {
            logger.error('Password change failed', {
                error: error.message,
                userId: userId
            });
            throw error;
        }
    }

    /**
     * Find user by email
     * @param {string} email - User email
     * @returns {object|null} User or null
     */
    async findByEmail(email) {
        try {
            const users = await DatabaseService.find('users', {
                email: email.toLowerCase()
            });
            return users.length > 0 ? users[0] : null;
        } catch (error) {
            logger.error('Failed to find user by email', {
                error: error.message,
                email: email
            });
            throw error;
        }
    }

    /**
     * Find user by ID
     * @param {string} userId - User ID
     * @returns {object|null} User or null
     */
    async findById(userId) {
        try {
            return await DatabaseService.findById('users', userId);
        } catch (error) {
            logger.error('Failed to find user by ID', {
                error: error.message,
                userId: userId
            });
            throw error;
        }
    }

    /**
     * Generate JWT tokens
     * @param {string} userId - User ID
     * @param {string} userEmail - User email
     * @param {string} accessExpiresIn - Access token expiration
     * @returns {object} Token pair
     */
    generateTokens(userId, userEmail, accessExpiresIn = null) {
        const JWT_SECRET = process.env.JWT_SECRET;
        if (!JWT_SECRET) {
            throw new Error('JWT_SECRET environment variable is required');
        }

        const expiresIn = accessExpiresIn || process.env.JWT_EXPIRES_IN || '24h';

        const payload = {
            userId,
            email: userEmail,
            iat: Math.floor(Date.now() / 1000)
        };

        const accessToken = jwt.sign(payload, JWT_SECRET, {
            expiresIn: expiresIn,
            issuer: 'caos-crm',
            audience: 'caos-crm-client'
        });

        const refreshToken = jwt.sign(
            { userId, type: 'refresh' },
            JWT_SECRET,
            {
                expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
                issuer: 'caos-crm',
                audience: 'caos-crm-client'
            }
        );

        return { accessToken, refreshToken };
    }

    /**
     * Verify JWT token
     * @param {string} token - JWT token
     * @param {string} type - Token type (access or refresh)
     * @returns {object} Decoded token
     */
    verifyToken(token, type = 'access') {
        const JWT_SECRET = process.env.JWT_SECRET;
        if (!JWT_SECRET) {
            throw new Error('JWT_SECRET environment variable is required');
        }

        try {
            const decoded = jwt.verify(token, JWT_SECRET, {
                issuer: 'caos-crm',
                audience: 'caos-crm-client'
            });

            if (type === 'refresh' && decoded.type !== 'refresh') {
                throw new Error('Invalid token type');
            }

            return decoded;
        } catch (error) {
            throw new Error('Invalid or expired token');
        }
    }

    /**
     * Remove sensitive fields from user object
     * @param {object} user - User object
     * @returns {object} Sanitized user object
     */
    sanitizeUser(user) {
        const { password_hash, ...sanitized } = user;
        return {
            ...sanitized,
            // Convert database field names to API format
            firstName: sanitized.first_name,
            lastName: sanitized.last_name,
            isActive: sanitized.is_active,
            emailVerified: sanitized.email_verified,
            lastLogin: sanitized.last_login,
            createdAt: sanitized.created_at,
            updatedAt: sanitized.updated_at
        };
    }

    /**
     * Get auth service health status
     * @returns {object} Health status
     */
    async getHealth() {
        try {
            const dbHealth = await DatabaseService.getHealth();
            const userCount = await DatabaseService.count('users');

            return {
                status: 'healthy',
                database: dbHealth.status,
                userCount: userCount,
                activeTokens: this.refreshTokens.size,
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
module.exports = new AuthService();
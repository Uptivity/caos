/**
 * CAOS CRM API Client
 *
 * This file handles ALL API communication with the backend.
 * It manages authentication tokens, makes HTTP requests, and handles errors.
 *
 * USAGE EXAMPLE:
 * import { apiClient } from '../utils/apiClient.js';
 * const leads = await apiClient.get('/api/leads');
 * const newLead = await apiClient.post('/api/leads', { firstName: 'John', lastName: 'Doe' });
 */

// Configuration
const API_BASE_URL = window.location.origin; // Uses same domain (handled by nginx proxy)
const AUTH_TOKEN_KEY = 'caos_auth_token';
const REFRESH_TOKEN_KEY = 'caos_refresh_token';
const USER_DATA_KEY = 'caos_user_data';

/**
 * API Client Class
 * Handles all HTTP requests to backend
 */
class APIClient {
    constructor() {
        this.baseURL = API_BASE_URL;
    }

    /**
     * Get authentication token from localStorage
     * @returns {string|null} JWT token or null if not logged in
     */
    getToken() {
        return localStorage.getItem(AUTH_TOKEN_KEY);
    }

    /**
     * Get refresh token from localStorage
     * @returns {string|null} Refresh token or null
     */
    getRefreshToken() {
        return localStorage.getItem(REFRESH_TOKEN_KEY);
    }

    /**
     * Save authentication tokens to localStorage
     * @param {string} accessToken - JWT access token
     * @param {string} refreshToken - JWT refresh token
     */
    setTokens(accessToken, refreshToken) {
        localStorage.setItem(AUTH_TOKEN_KEY, accessToken);
        localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    }

    /**
     * Save user data to localStorage
     * @param {object} userData - User object from API
     */
    setUserData(userData) {
        localStorage.setItem(USER_DATA_KEY, JSON.stringify(userData));
    }

    /**
     * Get user data from localStorage
     * @returns {object|null} User object or null
     */
    getUserData() {
        const data = localStorage.getItem(USER_DATA_KEY);
        return data ? JSON.parse(data) : null;
    }

    /**
     * Check if user is authenticated
     * @returns {boolean} True if user has valid token
     */
    isAuthenticated() {
        return !!this.getToken();
    }

    /**
     * Clear all authentication data (logout)
     */
    clearAuth() {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.removeItem(USER_DATA_KEY);
    }

    /**
     * Build request headers with authentication
     * @param {object} customHeaders - Additional headers to include
     * @returns {object} Headers object
     */
    getHeaders(customHeaders = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...customHeaders
        };

        const token = this.getToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        return headers;
    }

    /**
     * Make HTTP request to API
     * @param {string} endpoint - API endpoint (e.g., '/api/leads')
     * @param {object} options - Fetch options
     * @returns {Promise<object>} Response data
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;

        const config = {
            ...options,
            headers: this.getHeaders(options.headers)
        };

        try {
            const response = await fetch(url, config);

            // Handle 401 Unauthorized - token expired
            if (response.status === 401) {
                // Try to refresh token
                const refreshed = await this.refreshAccessToken();
                if (refreshed) {
                    // Retry original request with new token
                    config.headers = this.getHeaders(options.headers);
                    const retryResponse = await fetch(url, config);
                    return await this.handleResponse(retryResponse);
                } else {
                    // Refresh failed, redirect to login
                    this.clearAuth();
                    window.location.href = '/components/auth/login.html';
                    throw new Error('Session expired. Please login again.');
                }
            }

            return await this.handleResponse(response);
        } catch (error) {
            console.error('API Request Error:', error);
            throw error;
        }
    }

    /**
     * Handle API response
     * @param {Response} response - Fetch response object
     * @returns {Promise<object>} Parsed response data
     */
    async handleResponse(response) {
        const contentType = response.headers.get('content-type');
        const isJson = contentType && contentType.includes('application/json');

        const data = isJson ? await response.json() : await response.text();

        if (!response.ok) {
            const error = new Error(data.message || data.error || 'API request failed');
            error.status = response.status;
            error.data = data;
            throw error;
        }

        return data;
    }

    /**
     * Refresh access token using refresh token
     * @returns {Promise<boolean>} True if refresh successful
     */
    async refreshAccessToken() {
        const refreshToken = this.getRefreshToken();
        if (!refreshToken) {
            return false;
        }

        try {
            const response = await fetch(`${this.baseURL}/api/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken })
            });

            if (response.ok) {
                const data = await response.json();
                this.setTokens(data.tokens.access, data.tokens.refresh);
                return true;
            }
            return false;
        } catch (error) {
            console.error('Token refresh failed:', error);
            return false;
        }
    }

    /**
     * GET request
     * @param {string} endpoint - API endpoint
     * @param {object} params - Query parameters
     * @returns {Promise<object>} Response data
     */
    async get(endpoint, params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const url = queryString ? `${endpoint}?${queryString}` : endpoint;
        return this.request(url, { method: 'GET' });
    }

    /**
     * POST request
     * @param {string} endpoint - API endpoint
     * @param {object} data - Request body data
     * @returns {Promise<object>} Response data
     */
    async post(endpoint, data = {}) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    /**
     * PUT request
     * @param {string} endpoint - API endpoint
     * @param {object} data - Request body data
     * @returns {Promise<object>} Response data
     */
    async put(endpoint, data = {}) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    /**
     * DELETE request
     * @param {string} endpoint - API endpoint
     * @returns {Promise<object>} Response data
     */
    async delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    }

    // ========== AUTHENTICATION METHODS ==========

    /**
     * Login user
     * @param {string} email - User email
     * @param {string} password - User password
     * @returns {Promise<object>} User data and tokens
     */
    async login(email, password) {
        const response = await this.post('/api/auth/login', { email, password });

        // Save tokens and user data
        this.setTokens(response.tokens.access, response.tokens.refresh);
        this.setUserData(response.user);

        return response;
    }

    /**
     * Register new user
     * @param {object} userData - User registration data
     * @returns {Promise<object>} User data and tokens
     */
    async register(userData) {
        const response = await this.post('/api/auth/register', userData);

        // Save tokens and user data
        this.setTokens(response.tokens.access, response.tokens.refresh);
        this.setUserData(response.user);

        return response;
    }

    /**
     * Logout user
     */
    async logout() {
        try {
            await this.post('/api/auth/logout');
        } catch (error) {
            console.error('Logout API call failed:', error);
        } finally {
            this.clearAuth();
            window.location.href = '/components/auth/login.html';
        }
    }

    // ========== LEADS METHODS ==========

    /**
     * Get all leads
     * @param {object} filters - Filter parameters (page, limit, status, etc.)
     * @returns {Promise<object>} Leads data with pagination
     */
    async getLeads(filters = {}) {
        return this.get('/api/leads', filters);
    }

    /**
     * Get single lead by ID
     * @param {string} leadId - Lead ID
     * @returns {Promise<object>} Lead data
     */
    async getLead(leadId) {
        return this.get(`/api/leads/${leadId}`);
    }

    /**
     * Create new lead
     * @param {object} leadData - Lead data
     * @returns {Promise<object>} Created lead
     */
    async createLead(leadData) {
        return this.post('/api/leads', leadData);
    }

    /**
     * Update lead
     * @param {string} leadId - Lead ID
     * @param {object} leadData - Updated lead data
     * @returns {Promise<object>} Updated lead
     */
    async updateLead(leadId, leadData) {
        return this.put(`/api/leads/${leadId}`, leadData);
    }

    /**
     * Delete lead
     * @param {string} leadId - Lead ID
     * @returns {Promise<object>} Delete confirmation
     */
    async deleteLead(leadId) {
        return this.delete(`/api/leads/${leadId}`);
    }

    // ========== TASKS METHODS ==========

    /**
     * Get all tasks
     * @returns {Promise<Array>} Tasks array
     */
    async getTasks() {
        return this.get('/api/tasks');
    }

    /**
     * Create new task
     * @param {object} taskData - Task data
     * @returns {Promise<object>} Created task
     */
    async createTask(taskData) {
        return this.post('/api/tasks', taskData);
    }

    // ========== CAMPAIGNS METHODS ==========

    /**
     * Get all campaigns
     * @returns {Promise<Array>} Campaigns array
     */
    async getCampaigns() {
        return this.get('/api/campaigns');
    }

    // ========== ANALYTICS METHODS ==========

    /**
     * Get dashboard stats
     * @returns {Promise<object>} Dashboard statistics
     */
    async getDashboardStats() {
        // Note: You may need to create this endpoint in the backend
        // For now, fetch from individual endpoints and aggregate
        const [leads, tasks] = await Promise.all([
            this.get('/api/leads', { limit: 1 }),
            this.get('/api/tasks')
        ]);

        return {
            leadsCount: leads.total || 0,
            tasksCount: tasks.length || 0,
            // Add more stats as needed
        };
    }
}

// Create singleton instance
const apiClient = new APIClient();

// For module support, check if we're in a module context
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { apiClient, APIClient };
}

// Make available globally for non-module scripts
if (typeof window !== 'undefined') {
    window.apiClient = apiClient;
    window.APIClient = APIClient;
}

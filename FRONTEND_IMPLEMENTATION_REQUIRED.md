# FRONTEND IMPLEMENTATION REQUIRED

## ⚠️ CRITICAL: THE FRONTEND DOES NOT WORK

The current frontend is **NOT FUNCTIONAL**. It consists of static HTML mockups with hardcoded fake data and mock API functions. **NONE of the pages connect to the real backend API.**

## Current State

### ✅ What Works (Backend)
- **Backend API**: Fully functional with 240+ endpoints
- **Database**: MySQL with 19 tables, all migrations applied
- **Authentication**: JWT token system works perfectly
- **All API endpoints tested and working**: `/api/auth/login`, `/api/leads`, `/api/tasks`, etc.

### ❌ What Does NOT Work (Frontend)
- **No real authentication flow**: Login page uses `mockLogin()` function
- **No API calls**: All data is hardcoded in HTML
- **No token storage**: JWT tokens are not saved or used
- **No protected routes**: Anyone can access dashboard without logging in
- **No CRUD operations**: Cannot create, update, or delete anything
- **Mock functions everywhere**: Search for "Mock API" in the code

## What You Must Build

This document provides **EXACT, STEP-BY-STEP** instructions for building a functional frontend. Follow these instructions **PRECISELY**.

---

## STEP 1: Create API Client Utility

**File to create**: `/root/caos/components/utils/apiClient.js`

**Purpose**: This file handles ALL communication with the backend API. Every frontend page will use this.

**Exact code to write**:

```javascript
/**
 * CAOS CRM API Client
 *
 * This file handles ALL API communication with the backend.
 * It manages authentication tokens, makes HTTP requests, and handles errors.
 *
 * USAGE EXAMPLE:
 * import { apiClient } from './utils/apiClient.js';
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

// Export singleton instance
export const apiClient = new APIClient();

// Also export class for testing
export { APIClient };

---

## STEP 2: Create Working Login Page

**File to modify**: `/root/caos/components/auth/login.html`

**What's wrong with current file**:
- Uses `mockLogin()` function (line 522) instead of real API
- Token storage exists but never receives real tokens
- No error handling for real API responses

**EXACT STEPS TO FIX**:

### Step 2.1: Create new login.html file

Create a NEW file at `/root/caos/components/auth/login.html` (replace the old one completely)

Copy this EXACT HTML structure:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login - CAOS CRM</title>
    <link rel="stylesheet" href="../../styles/snowui.css">
    <style>
        body {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .login-container {
            background: white;
            padding: 2rem;
            border-radius: 8px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.2);
            width: 100%;
            max-width: 400px;
        }
        .login-header {
            text-align: center;
            margin-bottom: 2rem;
        }
        .login-header h1 {
            font-size: 2rem;
            font-weight: 700;
            margin: 0 0 0.5rem 0;
        }
        .form-group {
            margin-bottom: 1.5rem;
        }
        .form-label {
            display: block;
            margin-bottom: 0.5rem;
            font-weight: 600;
        }
        .form-input {
            width: 100%;
            padding: 0.75rem;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 1rem;
        }
        .form-input:focus {
            outline: none;
            border-color: #667eea;
        }
        .btn-primary {
            width: 100%;
            padding: 0.75rem;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 4px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
        }
        .btn-primary:hover {
            background: #5568d3;
        }
        .btn-primary:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
        .error-message {
            background: #fee;
            color: #c33;
            padding: 0.75rem;
            border-radius: 4px;
            margin-bottom: 1rem;
            display: none;
        }
        .error-message.show {
            display: block;
        }
        .register-link {
            text-align: center;
            margin-top: 1rem;
        }
    </style>
</head>
<body>
    <div class="login-container">
        <div class="login-header">
            <h1>CAOS CRM</h1>
            <p>Sign in to your account</p>
        </div>

        <div id="errorMessage" class="error-message"></div>

        <form id="loginForm">
            <div class="form-group">
                <label class="form-label" for="email">Email Address</label>
                <input 
                    type="email" 
                    id="email" 
                    class="form-input" 
                    placeholder="you@example.com"
                    required
                    autocomplete="email"
                >
            </div>

            <div class="form-group">
                <label class="form-label" for="password">Password</label>
                <input 
                    type="password" 
                    id="password" 
                    class="form-input" 
                    placeholder="Enter your password"
                    required
                    autocomplete="current-password"
                >
            </div>

            <button type="submit" id="loginButton" class="btn-primary">
                <span id="buttonText">Sign In</span>
                <span id="loadingText" style="display:none;">Signing in...</span>
            </button>
        </form>

        <div class="register-link">
            <p>Don't have an account? <a href="register.html">Register here</a></p>
        </div>
    </div>

    <!-- Load API Client -->
    <script src="../utils/apiClient.js"></script>

    <script>
        // IMPORTANT: This script uses the REAL API via apiClient
        // No mock functions - all requests go to backend

        // Check if already logged in
        if (apiClient.isAuthenticated()) {
            window.location.href = '../dashboard/dashboard.html';
        }

        // Get form elements
        const loginForm = document.getElementById('loginForm');
        const emailInput = document.getElementById('email');
        const passwordInput = document.getElementById('password');
        const loginButton = document.getElementById('loginButton');
        const buttonText = document.getElementById('buttonText');
        const loadingText = document.getElementById('loadingText');
        const errorMessage = document.getElementById('errorMessage');

        // Show error message
        function showError(message) {
            errorMessage.textContent = message;
            errorMessage.classList.add('show');
        }

        // Hide error message
        function hideError() {
            errorMessage.classList.remove('show');
        }

        // Handle form submission
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            hideError();

            const email = emailInput.value.trim();
            const password = passwordInput.value;

            // Validate inputs
            if (!email || !password) {
                showError('Please enter both email and password');
                return;
            }

            // Show loading state
            loginButton.disabled = true;
            buttonText.style.display = 'none';
            loadingText.style.display = 'inline';

            try {
                // REAL API CALL - This connects to /api/auth/login
                const response = await apiClient.login(email, password);

                console.log('Login successful:', response);

                // apiClient.login() automatically saves tokens to localStorage
                // Redirect to dashboard
                window.location.href = '../dashboard/dashboard.html';

            } catch (error) {
                console.error('Login failed:', error);

                // Show error message
                let errorMsg = 'Login failed. Please try again.';

                if (error.message) {
                    errorMsg = error.message;
                } else if (error.data && error.data.message) {
                    errorMsg = error.data.message;
                } else if (error.status === 401) {
                    errorMsg = 'Invalid email or password';
                } else if (error.status === 429) {
                    errorMsg = 'Too many login attempts. Please try again later.';
                }

                showError(errorMsg);

                // Reset button
                loginButton.disabled = false;
                buttonText.style.display = 'inline';
                loadingText.style.display = 'none';
            }
        });

        // For testing - pre-fill with test credentials
        // Remove this in production
        if (window.location.hostname === 'localhost') {
            emailInput.value = 'admin@caos.com';
            passwordInput.value = 'Admin123@';
        }
    </script>
</body>
</html>
```

### Step 2.2: Test the login page

1. Open `https://caos.justsell.app/components/auth/login.html` in browser
2. Enter credentials:
   - Email: `admin@caos.com`
   - Password: `Admin123@`
3. Click "Sign In"
4. You should see success and redirect to dashboard

---

## STEP 3: Create Working Dashboard with Real Data

**File to modify**: `/root/caos/components/dashboard/dashboard.html`

**What's wrong with current file**:
- All data is hardcoded HTML (lines 550-700+)
- No API calls to fetch real data
- No authentication check
- Can't create, edit, or delete anything

**EXACT STEPS TO FIX**:

### Step 3.1: Add authentication guard at top of <script> section

Find the `<script>` tag near the end of Dashboard.html (around line 750).

Add this code as the FIRST thing in the script:

```javascript
// Load API Client
const script = document.createElement('script');
script.src = '../utils/apiClient.js';
document.head.appendChild(script);

script.onload = function() {
    // Check if user is logged in
    if (!apiClient.isAuthenticated()) {
        // Not logged in, redirect to login
        window.location.href = '../auth/login.html';
        return;
    }

    // User is authenticated, load dashboard data
    initializeDashboard();
};

async function initializeDashboard() {
    try {
        // Get user data from localStorage
        const user = apiClient.getUserData();
        if (user) {
            // Update header greeting with real user name
            const greeting = getGreeting();
            const headerTitle = document.querySelector('.header-title');
            headerTitle.textContent = `${greeting}, ${user.first_name}!`;
        }

        // Load real data from API
        await loadDashboardData();

    } catch (error) {
        console.error('Dashboard initialization failed:', error);
        alert('Failed to load dashboard. Please try again.');
    }
}

function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
}

async function loadDashboardData() {
    try {
        // Fetch real data from API
        const [leadsResponse, tasksResponse] = await Promise.all([
            apiClient.getLeads({ limit: 10, page: 1 }),
            apiClient.getTasks()
        ]);

        console.log('Leads:', leadsResponse);
        console.log('Tasks:', tasksResponse);

        // Update stats cards with real data
        updateStatsCards(leadsResponse, tasksResponse);

        // Update tasks list with real data
        updateTasksList(tasksResponse);

    } catch (error) {
        console.error('Failed to load dashboard data:', error);
    }
}

function updateStatsCards(leadsData, tasksData) {
    // Find stat value elements
    const statValues = document.querySelectorAll('.stat-value');

    // Update leads count
    if (statValues[0] && leadsData.total !== undefined) {
        statValues[0].textContent = leadsData.total;
    }

    // Update tasks count
    if (statValues[1] && tasksData.length !== undefined) {
        statValues[1].textContent = tasksData.length;
    }

    // Other stats can be calculated from data or set to 0
    // Update as you add more endpoints
}

function updateTasksList(tasks) {
    // Find tasks container
    const tasksList = document.querySelector('.activity-list');
    if (!tasksList || !tasks || tasks.length === 0) {
        return;
    }

    // Clear existing tasks
    tasksList.innerHTML = '';

    // Add real tasks from API
    tasks.slice(0, 5).forEach(task => {
        const taskItem = document.createElement('div');
        taskItem.className = 'task-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'task-checkbox';
        checkbox.checked = task.status === 'completed';

        const taskContent = document.createElement('div');
        taskContent.className = 'task-content';

        const taskTitle = document.createElement('div');
        taskTitle.className = 'task-title';
        taskTitle.textContent = task.title;

        const taskMeta = document.createElement('div');
        taskMeta.className = 'task-meta';
        taskMeta.textContent = task.due_date ? `Due: ${new Date(task.due_date).toLocaleDateString()}` : 'No due date';

        taskContent.appendChild(taskTitle);
        taskContent.appendChild(taskMeta);

        const priority = document.createElement('div');
        priority.className = `task-priority priority-${task.priority || 'medium'}`;

        taskItem.appendChild(checkbox);
        taskItem.appendChild(taskContent);
        taskItem.appendChild(priority);

        tasksList.appendChild(taskItem);
    });
}

// Logout functionality
const logoutButton = document.getElementById('logoutButton');
if (logoutButton) {
    logoutButton.addEventListener('click', async function() {
        await apiClient.logout();
    });
}
```

### Step 3.2: Add logout button to dashboard header

Find the `.header-right` div in Dashboard.html (around line 520).

Add this button inside `.header-right`:

```html
<button id="logoutButton" class="btn" style="padding: 0.5rem 1rem; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer;">
    Logout
</button>
```

---

## STEP 4: Update Nginx Configuration

**File to modify**: `/root/caos/deployment/nginx.conf`

**Current problem**: Line 125 and 183 serve dashboard directly. Should serve login page first.

**EXACT FIX**:

Change line 125 from:
```nginx
try_files /components/dashboard/Dashboard.html =404;
```

To:
```nginx
try_files /components/auth/login.html =404;
```

Change line 183 from:
```nginx
try_files /components/dashboard/Dashboard.html =404;
```

To:
```nginx
try_files /components/auth/login.html =404;
```

This makes the login page the entry point instead of dashboard.

---

## STEP 5: Build Leads Page (Example for Other Pages)

**File to modify**: `/root/caos/components/leads/LeadsList.html`

This is an example of how to convert ANY page from mock data to real API.

### Step 5.1: Add authentication check

Add to top of <script> section:

```javascript
// Check authentication
if (!apiClient.isAuthenticated()) {
    window.location.href = '../auth/login.html';
}
```

### Step 5.2: Load real leads data

Replace mock data loading with:

```javascript
async function loadLeads() {
    try {
        const leads = await apiClient.getLeads({
            page: 1,
            limit: 50
        });

        displayLeads(leads.data || leads);
    } catch (error) {
        console.error('Failed to load leads:', error);
        alert('Failed to load leads');
    }
}

function displayLeads(leads) {
    const leadsContainer = document.getElementById('leadsContainer');
    leadsContainer.innerHTML = '';

    leads.forEach(lead => {
        const leadCard = createLeadCard(lead);
        leadsContainer.appendChild(leadCard);
    });
}

function createLeadCard(lead) {
    const card = document.createElement('div');
    card.className = 'lead-card';
    card.innerHTML = `
        <div class="lead-header">
            <h3>${lead.first_name} ${lead.last_name}</h3>
            <span class="lead-status">${lead.status}</span>
        </div>
        <div class="lead-details">
            <p>Email: ${lead.email || 'N/A'}</p>
            <p>Company: ${lead.company || 'N/A'}</p>
            <p>Score: ${lead.score || 0}</p>
        </div>
        <div class="lead-actions">
            <button onclick="editLead('${lead.id}')">Edit</button>
            <button onclick="deleteLead('${lead.id}')">Delete</button>
        </div>
    `;
    return card;
}

async function editLead(leadId) {
    // TODO: Open edit modal
    window.location.href = `LeadDetail.html?id=${leadId}`;
}

async function deleteLead(leadId) {
    if (!confirm('Are you sure you want to delete this lead?')) {
        return;
    }

    try {
        await apiClient.deleteLead(leadId);
        await loadLeads(); // Reload list
        alert('Lead deleted successfully');
    } catch (error) {
        console.error('Failed to delete lead:', error);
        alert('Failed to delete lead');
    }
}

// Load leads on page load
window.addEventListener('DOMContentLoaded', loadLeads);
```

---

## STEP 6: Repeat for All Other Pages

Apply the same pattern to EVERY HTML file in `/root/caos/components/`:

1. **Add API client script**: `<script src="../utils/apiClient.js"></script>`
2. **Add authentication check**: Redirect to login if not authenticated
3. **Remove mock functions**: Delete all `mockXXX()` functions
4. **Add real API calls**: Use `apiClient.get/post/put/delete()`
5. **Update UI with real data**: Replace hardcoded HTML with data from API

### Pages that need this treatment:

- ✅ `/components/auth/login.html` - DONE in Step 2
- ✅ `/components/dashboard/dashboard.html` - DONE in Step 3
- ⚠️ `/components/leads/LeadsList.html` - Example in Step 5
- ⚠️ `/components/leads/LeadDetail.html`
- ⚠️ `/components/campaigns/CampaignsList.html`
- ⚠️ `/components/campaigns/CampaignBuilder.html`
- ⚠️ `/components/tasks/Tasks.html`
- ⚠️ `/components/calendar/Calendar.html`
- ⚠️ `/components/email/Email.html`
- ⚠️ `/components/documents/Documents.html`
- ⚠️ `/components/reports/Reports.html`
- ⚠️ `/components/analytics/Analytics.html`
- ⚠️ `/components/products/Products.html`
- ⚠️ `/components/teams/Teams.html`
- ⚠️ `/components/settings/Settings.html`

---

## TESTING CHECKLIST

After implementing each step, test in this order:

### Test 1: API Client
```javascript
// Open browser console on any page
console.log(window.apiClient); // Should show APIClient object
```

### Test 2: Login Page
1. Go to `/components/auth/login.html`
2. Enter: `admin@caos.com` / `Admin123@`
3. Click Sign In
4. Should redirect to dashboard
5. Check console for "Login successful"

### Test 3: Dashboard
1. Should show real user name in header
2. Check browser console for "Leads:" and "Tasks:" data
3. Stats should show real numbers from API
4. Tasks list should show real tasks

### Test 4: Authentication
1. Clear localStorage: `localStorage.clear()`
2. Try to visit dashboard directly
3. Should redirect to login
4. After login, should stay on dashboard

### Test 5: Logout
1. Click Logout button
2. Should redirect to login
3. Try to visit dashboard again
4. Should redirect back to login

---

## DEPLOYMENT CHECKLIST

After making all changes:

1. ✅ Test everything locally first
2. ✅ Commit changes to git
3. ✅ Push to GitHub
4. ✅ On server: `git pull`
5. ✅ Restart Docker containers: `docker-compose restart`
6. ✅ Test on production URL
7. ✅ Check all features work

---

## COMMON ERRORS AND FIXES

### Error: "apiClient is not defined"
**Fix**: Add `<script src="../utils/apiClient.js"></script>` before your page script

### Error: "401 Unauthorized"
**Fix**: Token expired. Clear localStorage and login again.

### Error: "CORS error"
**Fix**: Should not happen - nginx proxies API. Check nginx config.

### Error: "Cannot read property 'access' of undefined"
**Fix**: API response format changed. Check what the API actually returns.

### Error: Dashboard shows old mock data
**Fix**: Clear browser cache (Ctrl+F5) and reload

---

## IMPORTANT NOTES

1. **Do NOT modify the backend** - It works perfectly
2. **Do NOT change API endpoints** - They are correct
3. **Do NOT add new dependencies** - Use vanilla JavaScript
4. **Do NOT use mock data** - Connect EVERYTHING to real API
5. **Do NOT skip authentication checks** - Every page needs them

---

## SUCCESS CRITERIA

You will know the frontend is complete when:

1. ✅ Cannot access any page without logging in first
2. ✅ Login page connects to `/api/auth/login` and stores real JWT tokens
3. ✅ Dashboard shows real data from `/api/leads` and `/api/tasks`
4. ✅ Can create new leads via `/api/leads` POST
5. ✅ Can edit leads via `/api/leads/:id` PUT
6. ✅ Can delete leads via `/api/leads/:id` DELETE
7. ✅ Logout clears tokens and redirects to login
8. ✅ All 15+ pages follow the same pattern
9. ✅ No `mockXXX()` functions exist anywhere
10. ✅ Browser console shows real API requests and responses


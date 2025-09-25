// Test helper utilities for CAOS CRM Backend
const request = require('supertest');
const jwt = require('jsonwebtoken');

/**
 * Test data generators
 */
const TestData = {
  // Valid user data
  validUser: {
    email: 'test@example.com',
    password: 'TestPassword123!',
    firstName: 'John',
    lastName: 'Doe',
    role: 'user'
  },

  // Admin user data
  adminUser: {
    email: 'admin@example.com',
    password: 'AdminPassword123!',
    firstName: 'Admin',
    lastName: 'User',
    role: 'admin'
  },

  // Invalid user data
  invalidUser: {
    email: 'invalid-email',
    password: '123',
    firstName: '',
    lastName: ''
  },

  // Lead data
  validLead: {
    firstName: 'Jane',
    lastName: 'Smith',
    email: 'jane.smith@company.com',
    phone: '+1-555-0123',
    company: 'Test Company',
    status: 'new',
    source: 'website',
    value: 5000,
    notes: 'Interested in premium package'
  },

  // Product data
  validProduct: {
    name: 'Test Product',
    description: 'A product for testing',
    sku: 'TEST-001',
    price: 99.99,
    category: 'Software',
    inStock: true,
    stockQuantity: 100
  },

  // Campaign data
  validCampaign: {
    name: 'Test Campaign',
    type: 'email',
    status: 'draft',
    subject: 'Test Email Subject',
    content: 'Test email content',
    scheduledDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  }
};

/**
 * JWT token generators
 */
const TokenHelpers = {
  /**
   * Generate a valid JWT token for testing
   */
  generateValidToken: (userData = {}) => {
    const payload = {
      userId: userData.id || 'test-user-id',
      email: userData.email || TestData.validUser.email,
      role: userData.role || 'user',
      ...userData
    };
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
  },

  /**
   * Generate an expired JWT token
   */
  generateExpiredToken: (userData = {}) => {
    const payload = {
      userId: userData.id || 'test-user-id',
      email: userData.email || TestData.validUser.email,
      role: userData.role || 'user',
      ...userData
    };
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '-1h' });
  },

  /**
   * Generate an invalid JWT token
   */
  generateInvalidToken: () => {
    return jwt.sign({ userId: 'test' }, 'wrong-secret');
  },

  /**
   * Generate admin token
   */
  generateAdminToken: (userData = {}) => {
    return TokenHelpers.generateValidToken({
      ...userData,
      role: 'admin'
    });
  }
};

/**
 * API test helpers
 */
const ApiHelpers = {
  /**
   * Make authenticated API request
   */
  authenticatedRequest: (app, method, path, token) => {
    return request(app)[method](path)
      .set('Authorization', `Bearer ${token}`);
  },

  /**
   * Make admin authenticated request
   */
  adminRequest: (app, method, path) => {
    const token = TokenHelpers.generateAdminToken();
    return ApiHelpers.authenticatedRequest(app, method, path, token);
  },

  /**
   * Make user authenticated request
   */
  userRequest: (app, method, path) => {
    const token = TokenHelpers.generateValidToken();
    return ApiHelpers.authenticatedRequest(app, method, path, token);
  }
};

/**
 * Database mock helpers
 */
const DatabaseHelpers = {
  /**
   * Mock successful database operations
   */
  mockSuccessfulQuery: (returnValue = {}) => {
    return jest.fn().mockResolvedValue(returnValue);
  },

  /**
   * Mock database error
   */
  mockDatabaseError: (error = new Error('Database error')) => {
    return jest.fn().mockRejectedValue(error);
  },

  /**
   * Mock user lookup
   */
  mockUserLookup: (user = null) => {
    return jest.fn().mockResolvedValue(user);
  }
};

/**
 * Validation helpers
 */
const ValidationHelpers = {
  /**
   * Assert API error response format
   */
  expectApiError: (response, statusCode, errorMessage) => {
    expect(response.status).toBe(statusCode);
    expect(response.body).toHaveProperty('error');
    if (errorMessage) {
      expect(response.body.error).toContain(errorMessage);
    }
  },

  /**
   * Assert API success response format
   */
  expectApiSuccess: (response, statusCode = 200) => {
    expect(response.status).toBe(statusCode);
    expect(response.body).not.toHaveProperty('error');
  },

  /**
   * Assert JWT token format
   */
  expectValidJWT: (token) => {
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);
  },

  /**
   * Assert pagination response
   */
  expectPaginatedResponse: (response) => {
    expect(response.body).toHaveProperty('data');
    expect(response.body).toHaveProperty('pagination');
    expect(response.body.pagination).toHaveProperty('page');
    expect(response.body.pagination).toHaveProperty('limit');
    expect(response.body.pagination).toHaveProperty('total');
  }
};

/**
 * Error simulation helpers
 */
const ErrorHelpers = {
  /**
   * Simulate network timeout
   */
  simulateTimeout: () => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        reject(new Error('Request timeout'));
      }, 5000);
    });
  },

  /**
   * Simulate rate limit exceeded
   */
  simulateRateLimit: async (app, endpoint, attempts = 6) => {
    const responses = [];
    for (let i = 0; i < attempts; i++) {
      const response = await request(app).post(endpoint);
      responses.push(response);
    }
    return responses;
  }
};

module.exports = {
  TestData,
  TokenHelpers,
  ApiHelpers,
  DatabaseHelpers,
  ValidationHelpers,
  ErrorHelpers
};
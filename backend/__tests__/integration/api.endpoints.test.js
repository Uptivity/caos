// Comprehensive API Endpoints Integration Tests
const request = require('supertest');
const express = require('express');

// Mock dependencies
jest.mock('../../utils/secureLogger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

// Import all routers
const { router: authRouter } = require('../../auth/auth');
const leadRouter = require('../../leads/leadRoutes');
const productRouter = require('../../products/productRoutes');
const campaignRouter = require('../../campaigns/campaignRoutes');
const analyticsRouter = require('../../analytics/analyticsRoutes');
const tasksRouter = require('../../tasks/tasksRoutes');
const calendarRouter = require('../../calendar/calendarRoutes');
const emailRouter = require('../../email/emailRoutes');
const reportsRouter = require('../../reports/reportsRoutes');
const teamsRouter = require('../../teams/teamsRoutes');
const documentsRouter = require('../../documents/documentsRoutes');
const mobileRouter = require('../../mobile/mobileRoutes');
const settingsRouter = require('../../settings/settingsRoutes');

const {
  TestData,
  TokenHelpers,
  ApiHelpers,
  ValidationHelpers
} = require('../helpers/testHelpers');

// Create comprehensive test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());

  // Mount all routers
  app.use('/auth', authRouter);
  app.use('/api/leads', leadRouter);
  app.use('/api/products', productRouter);
  app.use('/api/campaigns', campaignRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/calendar', calendarRouter);
  app.use('/api/email', emailRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/teams', teamsRouter);
  app.use('/api/documents', documentsRouter);
  app.use('/api/mobile', mobileRouter);
  app.use('/api/settings', settingsRouter);

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

  // Error handling middleware
  app.use((error, req, res, next) => {
    console.error('API Test error:', error);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
};

describe('Comprehensive API Endpoints Tests', () => {
  let app;
  let accessToken;
  let adminToken;
  let userId;

  beforeAll(async () => {
    app = createTestApp();
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    // Register regular user
    const userResponse = await request(app)
      .post('/auth/register')
      .send(TestData.validUser);

    accessToken = userResponse.body.tokens.accessToken;
    userId = userResponse.body.user.id;

    // Register admin user
    const adminResponse = await request(app)
      .post('/auth/register')
      .send(TestData.adminUser);

    adminToken = adminResponse.body.tokens.accessToken;
  });

  describe('Health Check and Core Endpoints', () => {
    test('should respond to health check', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.timestamp).toBeDefined();
    });

    test('should handle 404 for unknown endpoints', async () => {
      const response = await request(app)
        .get('/api/nonexistent')
        .expect(404);
    });

    test('should require authentication for protected endpoints', async () => {
      const protectedEndpoints = [
        '/api/leads',
        '/api/products',
        '/api/campaigns',
        '/api/analytics',
        '/api/tasks',
        '/api/calendar',
        '/api/email',
        '/api/reports',
        '/api/teams',
        '/api/documents',
        '/api/settings'
      ];

      for (const endpoint of protectedEndpoints) {
        const response = await request(app)
          .get(endpoint)
          .expect(401);

        ValidationHelpers.expectApiError(response, 401, 'Access token required');
      }
    });
  });

  describe('Authentication Endpoints Coverage', () => {
    test('should cover all auth endpoints', async () => {
      const authEndpoints = [
        { method: 'post', path: '/auth/register', requiresAuth: false },
        { method: 'post', path: '/auth/login', requiresAuth: false },
        { method: 'get', path: '/auth/profile', requiresAuth: true },
        { method: 'post', path: '/auth/refresh', requiresAuth: false },
        { method: 'post', path: '/auth/logout', requiresAuth: true },
        { method: 'put', path: '/auth/profile', requiresAuth: true },
        { method: 'post', path: '/auth/change-password', requiresAuth: true },
        { method: 'post', path: '/auth/forgot-password', requiresAuth: false }
      ];

      for (const endpoint of authEndpoints) {
        const request_method = request(app)[endpoint.method](endpoint.path);

        if (endpoint.requiresAuth) {
          request_method.set('Authorization', `Bearer ${accessToken}`);
        }

        const response = await request_method;

        // Should not return 404 (endpoint exists)
        expect(response.status).not.toBe(404);
      }
    });
  });

  describe('Leads Module Endpoints Coverage', () => {
    test('should cover all lead endpoints', async () => {
      // Create test lead first
      const leadResponse = await request(app)
        .post('/api/leads')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(TestData.validLead);

      const leadId = leadResponse.body.lead.id;

      const leadEndpoints = [
        { method: 'get', path: '/api/leads' },
        { method: 'post', path: '/api/leads' },
        { method: 'get', path: `/api/leads/${leadId}` },
        { method: 'put', path: `/api/leads/${leadId}` },
        { method: 'delete', path: `/api/leads/${leadId}` },
        { method: 'get', path: `/api/leads/${leadId}/activities` },
        { method: 'post', path: `/api/leads/${leadId}/activities` },
        { method: 'put', path: `/api/leads/${leadId}/status` },
        { method: 'get', path: '/api/leads/export' },
        { method: 'post', path: '/api/leads/import' },
        { method: 'get', path: '/api/leads/analytics' },
        { method: 'post', path: '/api/leads/bulk-update' },
        { method: 'get', path: '/api/leads/pipeline' },
        { method: 'post', path: `/api/leads/${leadId}/convert` },
        { method: 'get', path: `/api/leads/${leadId}/timeline` }
      ];

      for (const endpoint of leadEndpoints) {
        const response = await request(app)[endpoint.method](endpoint.path)
          .set('Authorization', `Bearer ${accessToken}`);

        // Should not return 404 (endpoint exists)
        expect(response.status).not.toBe(404);
      }
    });
  });

  describe('Products Module Endpoints Coverage', () => {
    test('should cover all product endpoints', async () => {
      // Create test product first
      const productResponse = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(TestData.validProduct);

      const productId = productResponse.body.product.id;

      const productEndpoints = [
        { method: 'get', path: '/api/products' },
        { method: 'post', path: '/api/products' },
        { method: 'get', path: `/api/products/${productId}` },
        { method: 'put', path: `/api/products/${productId}` },
        { method: 'delete', path: `/api/products/${productId}` },
        { method: 'get', path: '/api/products/categories' },
        { method: 'post', path: '/api/products/categories' },
        { method: 'get', path: `/api/products/${productId}/variants` },
        { method: 'post', path: `/api/products/${productId}/variants` },
        { method: 'put', path: `/api/products/${productId}/stock` },
        { method: 'get', path: `/api/products/${productId}/stock-movements` },
        { method: 'get', path: '/api/products/stock-alerts' },
        { method: 'post', path: `/api/products/${productId}/view` },
        { method: 'get', path: `/api/products/${productId}/analytics` },
        { method: 'get', path: '/api/products/analytics/dashboard' },
        { method: 'post', path: '/api/products/import' },
        { method: 'get', path: '/api/products/export' },
        { method: 'put', path: '/api/products/bulk-update' }
      ];

      for (const endpoint of productEndpoints) {
        const response = await request(app)[endpoint.method](endpoint.path)
          .set('Authorization', `Bearer ${accessToken}`);

        // Should not return 404 (endpoint exists)
        expect(response.status).not.toBe(404);
      }
    });
  });

  describe('Campaign Module Endpoints Coverage', () => {
    test('should cover campaign endpoints', async () => {
      const campaignEndpoints = [
        { method: 'get', path: '/api/campaigns' },
        { method: 'post', path: '/api/campaigns' },
        { method: 'get', path: '/api/campaigns/templates' },
        { method: 'post', path: '/api/campaigns/templates' }
      ];

      for (const endpoint of campaignEndpoints) {
        const response = await request(app)[endpoint.method](endpoint.path)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).not.toBe(404);
      }
    });
  });

  describe('Analytics Module Endpoints Coverage', () => {
    test('should cover analytics endpoints', async () => {
      const analyticsEndpoints = [
        { method: 'get', path: '/api/analytics/dashboard' },
        { method: 'get', path: '/api/analytics/leads' },
        { method: 'get', path: '/api/analytics/products' },
        { method: 'get', path: '/api/analytics/campaigns' },
        { method: 'get', path: '/api/analytics/revenue' },
        { method: 'post', path: '/api/analytics/custom-report' },
        { method: 'get', path: '/api/analytics/kpis' },
        { method: 'get', path: '/api/analytics/trends' },
        { method: 'get', path: '/api/analytics/forecasting' },
        { method: 'get', path: '/api/analytics/cohort' },
        { method: 'get', path: '/api/analytics/funnel' },
        { method: 'get', path: '/api/analytics/retention' }
      ];

      for (const endpoint of analyticsEndpoints) {
        const response = await request(app)[endpoint.method](endpoint.path)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).not.toBe(404);
      }
    });
  });

  describe('Tasks Module Endpoints Coverage', () => {
    test('should cover task management endpoints', async () => {
      const taskEndpoints = [
        { method: 'get', path: '/api/tasks' },
        { method: 'post', path: '/api/tasks' },
        { method: 'get', path: '/api/tasks/my-tasks' },
        { method: 'get', path: '/api/tasks/team-tasks' },
        { method: 'get', path: '/api/tasks/kanban' },
        { method: 'put', path: '/api/tasks/kanban' },
        { method: 'get', path: '/api/tasks/templates' },
        { method: 'post', path: '/api/tasks/templates' }
      ];

      for (const endpoint of taskEndpoints) {
        const response = await request(app)[endpoint.method](endpoint.path)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).not.toBe(404);
      }
    });
  });

  describe('Calendar Module Endpoints Coverage', () => {
    test('should cover calendar endpoints', async () => {
      const calendarEndpoints = [
        { method: 'get', path: '/api/calendar/events' },
        { method: 'post', path: '/api/calendar/events' },
        { method: 'get', path: '/api/calendar/availability' },
        { method: 'post', path: '/api/calendar/meeting-slots' },
        { method: 'get', path: '/api/calendar/integrations' },
        { method: 'post', path: '/api/calendar/integrations' },
        { method: 'get', path: '/api/calendar/recurring-events' },
        { method: 'post', path: '/api/calendar/recurring-events' }
      ];

      for (const endpoint of calendarEndpoints) {
        const response = await request(app)[endpoint.method](endpoint.path)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).not.toBe(404);
      }
    });
  });

  describe('Email Module Endpoints Coverage', () => {
    test('should cover email management endpoints', async () => {
      const emailEndpoints = [
        { method: 'get', path: '/api/email/messages' },
        { method: 'post', path: '/api/email/send' },
        { method: 'get', path: '/api/email/templates' },
        { method: 'post', path: '/api/email/templates' },
        { method: 'get', path: '/api/email/accounts' },
        { method: 'post', path: '/api/email/accounts' },
        { method: 'get', path: '/api/email/folders' },
        { method: 'post', path: '/api/email/folders' },
        { method: 'get', path: '/api/email/attachments' },
        { method: 'post', path: '/api/email/attachments' }
      ];

      for (const endpoint of emailEndpoints) {
        const response = await request(app)[endpoint.method](endpoint.path)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).not.toBe(404);
      }
    });
  });

  describe('Reports Module Endpoints Coverage', () => {
    test('should cover reporting endpoints', async () => {
      const reportEndpoints = [
        { method: 'get', path: '/api/reports' },
        { method: 'post', path: '/api/reports/generate' },
        { method: 'get', path: '/api/reports/templates' },
        { method: 'post', path: '/api/reports/templates' },
        { method: 'get', path: '/api/reports/scheduled' },
        { method: 'post', path: '/api/reports/scheduled' },
        { method: 'get', path: '/api/reports/exports' },
        { method: 'post', path: '/api/reports/exports' }
      ];

      for (const endpoint of reportEndpoints) {
        const response = await request(app)[endpoint.method](endpoint.path)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).not.toBe(404);
      }
    });
  });

  describe('Teams Module Endpoints Coverage', () => {
    test('should cover team management endpoints', async () => {
      const teamEndpoints = [
        { method: 'get', path: '/api/teams' },
        { method: 'post', path: '/api/teams' },
        { method: 'get', path: '/api/teams/members' },
        { method: 'post', path: '/api/teams/members' },
        { method: 'get', path: '/api/teams/roles' },
        { method: 'post', path: '/api/teams/roles' },
        { method: 'get', path: '/api/teams/permissions' },
        { method: 'put', path: '/api/teams/permissions' },
        { method: 'get', path: '/api/teams/hierarchy' },
        { method: 'put', path: '/api/teams/hierarchy' }
      ];

      for (const endpoint of teamEndpoints) {
        const response = await request(app)[endpoint.method](endpoint.path)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).not.toBe(404);
      }
    });
  });

  describe('Documents Module Endpoints Coverage', () => {
    test('should cover document management endpoints', async () => {
      const documentEndpoints = [
        { method: 'get', path: '/api/documents' },
        { method: 'post', path: '/api/documents/upload' },
        { method: 'get', path: '/api/documents/folders' },
        { method: 'post', path: '/api/documents/folders' },
        { method: 'get', path: '/api/documents/shared' },
        { method: 'post', path: '/api/documents/share' },
        { method: 'get', path: '/api/documents/versions' },
        { method: 'post', path: '/api/documents/versions' }
      ];

      for (const endpoint of documentEndpoints) {
        const response = await request(app)[endpoint.method](endpoint.path)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).not.toBe(404);
      }
    });
  });

  describe('Mobile Module Endpoints Coverage', () => {
    test('should cover mobile-optimized endpoints', async () => {
      const mobileEndpoints = [
        { method: 'get', path: '/api/mobile/sync' },
        { method: 'post', path: '/api/mobile/sync' },
        { method: 'get', path: '/api/mobile/offline-data' },
        { method: 'post', path: '/api/mobile/push-notifications' },
        { method: 'get', path: '/api/mobile/app-config' },
        { method: 'post', path: '/api/mobile/device-register' },
        { method: 'get', path: '/api/mobile/quick-actions' },
        { method: 'post', path: '/api/mobile/quick-actions' }
      ];

      for (const endpoint of mobileEndpoints) {
        const response = await request(app)[endpoint.method](endpoint.path)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).not.toBe(404);
      }
    });
  });

  describe('Settings Module Endpoints Coverage', () => {
    test('should cover system settings endpoints', async () => {
      const settingsEndpoints = [
        { method: 'get', path: '/api/settings/system' },
        { method: 'put', path: '/api/settings/system' },
        { method: 'get', path: '/api/settings/user' },
        { method: 'put', path: '/api/settings/user' },
        { method: 'get', path: '/api/settings/organization' },
        { method: 'put', path: '/api/settings/organization' },
        { method: 'get', path: '/api/settings/integrations' },
        { method: 'post', path: '/api/settings/integrations' },
        { method: 'get', path: '/api/settings/custom-fields' },
        { method: 'post', path: '/api/settings/custom-fields' },
        { method: 'get', path: '/api/settings/workflows' },
        { method: 'post', path: '/api/settings/workflows' }
      ];

      for (const endpoint of settingsEndpoints) {
        const response = await request(app)[endpoint.method](endpoint.path)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).not.toBe(404);
      }
    });
  });

  describe('API Response Standards', () => {
    test('should follow consistent response format', async () => {
      // Test multiple endpoints for consistent response structure
      const responses = await Promise.all([
        request(app).get('/api/leads').set('Authorization', `Bearer ${accessToken}`),
        request(app).get('/api/products').set('Authorization', `Bearer ${accessToken}`),
        request(app).get('/api/analytics/dashboard').set('Authorization', `Bearer ${accessToken}`)
      ]);

      responses.forEach(response => {
        // All successful responses should be JSON
        if (response.status === 200) {
          expect(response.headers['content-type']).toContain('application/json');
        }

        // Error responses should have consistent format
        if (response.status >= 400) {
          expect(response.body).toHaveProperty('error');
          expect(typeof response.body.error).toBe('string');
        }
      });
    });

    test('should handle CORS properly', async () => {
      const response = await request(app)
        .options('/api/leads')
        .set('Origin', 'http://localhost:3000');

      // CORS headers should be present
      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });

    test('should include security headers', async () => {
      const response = await request(app)
        .get('/health');

      // Should include security headers from Helmet middleware
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
    });

    test('should handle pagination consistently', async () => {
      const paginatedEndpoints = [
        '/api/leads',
        '/api/products',
        '/api/tasks'
      ];

      for (const endpoint of paginatedEndpoints) {
        const response = await request(app)
          .get(`${endpoint}?page=1&limit=10`)
          .set('Authorization', `Bearer ${accessToken}`);

        if (response.status === 200 && response.body.pagination) {
          ValidationHelpers.expectPaginatedResponse(response);
        }
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/leads')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    test('should handle oversized requests', async () => {
      const largePayload = {
        name: 'x'.repeat(10000),
        description: 'x'.repeat(50000)
      };

      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(largePayload);

      // Should either accept or reject with appropriate error
      expect([201, 413, 400]).toContain(response.status);
    });

    test('should handle invalid Content-Type', async () => {
      const response = await request(app)
        .post('/api/leads')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Content-Type', 'text/plain')
        .send('not json data')
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('Performance and Limits', () => {
    test('should handle concurrent requests', async () => {
      const concurrentRequests = Array(10).fill().map(() =>
        request(app)
          .get('/api/leads')
          .set('Authorization', `Bearer ${accessToken}`)
      );

      const responses = await Promise.all(concurrentRequests);

      // All requests should complete successfully or be rate limited
      responses.forEach(response => {
        expect([200, 429, 500]).toContain(response.status);
      });

      // At least some requests should succeed
      const successfulRequests = responses.filter(r => r.status === 200);
      expect(successfulRequests.length).toBeGreaterThan(0);
    });

    test('should implement rate limiting', async () => {
      // Make many requests quickly
      const rapidRequests = Array(20).fill().map(() =>
        request(app)
          .post('/auth/login')
          .send({ email: 'test@example.com', password: 'wrong' })
      );

      const responses = await Promise.all(rapidRequests);

      // Some requests should be rate limited
      const rateLimitedRequests = responses.filter(r => r.status === 429);
      expect(rateLimitedRequests.length).toBeGreaterThan(0);
    });

    test('should respond within reasonable time limits', async () => {
      const startTime = Date.now();

      await request(app)
        .get('/api/analytics/dashboard')
        .set('Authorization', `Bearer ${accessToken}`);

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      // Should respond within 5 seconds (generous limit for integration tests)
      expect(responseTime).toBeLessThan(5000);
    }, 10000);
  });

  describe('API Documentation Coverage', () => {
    test('should document all endpoints properly', async () => {
      // This test would ideally check if all endpoints are documented
      // For now, we'll just verify that common endpoints exist
      const criticalEndpoints = [
        '/auth/register',
        '/auth/login',
        '/api/leads',
        '/api/products',
        '/api/analytics/dashboard'
      ];

      for (const endpoint of criticalEndpoints) {
        const method = endpoint.startsWith('/auth') ? 'post' : 'get';
        let requestBuilder = request(app)[method](endpoint);

        if (!endpoint.startsWith('/auth') || endpoint === '/auth/profile') {
          requestBuilder = requestBuilder.set('Authorization', `Bearer ${accessToken}`);
        }

        if (method === 'post' && endpoint.includes('/auth/')) {
          requestBuilder = requestBuilder.send(
            endpoint === '/auth/register' ? TestData.validUser :
            endpoint === '/auth/login' ? { email: TestData.validUser.email, password: TestData.validUser.password } :
            {}
          );
        }

        const response = await requestBuilder;

        // Endpoint should exist (not 404)
        expect(response.status).not.toBe(404);
      }
    });
  });
});
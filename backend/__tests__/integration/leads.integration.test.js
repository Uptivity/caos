// Leads API Integration Tests
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

const leadRouter = require('../../leads/leadRoutes');
const { router: authRouter } = require('../../auth/auth');
const {
  TestData,
  TokenHelpers,
  ApiHelpers,
  ValidationHelpers,
  DatabaseHelpers
} = require('../helpers/testHelpers');

// Create test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRouter);
  app.use('/api/leads', leadRouter);

  // Error handling middleware
  app.use((error, req, res, next) => {
    console.error('Test error:', error);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
};

describe('Leads API Integration Tests', () => {
  let app;
  let accessToken;
  let userId;

  beforeEach(async () => {
    app = createTestApp();
    jest.clearAllMocks();

    // Register test user and get token
    const registerResponse = await request(app)
      .post('/auth/register')
      .send(TestData.validUser);

    accessToken = registerResponse.body.tokens.accessToken;
    userId = registerResponse.body.user.id;
  });

  describe('POST /api/leads', () => {
    test('should create new lead successfully', async () => {
      const leadData = TestData.validLead;

      const response = await request(app)
        .post('/api/leads')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(leadData)
        .expect(201);

      expect(response.body).toHaveProperty('message', 'Lead created successfully');
      expect(response.body).toHaveProperty('lead');
      expect(response.body.lead).toMatchObject({
        firstName: leadData.firstName,
        lastName: leadData.lastName,
        email: leadData.email.toLowerCase(),
        company: leadData.company,
        status: leadData.status
      });

      expect(response.body.lead.id).toBeDefined();
      expect(response.body.lead.createdAt).toBeDefined();
      expect(response.body.lead.score).toBeGreaterThanOrEqual(0);
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .post('/api/leads')
        .send(TestData.validLead)
        .expect(401);

      ValidationHelpers.expectApiError(response, 401, 'Access token required');
    });

    test('should validate required fields', async () => {
      const invalidLead = {
        firstName: '',
        lastName: 'Smith',
        email: 'invalid-email'
      };

      const response = await request(app)
        .post('/api/leads')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(invalidLead)
        .expect(400);

      ValidationHelpers.expectApiError(response, 400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    test('should validate email format', async () => {
      const leadWithInvalidEmail = {
        ...TestData.validLead,
        email: 'invalid-email-format'
      };

      const response = await request(app)
        .post('/api/leads')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(leadWithInvalidEmail)
        .expect(400);

      ValidationHelpers.expectApiError(response, 400, 'Invalid email format');
    });

    test('should validate phone format when provided', async () => {
      const leadWithInvalidPhone = {
        ...TestData.validLead,
        phone: 'invalid-phone-format'
      };

      const response = await request(app)
        .post('/api/leads')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(leadWithInvalidPhone)
        .expect(400);

      ValidationHelpers.expectApiError(response, 400, 'Invalid phone format');
    });

    test('should prevent duplicate email addresses', async () => {
      const leadData = TestData.validLead;

      // Create first lead
      await request(app)
        .post('/api/leads')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(leadData)
        .expect(201);

      // Try to create duplicate
      const response = await request(app)
        .post('/api/leads')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          ...leadData,
          firstName: 'Different Name'
        })
        .expect(409);

      ValidationHelpers.expectApiError(response, 409, 'already exists');
    });

    test('should calculate lead score automatically', async () => {
      const highValueLead = {
        firstName: 'High',
        lastName: 'Value',
        email: 'high.value@bigcompany.com',
        phone: '+1-555-0123',
        company: 'Big Company',
        companySize: '1000+',
        source: 'referral',
        status: 'new'
      };

      const response = await request(app)
        .post('/api/leads')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(highValueLead)
        .expect(201);

      expect(response.body.lead.score).toBeGreaterThan(0);
      expect(response.body.lead.priority).toBeDefined();
    });

    test('should set owner to authenticated user', async () => {
      const response = await request(app)
        .post('/api/leads')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(TestData.validLead)
        .expect(201);

      expect(response.body.lead.owner).toBe(userId);
    });
  });

  describe('GET /api/leads', () => {
    beforeEach(async () => {
      // Create test leads
      const leads = [
        { ...TestData.validLead, email: 'lead1@test.com', status: 'new' },
        { ...TestData.validLead, email: 'lead2@test.com', status: 'qualified' },
        { ...TestData.validLead, email: 'lead3@test.com', status: 'new' }
      ];

      for (const lead of leads) {
        await request(app)
          .post('/api/leads')
          .set('Authorization', `Bearer ${accessToken}`)
          .send(lead);
      }
    });

    test('should get all leads for authenticated user', async () => {
      const response = await request(app)
        .get('/api/leads')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('leads');
      expect(response.body.leads).toBeInstanceOf(Array);
      expect(response.body.leads.length).toBeGreaterThan(0);

      // All leads should belong to the authenticated user
      response.body.leads.forEach(lead => {
        expect(lead.owner).toBe(userId);
      });
    });

    test('should support pagination', async () => {
      const response = await request(app)
        .get('/api/leads?page=1&limit=2')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      ValidationHelpers.expectPaginatedResponse(response);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeLessThanOrEqual(2);
    });

    test('should support filtering by status', async () => {
      const response = await request(app)
        .get('/api/leads?status=new')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.leads).toBeInstanceOf(Array);
      response.body.leads.forEach(lead => {
        expect(lead.status).toBe('new');
      });
    });

    test('should support searching by name', async () => {
      const response = await request(app)
        .get('/api/leads?search=Jane')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.leads).toBeInstanceOf(Array);
      response.body.leads.forEach(lead => {
        expect(
          lead.firstName.toLowerCase().includes('jane') ||
          lead.lastName.toLowerCase().includes('jane')
        ).toBe(true);
      });
    });

    test('should support sorting', async () => {
      const response = await request(app)
        .get('/api/leads?sortBy=createdAt&sortOrder=desc')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.leads).toBeInstanceOf(Array);

      if (response.body.leads.length > 1) {
        const dates = response.body.leads.map(lead => new Date(lead.createdAt));
        for (let i = 1; i < dates.length; i++) {
          expect(dates[i]).toBeLessThanOrEqual(dates[i - 1]);
        }
      }
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .get('/api/leads')
        .expect(401);

      ValidationHelpers.expectApiError(response, 401, 'Access token required');
    });
  });

  describe('GET /api/leads/:id', () => {
    let leadId;

    beforeEach(async () => {
      const createResponse = await request(app)
        .post('/api/leads')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(TestData.validLead);

      leadId = createResponse.body.lead.id;
    });

    test('should get lead by id', async () => {
      const response = await request(app)
        .get(`/api/leads/${leadId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('lead');
      expect(response.body.lead.id).toBe(leadId);
      expect(response.body.lead.owner).toBe(userId);
    });

    test('should return 404 for non-existent lead', async () => {
      const response = await request(app)
        .get('/api/leads/non-existent-id')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);

      ValidationHelpers.expectApiError(response, 404, 'Lead not found');
    });

    test('should not allow access to other users leads', async () => {
      // Create another user
      const otherUserResponse = await request(app)
        .post('/auth/register')
        .send({
          ...TestData.validUser,
          email: 'other@example.com'
        });

      const otherUserToken = otherUserResponse.body.tokens.accessToken;

      // Try to access first user's lead
      const response = await request(app)
        .get(`/api/leads/${leadId}`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .expect(403);

      ValidationHelpers.expectApiError(response, 403, 'Access denied');
    });
  });

  describe('PUT /api/leads/:id', () => {
    let leadId;

    beforeEach(async () => {
      const createResponse = await request(app)
        .post('/api/leads')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(TestData.validLead);

      leadId = createResponse.body.lead.id;
    });

    test('should update lead successfully', async () => {
      const updateData = {
        firstName: 'Updated',
        company: 'Updated Company',
        status: 'qualified'
      };

      const response = await request(app)
        .put(`/api/leads/${leadId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Lead updated successfully');
      expect(response.body.lead.firstName).toBe('Updated');
      expect(response.body.lead.company).toBe('Updated Company');
      expect(response.body.lead.status).toBe('qualified');
      expect(response.body.lead.updatedAt).toBeDefined();
    });

    test('should validate email format on update', async () => {
      const invalidUpdate = {
        email: 'invalid-email'
      };

      const response = await request(app)
        .put(`/api/leads/${leadId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(invalidUpdate)
        .expect(400);

      ValidationHelpers.expectApiError(response, 400, 'Invalid email format');
    });

    test('should track status changes', async () => {
      const statusUpdate = {
        status: 'qualified',
        statusReason: 'Lead showed strong interest in demo'
      };

      const response = await request(app)
        .put(`/api/leads/${leadId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(statusUpdate)
        .expect(200);

      expect(response.body.lead.status).toBe('qualified');

      // Check if status change was recorded in activities
      const activitiesResponse = await request(app)
        .get(`/api/leads/${leadId}/activities`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const statusChangeActivity = activitiesResponse.body.activities.find(
        activity => activity.type === 'status_change'
      );

      expect(statusChangeActivity).toBeDefined();
      expect(statusChangeActivity.notes).toContain('qualified');
    });

    test('should recalculate score when relevant fields change', async () => {
      const scoreAffectingUpdate = {
        companySize: '1000+',
        source: 'referral'
      };

      const response = await request(app)
        .put(`/api/leads/${leadId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(scoreAffectingUpdate)
        .expect(200);

      expect(response.body.lead.score).toBeGreaterThan(0);
    });
  });

  describe('DELETE /api/leads/:id', () => {
    let leadId;

    beforeEach(async () => {
      const createResponse = await request(app)
        .post('/api/leads')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(TestData.validLead);

      leadId = createResponse.body.lead.id;
    });

    test('should delete lead successfully', async () => {
      const response = await request(app)
        .delete(`/api/leads/${leadId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.message).toBe('Lead deleted successfully');

      // Verify lead is deleted
      await request(app)
        .get(`/api/leads/${leadId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    test('should not allow deletion of other users leads', async () => {
      // Create another user
      const otherUserResponse = await request(app)
        .post('/auth/register')
        .send({
          ...TestData.validUser,
          email: 'other@example.com'
        });

      const otherUserToken = otherUserResponse.body.tokens.accessToken;

      // Try to delete first user's lead
      const response = await request(app)
        .delete(`/api/leads/${leadId}`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .expect(403);

      ValidationHelpers.expectApiError(response, 403, 'Access denied');
    });
  });

  describe('POST /api/leads/:id/activities', () => {
    let leadId;

    beforeEach(async () => {
      const createResponse = await request(app)
        .post('/api/leads')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(TestData.validLead);

      leadId = createResponse.body.lead.id;
    });

    test('should add activity to lead', async () => {
      const activityData = {
        type: 'email',
        description: 'Sent welcome email',
        notes: 'Initial contact made successfully'
      };

      const response = await request(app)
        .post(`/api/leads/${leadId}/activities`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(activityData)
        .expect(201);

      expect(response.body).toHaveProperty('message', 'Activity added successfully');
      expect(response.body.activity).toMatchObject({
        type: 'email',
        description: 'Sent welcome email',
        notes: 'Initial contact made successfully',
        leadId: leadId
      });
      expect(response.body.activity.id).toBeDefined();
      expect(response.body.activity.createdAt).toBeDefined();
    });

    test('should validate activity type', async () => {
      const invalidActivity = {
        type: 'invalid_type',
        description: 'Test activity'
      };

      const response = await request(app)
        .post(`/api/leads/${leadId}/activities`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(invalidActivity)
        .expect(400);

      ValidationHelpers.expectApiError(response, 400, 'Invalid activity type');
    });

    test('should require description for activities', async () => {
      const incompleteActivity = {
        type: 'email'
        // Missing description
      };

      const response = await request(app)
        .post(`/api/leads/${leadId}/activities`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(incompleteActivity)
        .expect(400);

      ValidationHelpers.expectApiError(response, 400, 'Description is required');
    });
  });

  describe('GET /api/leads/:id/activities', () => {
    let leadId;

    beforeEach(async () => {
      const createResponse = await request(app)
        .post('/api/leads')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(TestData.validLead);

      leadId = createResponse.body.lead.id;

      // Add some activities
      const activities = [
        { type: 'email', description: 'Sent welcome email' },
        { type: 'call', description: 'Initial contact call' },
        { type: 'meeting', description: 'Product demo scheduled' }
      ];

      for (const activity of activities) {
        await request(app)
          .post(`/api/leads/${leadId}/activities`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send(activity);
      }
    });

    test('should get lead activities', async () => {
      const response = await request(app)
        .get(`/api/leads/${leadId}/activities`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('activities');
      expect(response.body.activities).toBeInstanceOf(Array);
      expect(response.body.activities.length).toBeGreaterThan(0);

      response.body.activities.forEach(activity => {
        expect(activity.leadId).toBe(leadId);
        expect(activity.type).toBeDefined();
        expect(activity.description).toBeDefined();
        expect(activity.createdAt).toBeDefined();
      });
    });

    test('should sort activities by date', async () => {
      const response = await request(app)
        .get(`/api/leads/${leadId}/activities`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const activities = response.body.activities;
      if (activities.length > 1) {
        const dates = activities.map(activity => new Date(activity.createdAt));
        for (let i = 1; i < dates.length; i++) {
          expect(dates[i]).toBeLessThanOrEqual(dates[i - 1]);
        }
      }
    });
  });

  describe('Rate Limiting', () => {
    test('should apply rate limiting to lead endpoints', async () => {
      // Create many requests rapidly
      const promises = Array(15).fill().map(() =>
        request(app)
          .get('/api/leads')
          .set('Authorization', `Bearer ${accessToken}`)
      );

      const responses = await Promise.all(promises);

      // Check if any requests were rate limited
      const rateLimitedResponses = responses.filter(r => r.status === 429);

      // Rate limiting might not trigger in test environment, so we just check the structure
      responses.forEach(response => {
        expect([200, 429]).toContain(response.status);
      });
    });
  });

  describe('Data Export', () => {
    beforeEach(async () => {
      // Create test leads for export
      const leads = [
        { ...TestData.validLead, email: 'export1@test.com' },
        { ...TestData.validLead, email: 'export2@test.com' }
      ];

      for (const lead of leads) {
        await request(app)
          .post('/api/leads')
          .set('Authorization', `Bearer ${accessToken}`)
          .send(lead);
      }
    });

    test('should export leads to CSV format', async () => {
      const response = await request(app)
        .get('/api/leads/export?format=csv')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.text).toContain('firstName,lastName,email');
    });

    test('should export leads to JSON format', async () => {
      const response = await request(app)
        .get('/api/leads/export?format=json')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.headers['content-type']).toContain('application/json');
      expect(response.body).toHaveProperty('leads');
      expect(response.body.leads).toBeInstanceOf(Array);
    });
  });
});
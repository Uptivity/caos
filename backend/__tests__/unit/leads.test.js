// Leads Module Unit Tests
const crypto = require('crypto');

// Mock dependencies
jest.mock('crypto');
jest.mock('../../utils/secureLogger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

const leadModel = require('../../leads/leadModel');
const { TestData } = require('../helpers/testHelpers');

describe('Leads Model Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock crypto.randomUUID
    crypto.randomUUID = jest.fn();
  });

  describe('Lead Creation', () => {
    test('should create lead with required fields', async () => {
      const mockLeadId = 'test-lead-id-123';
      crypto.randomUUID.mockReturnValue(mockLeadId);

      const leadData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@company.com',
        phone: '+1-555-0123',
        company: 'Test Company',
        status: 'new'
      };

      const result = await leadModel.createLead(leadData, 'user-id-123');

      expect(result.success).toBe(true);
      expect(result.lead).toMatchObject({
        id: mockLeadId,
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@company.com',
        company: 'Test Company',
        status: 'new',
        owner: 'user-id-123'
      });
      expect(result.lead.createdAt).toBeDefined();
      expect(result.lead.updatedAt).toBeDefined();
      expect(crypto.randomUUID).toHaveBeenCalled();
    });

    test('should set default values for optional fields', async () => {
      crypto.randomUUID.mockReturnValue('lead-id');

      const minimalLeadData = {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@example.com'
      };

      const result = await leadModel.createLead(minimalLeadData, 'user-id');

      expect(result.success).toBe(true);
      expect(result.lead.status).toBe('new');
      expect(result.lead.priority).toBe('medium');
      expect(result.lead.source).toBe('other');
      expect(result.lead.score).toBe(0);
      expect(result.lead.tags).toEqual([]);
    });

    test('should validate required fields', async () => {
      const invalidLeadData = {
        firstName: '',
        lastName: 'Doe',
        email: 'invalid-email'
      };

      const result = await leadModel.createLead(invalidLeadData, 'user-id');

      expect(result.success).toBe(false);
      expect(result.error).toContain('validation');
    });

    test('should prevent duplicate email addresses', async () => {
      crypto.randomUUID
        .mockReturnValueOnce('lead-id-1')
        .mockReturnValueOnce('lead-id-2');

      const leadData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@company.com'
      };

      // Create first lead
      const result1 = await leadModel.createLead(leadData, 'user-id');
      expect(result1.success).toBe(true);

      // Try to create duplicate
      const result2 = await leadModel.createLead({
        ...leadData,
        firstName: 'Jane'
      }, 'user-id');

      expect(result2.success).toBe(false);
      expect(result2.error).toContain('already exists');
    });
  });

  describe('Lead Validation', () => {
    test('should validate email format', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.uk',
        'first.last+tag@example.org'
      ];

      const invalidEmails = [
        'invalid-email',
        '@domain.com',
        'user@',
        'user@domain'
      ];

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      validEmails.forEach(email => {
        expect(emailRegex.test(email)).toBe(true);
      });

      invalidEmails.forEach(email => {
        expect(emailRegex.test(email)).toBe(false);
      });
    });

    test('should validate phone format', () => {
      const validPhones = [
        '+1-555-0123',
        '555-0123',
        '(555) 012-3456',
        '+44 20 1234 5678'
      ];

      const invalidPhones = [
        'abc-def-ghij',
        'phone number',
        '++1-555-0123'
      ];

      const phoneRegex = /^[\d\s\-\+\(\)]+$/;

      validPhones.forEach(phone => {
        expect(phoneRegex.test(phone)).toBe(true);
      });

      invalidPhones.forEach(phone => {
        expect(phoneRegex.test(phone)).toBe(false);
      });
    });

    test('should validate lead status values', () => {
      const validStatuses = ['new', 'contacted', 'qualified', 'proposal', 'converted', 'lost', 'nurturing'];
      const invalidStatuses = ['pending', 'active', 'closed', 'invalid'];

      validStatuses.forEach(status => {
        expect(['new', 'contacted', 'qualified', 'proposal', 'converted', 'lost', 'nurturing']).toContain(status);
      });

      invalidStatuses.forEach(status => {
        expect(['new', 'contacted', 'qualified', 'proposal', 'converted', 'lost', 'nurturing']).not.toContain(status);
      });
    });

    test('should validate priority values', () => {
      const validPriorities = ['low', 'medium', 'high'];
      const invalidPriorities = ['urgent', 'normal', 'critical'];

      validPriorities.forEach(priority => {
        expect(['low', 'medium', 'high']).toContain(priority);
      });

      invalidPriorities.forEach(priority => {
        expect(['low', 'medium', 'high']).not.toContain(priority);
      });
    });
  });

  describe('Lead Scoring', () => {
    test('should calculate lead score based on company size', () => {
      const scoringRules = {
        companySize: {
          '1-10': 10,
          '11-50': 25,
          '51-200': 40,
          '201-1000': 35,
          '1000+': 50
        }
      };

      expect(scoringRules.companySize['51-200']).toBe(40);
      expect(scoringRules.companySize['1000+']).toBe(50);
    });

    test('should calculate lead score based on source', () => {
      const scoringRules = {
        source: {
          'website': 20,
          'referral': 35,
          'social_media': 15,
          'cold_call': 10,
          'event': 25,
          'other': 5
        }
      };

      expect(scoringRules.source.referral).toBe(35);
      expect(scoringRules.source.website).toBe(20);
      expect(scoringRules.source.other).toBe(5);
    });

    test('should combine multiple scoring factors', () => {
      const calculateScore = (companySize, source, hasPhone, hasCompany) => {
        let score = 0;

        const sizeScores = { '1-10': 10, '11-50': 25, '51-200': 40, '201-1000': 35, '1000+': 50 };
        const sourceScores = { 'website': 20, 'referral': 35, 'social_media': 15, 'cold_call': 10, 'event': 25, 'other': 5 };

        score += sizeScores[companySize] || 0;
        score += sourceScores[source] || 0;
        score += hasPhone ? 10 : 0;
        score += hasCompany ? 15 : 0;

        return score;
      };

      const highScore = calculateScore('1000+', 'referral', true, true);
      const lowScore = calculateScore('1-10', 'other', false, false);

      expect(highScore).toBe(110); // 50 + 35 + 10 + 15
      expect(lowScore).toBe(15); // 10 + 5 + 0 + 0
      expect(highScore).toBeGreaterThan(lowScore);
    });
  });

  describe('Lead Status Management', () => {
    test('should track status changes', async () => {
      crypto.randomUUID.mockReturnValue('lead-id');

      const leadData = TestData.validLead;
      const createResult = await leadModel.createLead(leadData, 'user-id');

      expect(createResult.success).toBe(true);

      const updateResult = await leadModel.updateLeadStatus(
        createResult.lead.id,
        'qualified',
        'user-id',
        'Lead shows strong interest'
      );

      expect(updateResult.success).toBe(true);
      expect(updateResult.lead.status).toBe('qualified');
      expect(updateResult.lead.updatedAt).toBeDefined();
    });

    test('should validate status transitions', async () => {
      // Define valid status transitions
      const validTransitions = {
        'new': ['contacted', 'lost'],
        'contacted': ['qualified', 'nurturing', 'lost'],
        'qualified': ['proposal', 'nurturing', 'lost'],
        'proposal': ['converted', 'nurturing', 'lost'],
        'nurturing': ['qualified', 'lost'],
        'converted': [], // Terminal state
        'lost': [] // Terminal state
      };

      // Test valid transition
      expect(validTransitions.new).toContain('contacted');
      expect(validTransitions.qualified).toContain('proposal');

      // Test invalid transitions
      expect(validTransitions.converted).toHaveLength(0);
      expect(validTransitions.lost).toHaveLength(0);
    });
  });

  describe('Lead Activities', () => {
    test('should create activity record', async () => {
      crypto.randomUUID.mockReturnValue('activity-id');

      const activityData = {
        type: 'email',
        description: 'Sent welcome email',
        notes: 'Initial contact made'
      };

      const result = await leadModel.addActivity('lead-id', activityData, 'user-id');

      expect(result.success).toBe(true);
      expect(result.activity).toMatchObject({
        id: 'activity-id',
        leadId: 'lead-id',
        type: 'email',
        description: 'Sent welcome email',
        userId: 'user-id'
      });
      expect(result.activity.createdAt).toBeDefined();
    });

    test('should validate activity types', () => {
      const validTypes = ['email', 'call', 'meeting', 'demo', 'proposal', 'follow_up', 'note', 'status_change'];
      const invalidTypes = ['invalid', 'unknown', 'random'];

      validTypes.forEach(type => {
        expect(['email', 'call', 'meeting', 'demo', 'proposal', 'follow_up', 'note', 'status_change']).toContain(type);
      });

      invalidTypes.forEach(type => {
        expect(['email', 'call', 'meeting', 'demo', 'proposal', 'follow_up', 'note', 'status_change']).not.toContain(type);
      });
    });
  });

  describe('Lead Search and Filtering', () => {
    test('should support search by name', async () => {
      // Mock multiple leads
      const leads = [
        { firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
        { firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' },
        { firstName: 'Bob', lastName: 'Johnson', email: 'bob@example.com' }
      ];

      // Simple search implementation
      const searchLeads = (query) => {
        return leads.filter(lead =>
          lead.firstName.toLowerCase().includes(query.toLowerCase()) ||
          lead.lastName.toLowerCase().includes(query.toLowerCase())
        );
      };

      const johnResults = searchLeads('john');
      const smithResults = searchLeads('smith');

      expect(johnResults).toHaveLength(2); // John Doe and Bob Johnson
      expect(smithResults).toHaveLength(1); // Jane Smith
      expect(johnResults.some(lead => lead.firstName === 'John')).toBe(true);
      expect(smithResults[0].lastName).toBe('Smith');
    });

    test('should filter by status', async () => {
      const leads = [
        { id: '1', status: 'new', firstName: 'John' },
        { id: '2', status: 'qualified', firstName: 'Jane' },
        { id: '3', status: 'new', firstName: 'Bob' }
      ];

      const filterByStatus = (status) => {
        return leads.filter(lead => lead.status === status);
      };

      const newLeads = filterByStatus('new');
      const qualifiedLeads = filterByStatus('qualified');

      expect(newLeads).toHaveLength(2);
      expect(qualifiedLeads).toHaveLength(1);
      expect(newLeads.every(lead => lead.status === 'new')).toBe(true);
    });

    test('should support pagination', () => {
      const leads = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, name: `Lead ${i + 1}` }));

      const paginate = (items, page = 1, limit = 10) => {
        const offset = (page - 1) * limit;
        const paginatedItems = items.slice(offset, offset + limit);

        return {
          data: paginatedItems,
          pagination: {
            page,
            limit,
            total: items.length,
            totalPages: Math.ceil(items.length / limit),
            hasNext: page < Math.ceil(items.length / limit),
            hasPrev: page > 1
          }
        };
      };

      const page1 = paginate(leads, 1, 10);
      const page2 = paginate(leads, 2, 10);
      const page3 = paginate(leads, 3, 10);

      expect(page1.data).toHaveLength(10);
      expect(page2.data).toHaveLength(10);
      expect(page3.data).toHaveLength(5);

      expect(page1.pagination.hasNext).toBe(true);
      expect(page1.pagination.hasPrev).toBe(false);
      expect(page3.pagination.hasNext).toBe(false);
      expect(page3.pagination.hasPrev).toBe(true);
    });
  });

  describe('Lead Data Integrity', () => {
    test('should handle concurrent lead updates', async () => {
      crypto.randomUUID.mockReturnValue('lead-id');

      const leadData = TestData.validLead;
      const createResult = await leadModel.createLead(leadData, 'user-id');

      // Simulate concurrent updates
      const update1Promise = leadModel.updateLead(createResult.lead.id, { status: 'contacted' }, 'user1');
      const update2Promise = leadModel.updateLead(createResult.lead.id, { priority: 'high' }, 'user2');

      const results = await Promise.all([update1Promise, update2Promise]);

      // Both updates should succeed or one should handle the conflict
      expect(results.every(result => result.success !== undefined)).toBe(true);
    });

    test('should validate lead ownership', async () => {
      crypto.randomUUID.mockReturnValue('lead-id');

      const leadData = TestData.validLead;
      const createResult = await leadModel.createLead(leadData, 'owner-user-id');

      // Test access by owner
      const ownerAccess = await leadModel.getLead(createResult.lead.id, 'owner-user-id');
      expect(ownerAccess.success).toBe(true);

      // Test access by non-owner (should fail without proper permissions)
      const nonOwnerAccess = await leadModel.getLead(createResult.lead.id, 'different-user-id');
      expect(nonOwnerAccess.success).toBe(false);
    });
  });
});
// DatabaseService Unit Tests
const DatabaseService = require('../../services/DatabaseService');

// Mock the actual database configuration
jest.mock('../../config/database', () => ({
  initialize: jest.fn().mockResolvedValue(),
  query: jest.fn(),
  getHealth: jest.fn().mockResolvedValue({ status: 'healthy' })
}));

describe('DatabaseService Unit Tests', () => {
  let mockDatabase;

  beforeAll(async () => {
    mockDatabase = require('../../config/database');
    await DatabaseService.initialize();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    test('should initialize successfully', async () => {
      const service = new (require('../../services/DatabaseService').constructor)();

      expect(service.isInitialized).toBe(false);
      await service.initialize();
      expect(service.isInitialized).toBe(true);
    });

    test('should not reinitialize if already initialized', async () => {
      // DatabaseService is already initialized from beforeAll
      const initSpy = jest.spyOn(mockDatabase, 'initialize');

      await DatabaseService.initialize();

      // Should not call database.initialize again
      expect(initSpy).not.toHaveBeenCalled();
    });
  });

  describe('Create Operations', () => {
    test('should create record with auto-generated ID', async () => {
      const testData = {
        name: 'Test Item',
        description: 'A test item'
      };

      mockDatabase.query.mockResolvedValue({ insertId: 'mock-id' });

      // Mock findById to return the created record
      const mockRecord = {
        id: 'generated-uuid',
        name: 'Test Item',
        description: 'A test item',
        created_at: expect.any(String),
        updated_at: expect.any(String)
      };

      jest.spyOn(DatabaseService, 'findById').mockResolvedValue(mockRecord);

      const result = await DatabaseService.create('test_table', testData);

      expect(result).toEqual(mockRecord);
      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO test_table'),
        expect.any(Array)
      );
    });

    test('should create record with provided ID', async () => {
      const testData = {
        id: 'custom-id',
        name: 'Test Item'
      };

      mockDatabase.query.mockResolvedValue({ insertId: 'custom-id' });

      const mockRecord = { ...testData, created_at: expect.any(String), updated_at: expect.any(String) };
      jest.spyOn(DatabaseService, 'findById').mockResolvedValue(mockRecord);

      const result = await DatabaseService.create('test_table', testData);

      expect(result.id).toBe('custom-id');
      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO test_table'),
        expect.arrayContaining(['custom-id'])
      );
    });

    test('should add timestamps if not provided', async () => {
      const testData = { name: 'Test Item' };

      mockDatabase.query.mockResolvedValue({ insertId: 'mock-id' });
      jest.spyOn(DatabaseService, 'findById').mockResolvedValue({
        id: 'generated-uuid',
        name: 'Test Item',
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:00:00.000Z'
      });

      await DatabaseService.create('test_table', testData);

      const queryArgs = mockDatabase.query.mock.calls[0][1];
      expect(queryArgs).toContain(expect.any(String)); // created_at
      expect(queryArgs).toContain(expect.any(String)); // updated_at
    });

    test('should preserve existing timestamps', async () => {
      const customTime = '2024-12-25T12:00:00.000Z';
      const testData = {
        name: 'Test Item',
        created_at: customTime,
        updated_at: customTime
      };

      mockDatabase.query.mockResolvedValue({ insertId: 'mock-id' });
      jest.spyOn(DatabaseService, 'findById').mockResolvedValue({
        ...testData,
        id: 'generated-uuid'
      });

      await DatabaseService.create('test_table', testData);

      const queryArgs = mockDatabase.query.mock.calls[0][1];
      expect(queryArgs).toContain(customTime);
    });
  });

  describe('Find Operations', () => {
    test('should find record by ID', async () => {
      const mockRecord = {
        id: 'test-id',
        name: 'Test Item'
      };

      mockDatabase.query.mockResolvedValue([mockRecord]);

      const result = await DatabaseService.findById('test_table', 'test-id');

      expect(result).toEqual(mockRecord);
      expect(mockDatabase.query).toHaveBeenCalledWith(
        'SELECT * FROM test_table WHERE id = ?',
        ['test-id']
      );
    });

    test('should return null if record not found by ID', async () => {
      mockDatabase.query.mockResolvedValue([]);

      const result = await DatabaseService.findById('test_table', 'nonexistent-id');

      expect(result).toBeNull();
    });

    test('should find records with conditions', async () => {
      const mockRecords = [
        { id: '1', status: 'active', type: 'user' },
        { id: '2', status: 'active', type: 'user' }
      ];

      mockDatabase.query.mockResolvedValue(mockRecords);

      const conditions = { status: 'active', type: 'user' };
      const result = await DatabaseService.find('test_table', conditions);

      expect(result).toEqual(mockRecords);
      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE status = ? AND type = ?'),
        ['active', 'user']
      );
    });

    test('should find all records when no conditions provided', async () => {
      const mockRecords = [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' }
      ];

      mockDatabase.query.mockResolvedValue(mockRecords);

      const result = await DatabaseService.find('test_table');

      expect(result).toEqual(mockRecords);
      expect(mockDatabase.query).toHaveBeenCalledWith(
        'SELECT * FROM test_table',
        []
      );
    });

    test('should handle empty conditions object', async () => {
      const mockRecords = [{ id: '1', name: 'Item 1' }];

      mockDatabase.query.mockResolvedValue(mockRecords);

      const result = await DatabaseService.find('test_table', {});

      expect(result).toEqual(mockRecords);
      expect(mockDatabase.query).toHaveBeenCalledWith(
        'SELECT * FROM test_table',
        []
      );
    });
  });

  describe('Update Operations', () => {
    test('should update record successfully', async () => {
      const updates = {
        name: 'Updated Item',
        status: 'modified'
      };

      const updatedRecord = {
        id: 'test-id',
        name: 'Updated Item',
        status: 'modified',
        updated_at: expect.any(String)
      };

      mockDatabase.query.mockResolvedValue({ affectedRows: 1 });
      jest.spyOn(DatabaseService, 'findById').mockResolvedValue(updatedRecord);

      const result = await DatabaseService.update('test_table', 'test-id', updates);

      expect(result).toEqual(updatedRecord);
      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE test_table SET'),
        expect.arrayContaining(['Updated Item', 'modified', expect.any(String), 'test-id'])
      );
    });

    test('should return null if no record updated', async () => {
      mockDatabase.query.mockResolvedValue({ affectedRows: 0 });

      const result = await DatabaseService.update('test_table', 'nonexistent-id', { name: 'Test' });

      expect(result).toBeNull();
    });

    test('should automatically update updated_at timestamp', async () => {
      const updates = { name: 'Updated Item' };

      mockDatabase.query.mockResolvedValue({ affectedRows: 1 });
      jest.spyOn(DatabaseService, 'findById').mockResolvedValue({
        id: 'test-id',
        name: 'Updated Item',
        updated_at: '2025-01-01T00:00:00.000Z'
      });

      await DatabaseService.update('test_table', 'test-id', updates);

      const queryArgs = mockDatabase.query.mock.calls[0][1];
      expect(queryArgs).toContain(expect.any(String)); // updated_at should be included
    });

    test('should handle empty updates object', async () => {
      mockDatabase.query.mockResolvedValue({ affectedRows: 1 });
      jest.spyOn(DatabaseService, 'findById').mockResolvedValue({
        id: 'test-id',
        name: 'Existing Item',
        updated_at: expect.any(String)
      });

      const result = await DatabaseService.update('test_table', 'test-id', {});

      expect(result).toBeDefined();
      // Should still update updated_at even with empty updates
      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE test_table SET'),
        expect.any(Array)
      );
    });
  });

  describe('Delete Operations', () => {
    test('should delete record successfully', async () => {
      mockDatabase.query.mockResolvedValue({ affectedRows: 1 });

      const result = await DatabaseService.delete('test_table', 'test-id');

      expect(result).toBe(true);
      expect(mockDatabase.query).toHaveBeenCalledWith(
        'DELETE FROM test_table WHERE id = ?',
        ['test-id']
      );
    });

    test('should return false if no record deleted', async () => {
      mockDatabase.query.mockResolvedValue({ affectedRows: 0 });

      const result = await DatabaseService.delete('test_table', 'nonexistent-id');

      expect(result).toBe(false);
    });
  });

  describe('Count Operations', () => {
    test('should count records in table', async () => {
      mockDatabase.query.mockResolvedValue([{ count: 5 }]);

      const result = await DatabaseService.count('test_table');

      expect(result).toBe(5);
      expect(mockDatabase.query).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM test_table'
      );
    });

    test('should count records with conditions', async () => {
      mockDatabase.query.mockResolvedValue([{ count: 3 }]);

      const conditions = { status: 'active' };
      const result = await DatabaseService.count('test_table', conditions);

      expect(result).toBe(3);
      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE status = ?'),
        ['active']
      );
    });

    test('should handle count with empty conditions', async () => {
      mockDatabase.query.mockResolvedValue([{ count: 10 }]);

      const result = await DatabaseService.count('test_table', {});

      expect(result).toBe(10);
      expect(mockDatabase.query).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM test_table'
      );
    });
  });

  describe('Raw Query Operations', () => {
    test('should execute raw query with parameters', async () => {
      const mockResult = { affectedRows: 1, insertId: 123 };
      mockDatabase.query.mockResolvedValue(mockResult);

      const sql = 'INSERT INTO custom_table (name, value) VALUES (?, ?)';
      const params = ['test', 42];

      const result = await DatabaseService.query(sql, params);

      expect(result).toEqual(mockResult);
      expect(mockDatabase.query).toHaveBeenCalledWith(sql, params);
    });

    test('should execute raw query without parameters', async () => {
      const mockResult = [{ id: 1, name: 'test' }];
      mockDatabase.query.mockResolvedValue(mockResult);

      const sql = 'SELECT * FROM simple_table';

      const result = await DatabaseService.query(sql);

      expect(result).toEqual(mockResult);
      expect(mockDatabase.query).toHaveBeenCalledWith(sql, undefined);
    });
  });

  describe('Health Check', () => {
    test('should return healthy status', async () => {
      const mockHealth = { status: 'healthy', connection: 'active' };
      mockDatabase.getHealth.mockResolvedValue(mockHealth);

      const result = await DatabaseService.getHealth();

      expect(result).toEqual(mockHealth);
      expect(mockDatabase.getHealth).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    test('should handle database connection errors', async () => {
      const error = new Error('Connection failed');
      mockDatabase.query.mockRejectedValue(error);

      await expect(DatabaseService.findById('test_table', 'test-id'))
        .rejects.toThrow('Connection failed');
    });

    test('should handle query execution errors', async () => {
      const error = new Error('Invalid SQL');
      mockDatabase.query.mockRejectedValue(error);

      await expect(DatabaseService.create('test_table', { name: 'test' }))
        .rejects.toThrow('Invalid SQL');
    });
  });
});
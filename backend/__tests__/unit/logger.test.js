// Logger Utility Unit Tests
const { logger, createUserActionLogger, auditLogger } = require('../../utils/logger');

// Mock winston to avoid actual logging during tests
jest.mock('winston', () => ({
  format: {
    combine: jest.fn(() => 'mock-format'),
    timestamp: jest.fn(() => 'mock-timestamp'),
    errors: jest.fn(() => 'mock-errors'),
    json: jest.fn(() => 'mock-json'),
    printf: jest.fn(() => 'mock-printf'),
    colorize: jest.fn(() => 'mock-colorize'),
    simple: jest.fn(() => 'mock-simple')
  },
  transports: {
    Console: jest.fn().mockImplementation(() => ({
      name: 'console',
      level: 'info'
    })),
    File: jest.fn().mockImplementation(() => ({
      name: 'file',
      level: 'info'
    }))
  },
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    }))
  }))
}));

describe('Logger Utility Unit Tests', () => {
  let mockLogger;

  beforeEach(() => {
    jest.clearAllMocks();

    // Get the mocked logger instance
    mockLogger = require('winston').createLogger();
  });

  describe('Logger Configuration', () => {
    test('should create logger with default configuration', () => {
      const winston = require('winston');

      expect(winston.createLogger).toHaveBeenCalled();
      expect(winston.format.combine).toHaveBeenCalled();
      expect(winston.format.timestamp).toHaveBeenCalled();
      expect(winston.format.errors).toHaveBeenCalled();
      expect(winston.format.json).toHaveBeenCalled();
    });

    test('should include console transport in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      // Re-require to trigger logger initialization
      delete require.cache[require.resolve('../../utils/logger')];
      require('../../utils/logger');

      const winston = require('winston');
      expect(winston.transports.Console).toHaveBeenCalled();

      process.env.NODE_ENV = originalEnv;
    });

    test('should include file transport in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      // Re-require to trigger logger initialization
      delete require.cache[require.resolve('../../utils/logger')];
      require('../../utils/logger');

      const winston = require('winston');
      expect(winston.transports.File).toHaveBeenCalled();

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Basic Logging Functions', () => {
    test('should log info messages', () => {
      const message = 'Test info message';
      const meta = { userId: '123', action: 'test' };

      logger.info(message, meta);

      expect(mockLogger.info).toHaveBeenCalledWith(message, expect.objectContaining(meta));
    });

    test('should log error messages', () => {
      const message = 'Test error message';
      const error = new Error('Test error');

      logger.error(message, { error: error.message });

      expect(mockLogger.error).toHaveBeenCalledWith(message, expect.objectContaining({
        error: error.message
      }));
    });

    test('should log warning messages', () => {
      const message = 'Test warning message';
      const meta = { component: 'auth' };

      logger.warn(message, meta);

      expect(mockLogger.warn).toHaveBeenCalledWith(message, expect.objectContaining(meta));
    });

    test('should log debug messages', () => {
      const message = 'Test debug message';
      const meta = { requestId: 'req-123' };

      logger.debug(message, meta);

      expect(mockLogger.debug).toHaveBeenCalledWith(message, expect.objectContaining(meta));
    });
  });

  describe('User Action Logger', () => {
    test('should create user action logger with userId', () => {
      const userId = 'user-123';
      const userLogger = createUserActionLogger(userId);

      expect(mockLogger.child).toHaveBeenCalledWith({ userId });
      expect(userLogger).toBeDefined();
    });

    test('should log user actions with context', () => {
      const userId = 'user-123';
      const userLogger = createUserActionLogger(userId);
      const childLogger = mockLogger.child();

      userLogger.info('User login', { ip: '192.168.1.1' });

      expect(childLogger.info).toHaveBeenCalledWith('User login',
        expect.objectContaining({ ip: '192.168.1.1' })
      );
    });

    test('should handle undefined userId', () => {
      const userLogger = createUserActionLogger();

      expect(mockLogger.child).toHaveBeenCalledWith({ userId: undefined });
      expect(userLogger).toBeDefined();
    });
  });

  describe('Audit Logger', () => {
    test('should be defined', () => {
      expect(auditLogger).toBeDefined();
    });

    test('should log audit events', () => {
      const action = 'USER_CREATED';
      const details = { userId: '123', email: 'test@example.com' };

      auditLogger.info(action, details);

      expect(mockLogger.info).toHaveBeenCalledWith(action, expect.objectContaining(details));
    });

    test('should log security events', () => {
      const event = 'FAILED_LOGIN_ATTEMPT';
      const details = { ip: '192.168.1.1', email: 'test@example.com' };

      auditLogger.warn(event, details);

      expect(mockLogger.warn).toHaveBeenCalledWith(event, expect.objectContaining(details));
    });
  });

  describe('Logging Levels', () => {
    test('should support all log levels', () => {
      const levels = ['info', 'error', 'warn', 'debug'];

      levels.forEach(level => {
        logger[level](`Test ${level} message`);
        expect(mockLogger[level]).toHaveBeenCalled();
      });
    });
  });

  describe('Metadata Handling', () => {
    test('should include environment metadata', () => {
      const originalEnv = process.env.NODE_ENV;
      const originalVersion = process.env.npm_package_version;

      process.env.NODE_ENV = 'test';
      process.env.npm_package_version = '1.0.0';

      logger.info('Test with environment');

      expect(mockLogger.info).toHaveBeenCalledWith('Test with environment',
        expect.objectContaining({
          environment: 'test',
          service: 'caos-crm-backend',
          version: '1.0.0'
        })
      );

      process.env.NODE_ENV = originalEnv;
      process.env.npm_package_version = originalVersion;
    });

    test('should handle missing environment variables', () => {
      const originalEnv = process.env.NODE_ENV;
      delete process.env.NODE_ENV;

      logger.info('Test without NODE_ENV');

      expect(mockLogger.info).toHaveBeenCalledWith('Test without NODE_ENV',
        expect.objectContaining({
          environment: undefined,
          service: 'caos-crm-backend'
        })
      );

      process.env.NODE_ENV = originalEnv;
    });

    test('should merge custom metadata', () => {
      const customMeta = {
        requestId: 'req-123',
        userId: 'user-456',
        action: 'CREATE_USER'
      };

      logger.info('Custom metadata test', customMeta);

      expect(mockLogger.info).toHaveBeenCalledWith('Custom metadata test',
        expect.objectContaining(customMeta)
      );
    });
  });

  describe('Error Handling', () => {
    test('should handle Error objects', () => {
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.js:1:1';

      logger.error('Error occurred', { error });

      expect(mockLogger.error).toHaveBeenCalledWith('Error occurred',
        expect.objectContaining({
          error: expect.any(Error)
        })
      );
    });

    test('should handle error messages', () => {
      const errorMessage = 'Something went wrong';

      logger.error('Error message test', { error: errorMessage });

      expect(mockLogger.error).toHaveBeenCalledWith('Error message test',
        expect.objectContaining({
          error: errorMessage
        })
      );
    });

    test('should handle nested error objects', () => {
      const nestedError = {
        message: 'Nested error',
        code: 'ERR_TEST',
        details: { field: 'value' }
      };

      logger.error('Nested error test', { error: nestedError });

      expect(mockLogger.error).toHaveBeenCalledWith('Nested error test',
        expect.objectContaining({
          error: nestedError
        })
      );
    });
  });

  describe('Performance Logging', () => {
    test('should log with timing information', () => {
      const startTime = Date.now();
      const endTime = startTime + 150;

      logger.info('Operation completed', {
        duration: endTime - startTime,
        operation: 'database_query'
      });

      expect(mockLogger.info).toHaveBeenCalledWith('Operation completed',
        expect.objectContaining({
          duration: 150,
          operation: 'database_query'
        })
      );
    });

    test('should log with memory usage', () => {
      const memoryUsage = process.memoryUsage();

      logger.debug('Memory usage', { memory: memoryUsage });

      expect(mockLogger.debug).toHaveBeenCalledWith('Memory usage',
        expect.objectContaining({
          memory: expect.any(Object)
        })
      );
    });
  });

  describe('Structured Logging', () => {
    test('should support structured log format', () => {
      const structuredLog = {
        event: 'USER_ACTION',
        userId: 'user-123',
        action: 'LOGIN',
        timestamp: new Date().toISOString(),
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0'
      };

      logger.info('User action logged', structuredLog);

      expect(mockLogger.info).toHaveBeenCalledWith('User action logged',
        expect.objectContaining(structuredLog)
      );
    });

    test('should handle arrays in metadata', () => {
      const arrayData = {
        items: ['item1', 'item2', 'item3'],
        tags: ['tag1', 'tag2']
      };

      logger.info('Array data test', arrayData);

      expect(mockLogger.info).toHaveBeenCalledWith('Array data test',
        expect.objectContaining(arrayData)
      );
    });

    test('should handle complex objects', () => {
      const complexObject = {
        user: {
          id: 'user-123',
          profile: {
            name: 'John Doe',
            preferences: {
              theme: 'dark',
              notifications: true
            }
          }
        },
        request: {
          method: 'POST',
          path: '/api/users',
          headers: { 'content-type': 'application/json' }
        }
      };

      logger.info('Complex object test', complexObject);

      expect(mockLogger.info).toHaveBeenCalledWith('Complex object test',
        expect.objectContaining(complexObject)
      );
    });
  });
});
// Test setup configuration for CAOS CRM Backend
require('dotenv').config({ path: '.env.test' });

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.JWT_EXPIRES_IN = '1h';
process.env.REFRESH_TOKEN_EXPIRES_IN = '7d';
process.env.BCRYPT_ROUNDS = '4'; // Faster hashing for tests

// Mock the DatabaseService globally for all tests
jest.mock('../services/DatabaseService', () => {
  return require('./mocks/databaseMock');
});

// Mock metrics middleware to prevent timer issues in tests
jest.mock('../middleware/metricsMiddleware', () => ({
  metricsCollector: {
    collectMetrics: jest.fn(),
    initializeMetrics: jest.fn(),
    getMetricsText: jest.fn().mockResolvedValue('# Mock metrics'),
    httpRequestDuration: { observe: jest.fn() },
    httpRequestsTotal: { inc: jest.fn() },
    performanceTracker: { track: jest.fn() }
  }
}));

// Mock express-rate-limit to disable rate limiting in tests
jest.mock('express-rate-limit', () => {
  return () => (req, res, next) => next();
});

// Global test timeout
jest.setTimeout(10000);

// Mock console methods to reduce noise during testing
const originalConsole = { ...console };
global.console = {
  ...console,
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Restore console for specific tests if needed
global.restoreConsole = () => {
  global.console = originalConsole;
};

// Test data cleanup
beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();
});

afterAll(() => {
  // Restore console
  global.console = originalConsole;
});
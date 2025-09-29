// Jest configuration for CAOS CRM Backend
module.exports = {
  // Test environment
  testEnvironment: 'node',

  // Root directory
  rootDir: '.',

  // Test directories
  testMatch: [
    '<rootDir>/__tests__/**/*.test.js',
    '<rootDir>/**/__tests__/**/*.test.js'
  ],

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],

  // Coverage configuration
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json'],

  // Coverage thresholds for production-ready modules
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },

  // Files to collect coverage from - focusing on production-ready modules
  collectCoverageFrom: [
    'auth/**/*.js',
    'services/AuthService.js',
    'services/DatabaseService.js',
    'utils/logger.js',
    'utils/secureLogger.js',
    'middleware/authMiddleware.js',
    'middleware/performanceMiddleware.js',
    'middleware/metricsMiddleware.js',
    '!**/node_modules/**',
    '!**/*.test.js',
    '!**/coverage/**'
  ],

  // Module paths
  modulePaths: ['<rootDir>'],

  // Test timeout
  testTimeout: 10000,

  // Verbose output
  verbose: true,

  // Clear mocks between tests
  clearMocks: true,

  // Restore mocks after each test
  restoreMocks: true,

  // Force exit after tests complete
  forceExit: true,

  // Detect open handles
  detectOpenHandles: true
};
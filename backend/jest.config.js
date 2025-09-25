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

  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50
    }
  },

  // Files to collect coverage from
  collectCoverageFrom: [
    'auth/**/*.js',
    'leads/**/*.js',
    'products/**/*.js',
    'campaigns/**/*.js',
    'utils/**/*.js',
    'middleware/**/*.js',
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
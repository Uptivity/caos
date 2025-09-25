#!/usr/bin/env node

/**
 * Test Runner Script for CAOS CRM Backend
 * Provides advanced test execution and reporting capabilities
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Test suite configurations
const testSuites = {
  unit: {
    command: 'npm run test:unit',
    description: 'Unit tests for core business logic',
    timeout: 30000
  },
  integration: {
    command: 'npm run test:integration',
    description: 'Integration tests for API endpoints',
    timeout: 60000
  },
  auth: {
    command: 'npm run test:auth',
    description: 'Authentication system tests',
    timeout: 20000
  },
  leads: {
    command: 'npm run test:leads',
    description: 'Leads management tests',
    timeout: 30000
  },
  products: {
    command: 'npm run test:products',
    description: 'Products management tests',
    timeout: 30000
  },
  endpoints: {
    command: 'npm run test:endpoints',
    description: 'Comprehensive API endpoint tests',
    timeout: 90000
  },
  coverage: {
    command: 'npm run test:coverage',
    description: 'Generate test coverage report',
    timeout: 120000
  },
  all: {
    command: 'npm test',
    description: 'Run all tests',
    timeout: 180000
  }
};

/**
 * Execute a test suite
 */
function runTestSuite(suiteName) {
  return new Promise((resolve, reject) => {
    const suite = testSuites[suiteName];

    if (!suite) {
      reject(new Error(`Unknown test suite: ${suiteName}`));
      return;
    }

    console.log(`\n🧪 Running ${suite.description}...`);
    console.log(`📋 Command: ${suite.command}`);

    const startTime = Date.now();
    const child = exec(suite.command, {
      cwd: __dirname,
      timeout: suite.timeout
    });

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (data) => {
      process.stdout.write(data);
      output += data;
    });

    child.stderr.on('data', (data) => {
      process.stderr.write(data);
      errorOutput += data;
    });

    child.on('close', (code) => {
      const endTime = Date.now();
      const duration = endTime - startTime;

      const result = {
        suite: suiteName,
        description: suite.description,
        code,
        duration,
        output,
        errorOutput,
        success: code === 0
      };

      if (code === 0) {
        console.log(`✅ ${suite.description} completed successfully (${duration}ms)`);
      } else {
        console.log(`❌ ${suite.description} failed with code ${code} (${duration}ms)`);
      }

      resolve(result);
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Generate test report
 */
function generateReport(results) {
  const totalTests = results.length;
  const passedTests = results.filter(r => r.success).length;
  const failedTests = totalTests - passedTests;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total: totalTests,
      passed: passedTests,
      failed: failedTests,
      duration: totalDuration,
      success: failedTests === 0
    },
    results
  };

  // Write JSON report
  fs.writeFileSync(
    path.join(__dirname, '../coverage/test-report.json'),
    JSON.stringify(report, null, 2)
  );

  // Write text summary
  const textReport = `
CAOS CRM Backend Test Report
===========================
Generated: ${report.timestamp}

Summary:
- Total test suites: ${totalTests}
- Passed: ${passedTests}
- Failed: ${failedTests}
- Total duration: ${totalDuration}ms
- Overall status: ${report.summary.success ? 'PASS' : 'FAIL'}

Details:
${results.map(r => `- ${r.description}: ${r.success ? 'PASS' : 'FAIL'} (${r.duration}ms)`).join('\n')}

${failedTests > 0 ? '\nFailed suites require attention before deployment.' : '\nAll tests passed! Ready for deployment.'}
`;

  fs.writeFileSync(
    path.join(__dirname, '../coverage/test-report.txt'),
    textReport
  );

  return report;
}

/**
 * Main execution function
 */
async function main() {
  const args = process.argv.slice(2);
  const suitesToRun = args.length > 0 ? args : ['all'];

  console.log('🚀 CAOS CRM Backend Test Runner');
  console.log('================================');
  console.log(`Running test suites: ${suitesToRun.join(', ')}`);

  // Ensure coverage directory exists
  const coverageDir = path.join(__dirname, '../coverage');
  if (!fs.existsSync(coverageDir)) {
    fs.mkdirSync(coverageDir, { recursive: true });
  }

  const results = [];

  try {
    for (const suiteName of suitesToRun) {
      const result = await runTestSuite(suiteName);
      results.push(result);
    }

    const report = generateReport(results);

    console.log('\n📊 Test Execution Complete');
    console.log('===========================');
    console.log(`Total suites: ${report.summary.total}`);
    console.log(`Passed: ${report.summary.passed}`);
    console.log(`Failed: ${report.summary.failed}`);
    console.log(`Duration: ${report.summary.duration}ms`);
    console.log(`Status: ${report.summary.success ? '✅ PASS' : '❌ FAIL'}`);

    if (report.summary.success) {
      console.log('\n🎉 All tests passed! The application is ready for deployment.');
    } else {
      console.log('\n⚠️  Some tests failed. Please review the failures before deployment.');
    }

    console.log('\n📄 Reports generated:');
    console.log('- coverage/test-report.json (detailed JSON report)');
    console.log('- coverage/test-report.txt (summary report)');
    console.log('- coverage/lcov-report/index.html (coverage report)');

    process.exit(report.summary.success ? 0 : 1);

  } catch (error) {
    console.error('\n💥 Test execution failed:', error.message);
    process.exit(1);
  }
}

// Show usage if --help is provided
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
CAOS CRM Backend Test Runner

Usage:
  node testRunner.js [suite1] [suite2] ...

Available test suites:
${Object.entries(testSuites).map(([name, suite]) => `  ${name.padEnd(12)} - ${suite.description}`).join('\n')}

Examples:
  node testRunner.js                    # Run all tests
  node testRunner.js unit integration   # Run unit and integration tests
  node testRunner.js auth leads         # Run auth and leads tests only
  node testRunner.js coverage           # Generate coverage report

Options:
  -h, --help    Show this help message
`);
  process.exit(0);
}

// Run the main function
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
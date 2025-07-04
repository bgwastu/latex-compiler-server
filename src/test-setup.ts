// Test setup file for Jest - completely independent of .env files

import dotenv from 'dotenv';

// Load environment variables for testing
dotenv.config();

// Set NODE_ENV to test to prevent server from starting
process.env.NODE_ENV = 'test';

// Extend Jest timeout globally for LaTeX compilation
jest.setTimeout(60000);

// Clean up console output for cleaner test results
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

beforeEach(() => {
  // Reset all mocks before each test (if any)
  jest.clearAllMocks();
});

afterAll(() => {
  // Restore original console methods
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
});
/**
 * Test Setup
 * Global test configuration and utilities
 */

// Set test environment
process.env.NODE_ENV = 'test';

// Suppress console output during tests unless LOG_LEVEL is set to debug
if (process.env.LOG_LEVEL !== 'debug') {
    const originalConsoleLog = console.log;
    const originalConsoleWarn = console.warn;
    const originalConsoleError = console.error;
    
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
    
    // Restore console methods after tests if needed for debugging
    // You can comment out the above lines or set LOG_LEVEL=debug to see output
}

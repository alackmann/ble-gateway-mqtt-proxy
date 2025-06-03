# Testing Documentation

## Overview
This document describes the testing setup and framework for the BLE Gateway Data Processor application.

## Test Framework
- **Test Runner**: Mocha
- **Assertion Library**: Chai
- **HTTP Testing**: Supertest
- **Mock Data**: Custom utilities in `test/utils.js`

## Test Structure
```
test/
├── basic.test.js       # Basic framework validation tests
├── config.test.js      # Configuration management tests
├── endpoint.test.js    # HTTP endpoint integration tests
├── utils.js           # Test utilities and mock data
└── setup.js           # Test environment setup
```

## Running Tests

### All Tests
```bash
npm test
```

### Watch Mode (for development)
```bash
npm run test:watch
```

### Debug Mode (with console output)
```bash
npm run test:debug
```

### With Coverage (if nyc is installed)
```bash
npm run test:coverage
```

## Test Categories

### 1. Basic Framework Tests (`basic.test.js`)
- Validates Mocha and Chai setup
- Tests basic assertion functionality
- Ensures test framework is working correctly

### 2. Configuration Tests (`config.test.js`)
- Tests environment variable loading
- Validates default configuration values
- Tests configuration validation logic
- Ensures `.env` file support works correctly

### 3. HTTP Endpoint Tests (`endpoint.test.js`)
- Tests POST `/tokendata` endpoint functionality
- Validates Content-Type handling (MessagePack and JSON)
- Tests request body validation
- Verifies proper HTTP status codes
- Tests health check endpoint
- Validates 404 handling

## Test Utilities (`utils.js`)

### Mock Data Functions
- `createMockGatewayData(overrides)` - Creates realistic BLE gateway data
- `createMockMessagePackData(data)` - Encodes data as MessagePack
- `createMockEnvConfig()` - Provides test environment configuration

### Test Helper Functions
- `restoreEnvironment(originalEnv)` - Cleans up environment variables
- `clearRequireCache(modules)` - Clears Node.js require cache for fresh imports

## Current Test Coverage

### Functional Areas Tested
✅ Configuration management and environment variables  
✅ HTTP endpoint basic functionality  
✅ Content-Type validation  
✅ Request body validation  
✅ MessagePack data handling  
✅ Error response handling  
✅ Health check endpoint  

### Areas for Future Testing (as development progresses)
- [ ] BLE device data parsing
- [ ] JSON transformation logic
- [ ] MQTT client connection
- [ ] MQTT message publishing
- [ ] End-to-end integration tests

## Test Data

### Mock BLE Gateway Data
The test utilities create realistic mock data that matches the April Brother BLE Gateway V4 format:

```javascript
{
  v: '1.5.0',                    // Firmware version
  mid: 12345,                    // Message ID
  time: 1234567890,              // Boot time
  ip: '192.168.1.100',           // Gateway IP
  mac: '12:34:56:78:9A:BC',      // Gateway MAC
  rssi: -45,                     // WiFi RSSI
  devices: [                     // Array of BLE device data
    Buffer.from([...])           // Raw advertising data
  ]
}
```

## Development Workflow
1. Write tests first (TDD approach when possible)
2. Run tests in watch mode during development: `npm run test:watch`
3. Ensure all tests pass before committing changes
4. Use debug mode for troubleshooting: `npm run test:debug`

## Notes
- Tests run in isolated environments with cleaned require cache
- Environment variables are properly managed between tests
- Mock data reflects real-world BLE gateway payloads
- Tests are organized by functional area for maintainability

# Testing Documentation

## Overview
This document describes the testing setup and framework for the BLE Gateway Data Processor application.

## Test Framework
- **Test Runner**: Mocha
- **Assertion Library**: Chai
- **HTTP Testing**: Supertest
- **Mocking**: Sinon with Sinon-Chai for enhanced assertions
- **Module Mocking**: Proxyquire for dependency injection
- **Mock Data**: Custom utilities in `test/utils.js`

## Test Structure
```
test/
├── basic.test.js                    # Basic framework validation tests
├── config.test.js                   # Configuration management tests
├── decoding.test.js                 # MessagePack/JSON decoding tests
├── device-parser.test.js            # BLE device parsing logic tests
├── endpoint.test.js                 # HTTP endpoint integration tests
├── gateway-parser.test.js           # Gateway data parsing tests
├── ha-config.test.js                # Home Assistant configuration tests
├── ha-discovery.test.js             # Home Assistant discovery publisher tests
├── ha-integration.test.js           # Home Assistant integration workflow tests
├── ha-state-publishing.test.js      # Home Assistant state publishing tests
├── integration-gateway-mqtt.test.js # Gateway MQTT publishing integration tests
├── integration-test.js              # End-to-end integration tests
├── json-transformer.test.js         # JSON transformation logic tests
├── logger.test.js                   # Logging framework tests
├── manual-decoding-test.js          # Manual decoding verification tests
├── mqtt-client.test.js              # MQTT client functionality tests
├── utils.test.js                    # Utility functions tests
├── utils.js                         # Test utilities and mock data
└── setup.js                         # Test environment setup
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

## Current Test Coverage (226 tests passing)

### Functional Areas Fully Tested
✅ **Configuration Management** - Environment variables, defaults, validation  
✅ **HTTP Endpoints** - Content-Type validation, request handling, error responses  
✅ **Data Decoding** - MessagePack and JSON parsing with edge cases  
✅ **BLE Device Parsing** - Advertisement data parsing, validation, statistics  
✅ **Gateway Data Processing** - Gateway info parsing, metadata extraction  
✅ **JSON Transformation** - Device data transformation, validation, statistics  
✅ **MQTT Client Operations** - Connection, publishing, topic construction  
✅ **Home Assistant Integration** - Auto-discovery, configuration, state publishing  
✅ **Logging Framework** - Log levels, formatting, specialized logging functions  
✅ **Utility Functions** - MAC formatting, string slugification  
✅ **Integration Workflows** - End-to-end data processing flows  

### Test Categories by Coverage

#### Core Functionality (100% Coverage)
- ✅ BLE device advertisement parsing and validation
- ✅ Gateway data extraction and processing  
- ✅ JSON payload transformation and validation
- ✅ MQTT topic construction and message publishing
- ✅ Configuration loading from environment variables

#### Home Assistant Integration (100% Coverage)
- ✅ MQTT Auto Discovery message generation
- ✅ Device configuration parsing from environment variables
- ✅ State topic publishing with proper retention settings
- ✅ Gateway device representation and sensor configuration
- ✅ Integration workflow from startup to message publishing

#### HTTP API (100% Coverage)
- ✅ MessagePack and JSON content-type handling
- ✅ Request body validation and error responses
- ✅ Health check endpoint functionality
- ✅ 404 handling for unknown endpoints

#### Infrastructure (100% Coverage)
- ✅ Logging system with configurable levels
- ✅ MQTT client connection management
- ✅ Environment-based configuration system
- ✅ Error handling and graceful failure modes

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

### Test Utilities (`utils.js`)

#### Mock Data Functions
- `createMockGatewayData(overrides)` - Creates realistic BLE gateway data
- `createMockMessagePackData(data)` - Encodes data as MessagePack
- `createMockEnvConfig()` - Provides test environment configuration
- `createMockBleDevice(overrides)` - Creates mock BLE device data
- `createMockParsedDevice(overrides)` - Creates mock parsed device objects

#### Test Helper Functions
- `restoreEnvironment(originalEnv)` - Cleans up environment variables
- `clearRequireCache(modules)` - Clears Node.js require cache for fresh imports
- Mock MQTT client creation and connection simulation
- Environment variable backup and restoration utilities

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

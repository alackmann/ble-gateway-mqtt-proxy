/**
 * Unit tests for Home Assistant configuration parsing
 */

const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire').noCallThru();

describe('Home Assistant Configuration Parsing', () => {
    let originalEnv;
    let configModule;
    let mockLogger;
    
    beforeEach(() => {
        // Save original environment variables
        originalEnv = { ...process.env };
        
        // Create a mock logger
        mockLogger = {
            info: sinon.stub(),
            warn: sinon.stub(),
            error: sinon.stub(),
            debug: sinon.stub()
        };
        
        // Clear any environment variables that might affect the tests
        delete process.env.HA_ENABLED;
        delete process.env.HA_DISCOVERY_TOPIC_PREFIX;
        
        // Delete all HA_BLE_DEVICE_X environment variables
        Object.keys(process.env).forEach(key => {
            if (key.startsWith('HA_BLE_DEVICE_')) {
                delete process.env[key];
            }
        });
        
        // Allow each test to set up its own environment variables
    });
    
    afterEach(() => {
        // Restore original environment variables
        process.env = originalEnv;
        sinon.restore();
    });
    
    describe('Default Configuration', () => {
        it('should provide default values when environment variables are not set', () => {
            // Load config module with no HA environment variables set
            configModule = proxyquire('../src/config', {
                './logger': mockLogger,
                'dotenv': { config: () => {} }
            });
            
            expect(configModule.config.homeAssistant).to.exist;
            expect(configModule.config.homeAssistant.enabled).to.be.false;
            expect(configModule.config.homeAssistant.discoveryTopicPrefix).to.equal('homeassistant');
            expect(configModule.config.homeAssistant.devices).to.be.instanceOf(Map);
            expect(configModule.config.homeAssistant.devices.size).to.equal(0);
        });
    });
    
    describe('Environment Variable Override', () => {
        it('should enable Home Assistant integration when HA_ENABLED is true', () => {
            process.env.HA_ENABLED = 'true';
            
            configModule = proxyquire('../src/config', {
                './logger': mockLogger,
                'dotenv': { config: () => {} }
            });
            
            expect(configModule.config.homeAssistant.enabled).to.be.true;
        });
        
        it('should use custom discovery topic prefix when provided', () => {
            process.env.HA_DISCOVERY_TOPIC_PREFIX = 'custom/ha';
            
            configModule = proxyquire('../src/config', {
                './logger': mockLogger,
                'dotenv': { config: () => {} }
            });
            
            expect(configModule.config.homeAssistant.discoveryTopicPrefix).to.equal('custom/ha');
        });
    });
    
    describe('BLE Device Parsing', () => {
        it('should parse valid HA_BLE_DEVICE_X environment variables', () => {
            process.env.HA_ENABLED = 'true';
            process.env.HA_BLE_DEVICE_1 = '123b6a1b85ef,Car Token';
            process.env.HA_BLE_DEVICE_2 = 'aabbccddeeff,Bike Token';
            
            configModule = proxyquire('../src/config', {
                './logger': mockLogger,
                'dotenv': { config: () => {} }
            });
            
            const devices = configModule.config.homeAssistant.devices;
            expect(devices.size).to.equal(2);
            
            expect(devices.has('123b6a1b85ef')).to.be.true;
            expect(devices.get('123b6a1b85ef')).to.deep.equal({ name: 'Car Token' });
            
            expect(devices.has('aabbccddeeff')).to.be.true;
            expect(devices.get('aabbccddeeff')).to.deep.equal({ name: 'Bike Token' });
        });
        
        it('should handle MAC addresses with mixed case', () => {
            process.env.HA_BLE_DEVICE_1 = '123B6A1b85EF,Mixed Case MAC';
            
            configModule = proxyquire('../src/config', {
                './logger': mockLogger,
                'dotenv': { config: () => {} }
            });
            
            const devices = configModule.config.homeAssistant.devices;
            expect(devices.size).to.equal(1);
            expect(devices.has('123b6a1b85ef')).to.be.true; // Should be lowercase in the map
        });
        
        it('should skip malformed HA_BLE_DEVICE_X variables', () => {
            process.env.HA_BLE_DEVICE_1 = '123b6a1b85ef,Car Token'; // Valid
            process.env.HA_BLE_DEVICE_2 = 'invalid-mac,Bad Token'; // Invalid MAC
            process.env.HA_BLE_DEVICE_3 = 'aabbccddeeff'; // Missing name
            process.env.HA_BLE_DEVICE_4 = ''; // Empty
            
            configModule = proxyquire('../src/config', {
                './logger': mockLogger,
                'dotenv': { config: () => {} }
            });
            
            const devices = configModule.config.homeAssistant.devices;
            expect(devices.size).to.equal(1);
            expect(devices.has('123b6a1b85ef')).to.be.true;
            expect(devices.has('aabbccddeeff')).to.be.false;
        });
        
        it('should handle non-sequential HA_BLE_DEVICE_X variables', () => {
            process.env.HA_BLE_DEVICE_1 = '123b6a1b85ef,Car Token';
            process.env.HA_BLE_DEVICE_3 = 'aabbccddeeff,Bike Token'; // Skip 2
            process.env.HA_BLE_DEVICE_5 = '112233445566,Extra Token'; // Skip 4
            
            configModule = proxyquire('../src/config', {
                './logger': mockLogger,
                'dotenv': { config: () => {} }
            });
            
            const devices = configModule.config.homeAssistant.devices;
            expect(devices.size).to.equal(3);
            expect(devices.has('123b6a1b85ef')).to.be.true;
            expect(devices.has('aabbccddeeff')).to.be.true;
            expect(devices.has('112233445566')).to.be.true;
        });
        
        it('should parse non-sequential HA_BLE_DEVICE_X variables', () => {
            process.env.HA_BLE_DEVICE_1 = '123b6a1b85ef,Car Token';
            process.env.HA_BLE_DEVICE_2 = 'aabbccddeeff,Bike Token';
            // Skip HA_BLE_DEVICE_3
            process.env.HA_BLE_DEVICE_4 = '112233445566,Found Token'; // Should be found despite gap
            
            configModule = proxyquire('../src/config', {
                './logger': mockLogger,
                'dotenv': { config: () => {} }
            });
            
            const devices = configModule.config.homeAssistant.devices;
            expect(devices.size).to.equal(3);
            expect(devices.has('123b6a1b85ef')).to.be.true;
            expect(devices.has('aabbccddeeff')).to.be.true;
            expect(devices.has('112233445566')).to.be.true;
        });
        
        it('should handle MAC addresses with existing colons', () => {
            process.env.HA_BLE_DEVICE_1 = '12:3B:6A:1B:85:EF,Car Token'; // With colons
            
            configModule = proxyquire('../src/config', {
                './logger': mockLogger,
                'dotenv': { config: () => {} }
            });
            
            const devices = configModule.config.homeAssistant.devices;
            expect(devices.size).to.equal(1);
            expect(devices.has('123b6a1b85ef')).to.be.true; // Should normalize to no colons
        });
        
        it('should handle devices with whitespace in MAC or name', () => {
            process.env.HA_BLE_DEVICE_1 = ' 123b6a1b85ef , Car Token with Spaces ';
            
            configModule = proxyquire('../src/config', {
                './logger': mockLogger,
                'dotenv': { config: () => {} }
            });
            
            const devices = configModule.config.homeAssistant.devices;
            expect(devices.size).to.equal(1);
            expect(devices.has('123b6a1b85ef')).to.be.true;
            expect(devices.get('123b6a1b85ef').name).to.equal('Car Token with Spaces');
        });
    });
    
    describe('Configuration Validation', () => {
        it('should warn when HA_ENABLED is true but no devices are configured', () => {
            process.env.HA_ENABLED = 'true';
            // No HA_BLE_DEVICE_X variables set
            
            configModule = proxyquire('../src/config', {
                './logger': mockLogger,
                'dotenv': { config: () => {} }
            });
            
            const warnings = configModule.validateConfig();
            expect(warnings.some(w => w.includes('HA_ENABLED is true but no HA_BLE_DEVICE_X'))).to.be.true;
        });
        
        it('should not warn about devices when HA_ENABLED is false', () => {
            process.env.HA_ENABLED = 'false';
            // No HA_BLE_DEVICE_X variables set
            
            configModule = proxyquire('../src/config', {
                './logger': mockLogger,
                'dotenv': { config: () => {} }
            });
            
            const warnings = configModule.validateConfig();
            expect(warnings.some(w => w.includes('HA_ENABLED is true but no HA_BLE_DEVICE_X'))).to.be.false;
        });
    });
    
    describe('Configuration Logging', () => {
        it('should log Home Assistant configuration details when enabled', () => {
            process.env.HA_ENABLED = 'true';
            process.env.HA_BLE_DEVICE_1 = '123b6a1b85ef,Car Token';
            
            configModule = proxyquire('../src/config', {
                './logger': mockLogger,
                'dotenv': { config: () => {} }
            });
            
            // Call the log function
            configModule.logConfigStatus();
            
            // Should log that HA is enabled and show device details
            expect(mockLogger.info.calledWith('Home Assistant Integration:')).to.be.true;
            expect(mockLogger.info.calledWith(`  Configured BLE Devices: 1`)).to.be.true;
        });
        
        it('should log that Home Assistant is disabled when HA_ENABLED is false', () => {
            process.env.HA_ENABLED = 'false';
            
            configModule = proxyquire('../src/config', {
                './logger': mockLogger,
                'dotenv': { config: () => {} }
            });
            
            // Call the log function
            configModule.logConfigStatus();
            
            // Should log that HA is disabled
            expect(mockLogger.info.calledWith('Home Assistant Integration: Disabled')).to.be.true;
        });
    });
});

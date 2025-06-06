/**
 * Configuration Module Tests
 * Tests for the configuration management functionality
 */

const { expect } = require('chai');
const { clearRequireCache } = require('./utils');

describe('Configuration Module', () => {
    let originalEnv;

    beforeEach(() => {
        // Save original environment variables
        originalEnv = { ...process.env };
        
        // Clear specific environment variables for testing
        const testVars = [
            'SERVER_PORT', 'MQTT_BROKER_URL', 'MQTT_USERNAME', 
            'MQTT_PASSWORD', 'MQTT_TOPIC_PREFIX', 'MQTT_QOS', 
            'MQTT_RETAIN', 'LOG_LEVEL'
        ];
        testVars.forEach(varName => delete process.env[varName]);
        
        // Clear require cache to get fresh config
        delete require.cache[require.resolve('../src/config.js')];
    });

    afterEach(() => {
        // Restore original environment variables
        process.env = originalEnv;
        
        // Clear require cache
        delete require.cache[require.resolve('../src/config.js')];
    });

    describe('Default Configuration', () => {
        it('should provide default values when environment variables are not set', () => {
            // Save all environment variables that could affect config
            const envVarsToTest = [
                'SERVER_PORT', 'MQTT_BROKER_URL', 'MQTT_USERNAME', 'MQTT_PASSWORD',
                'MQTT_TOPIC_PREFIX', 'MQTT_QOS', 'MQTT_RETAIN', 'LOG_LEVEL'
            ];
            const originalEnv = {};
            
            // Save and clear all relevant environment variables
            envVarsToTest.forEach(varName => {
                originalEnv[varName] = process.env[varName];
                delete process.env[varName];
            });
            
            // Clear module cache to get fresh config with no env vars
            clearRequireCache(['../src/config.js']);
            const { config } = require('../src/config.js');
            
            // Test that defaults are used when no env vars are set
            expect(config.server.port).to.equal(8000);
            expect(config.mqtt.brokerUrl).to.equal('mqtt://localhost:1883');
            expect(config.mqtt.username).to.equal('');
            expect(config.mqtt.password).to.equal('');
            expect(config.mqtt.topicPrefix).to.equal('/blegateways/aprilbrother/');
            expect(config.mqtt.qos).to.equal(1);
            expect(config.mqtt.retain).to.be.false;
            expect(config.logging.level).to.equal('info');
            
            // Restore original environment variables
            envVarsToTest.forEach(varName => {
                if (originalEnv[varName] !== undefined) {
                    process.env[varName] = originalEnv[varName];
                }
            });
        });
    });

    describe('Environment Variable Override', () => {
        it('should use environment variables when provided', () => {
            // Set environment variables using mock config
            process.env.SERVER_PORT = '9000';
            process.env.MQTT_BROKER_URL = 'mqtt://test.mosquitto.org:1883';
            process.env.MQTT_USERNAME = 'testuser';
            process.env.MQTT_PASSWORD = 'testpass';
            process.env.MQTT_TOPIC_PREFIX = '/test/ble/device/';
            process.env.MQTT_QOS = '1';
            process.env.MQTT_RETAIN = 'false';
            process.env.LOG_LEVEL = 'debug';
            
            // Clear require cache and reload config
            delete require.cache[require.resolve('../src/config.js')];
            const { config } = require('../src/config.js');
            
            expect(config.server.port).to.equal(9000);
            expect(config.mqtt.brokerUrl).to.equal('mqtt://test.mosquitto.org:1883');
            expect(config.mqtt.username).to.equal('testuser');
            expect(config.mqtt.password).to.equal('testpass');
            expect(config.mqtt.topicPrefix).to.equal('/test/ble/device/');
            expect(config.mqtt.qos).to.equal(1);
            expect(config.mqtt.retain).to.be.false;
            expect(config.logging.level).to.equal('debug');
        });
    });

    describe('Configuration Validation', () => {
        it('should provide validation warnings for missing configuration', () => {
            // Save and clear environment variables to test validation warnings
            const envVarsToTest = ['MQTT_BROKER_URL', 'MQTT_TOPIC_PREFIX'];
            const originalEnv = {};
            
            envVarsToTest.forEach(varName => {
                originalEnv[varName] = process.env[varName];
                delete process.env[varName];
            });
            
            // Clear module cache to get fresh config
            clearRequireCache(['../src/config.js']);
            const { validateConfig } = require('../src/config.js');
            const warnings = validateConfig();
            
            expect(warnings).to.be.an('array');
            expect(warnings.length).to.be.greaterThan(0);
            expect(warnings.some(w => w.includes('MQTT_BROKER_URL'))).to.be.true;
            expect(warnings.some(w => w.includes('MQTT_TOPIC_PREFIX'))).to.be.true;
            
            // Restore original environment variables
            envVarsToTest.forEach(varName => {
                if (originalEnv[varName] !== undefined) {
                    process.env[varName] = originalEnv[varName];
                }
            });
        });

        it('should provide fewer warnings when required variables are set', () => {
            process.env.MQTT_BROKER_URL = 'mqtt://test.mosquitto.org:1883';
            process.env.MQTT_TOPIC_PREFIX = '/test/ble/';
            
            // Clear require cache and reload config
            delete require.cache[require.resolve('../src/config.js')];
            const { validateConfig } = require('../src/config.js');
            const warnings = validateConfig();
            
            expect(warnings).to.be.an('array');
            expect(warnings.some(w => w.includes('MQTT_BROKER_URL'))).to.be.false;
            expect(warnings.some(w => w.includes('MQTT_TOPIC_PREFIX'))).to.be.false;
        });
    });
});

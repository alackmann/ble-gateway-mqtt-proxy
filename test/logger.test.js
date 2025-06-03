/**
 * Logging Framework Tests
 * Tests for the logging module functionality
 */

const { expect } = require('chai');
const { restoreEnvironment, clearRequireCache } = require('./utils');

describe('Logging Framework', () => {
    let originalEnv;
    let originalConsole;
    let consoleLogs;

    beforeEach(() => {
        // Save original environment and console
        originalEnv = { ...process.env };
        originalConsole = {
            log: console.log,
            warn: console.warn,
            error: console.error
        };

        // Capture console output
        consoleLogs = {
            log: [],
            warn: [],
            error: []
        };

        console.log = (...args) => consoleLogs.log.push(args.join(' '));
        console.warn = (...args) => consoleLogs.warn.push(args.join(' '));
        console.error = (...args) => consoleLogs.error.push(args.join(' '));

        // Clear require cache
        clearRequireCache(['../src/config.js', '../src/logger.js']);
    });

    afterEach(() => {
        // Restore original environment and console
        restoreEnvironment(originalEnv);
        Object.assign(console, originalConsole);
        
        // Clear require cache
        clearRequireCache(['../src/config.js', '../src/logger.js']);
    });

    describe('Log Level Configuration', () => {
        it('should default to INFO log level', () => {
            const logger = require('../src/logger');
            expect(logger.getCurrentLogLevel()).to.equal(logger.LOG_LEVELS.INFO);
        });

        it('should use configured log level from environment', () => {
            process.env.LOG_LEVEL = 'debug';
            clearRequireCache(['../src/config.js', '../src/logger.js']);
            
            const logger = require('../src/logger');
            expect(logger.getCurrentLogLevel()).to.equal(logger.LOG_LEVELS.DEBUG);
        });

        it('should fall back to INFO for invalid log levels', () => {
            process.env.LOG_LEVEL = 'invalid';
            clearRequireCache(['../src/config.js', '../src/logger.js']);
            
            const logger = require('../src/logger');
            expect(logger.getCurrentLogLevel()).to.equal(logger.LOG_LEVELS.INFO);
        });
    });

    describe('Basic Logging Functions', () => {
        it('should log ERROR messages', () => {
            const logger = require('../src/logger');
            logger.error('Test error message');
            
            expect(consoleLogs.error).to.have.lengthOf(1);
            expect(consoleLogs.error[0]).to.include('ERROR: Test error message');
        });

        it('should log WARN messages', () => {
            const logger = require('../src/logger');
            logger.warn('Test warning message');
            
            expect(consoleLogs.warn).to.have.lengthOf(1);
            expect(consoleLogs.warn[0]).to.include('WARN: Test warning message');
        });

        it('should log INFO messages', () => {
            const logger = require('../src/logger');
            logger.info('Test info message');
            
            expect(consoleLogs.log).to.have.lengthOf(1);
            expect(consoleLogs.log[0]).to.include('INFO: Test info message');
        });

        it('should log DEBUG messages when log level is DEBUG', () => {
            process.env.LOG_LEVEL = 'debug';
            clearRequireCache(['../src/config.js', '../src/logger.js']);
            
            const logger = require('../src/logger');
            logger.debug('Test debug message');
            
            expect(consoleLogs.log).to.have.lengthOf(1);
            expect(consoleLogs.log[0]).to.include('DEBUG: Test debug message');
        });

        it('should not log DEBUG messages when log level is INFO', () => {
            process.env.LOG_LEVEL = 'info';
            clearRequireCache(['../src/config.js', '../src/logger.js']);
            
            const logger = require('../src/logger');
            logger.debug('Test debug message');
            
            expect(consoleLogs.log).to.have.lengthOf(0);
        });
    });

    describe('Log Message Formatting', () => {
        it('should include timestamp in log messages', () => {
            const logger = require('../src/logger');
            logger.info('Test message');
            
            expect(consoleLogs.log[0]).to.match(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
        });

        it('should format object data as JSON', () => {
            const logger = require('../src/logger');
            const testData = { key: 'value', number: 42 };
            logger.info('Test message', testData);
            
            expect(consoleLogs.log[0]).to.include('{"key":"value","number":42}');
        });

        it('should format primitive data as string', () => {
            const logger = require('../src/logger');
            logger.info('Test message', 'additional info');
            
            expect(consoleLogs.log[0]).to.include('additional info');
        });
    });

    describe('Specialized Logging Functions', () => {
        it('should log startup information', () => {
            const logger = require('../src/logger');
            logger.logStartup(8000);
            
            expect(consoleLogs.log.length).to.be.greaterThan(0);
            expect(consoleLogs.log.some(log => log.includes('starting on port 8000'))).to.be.true;
        });

        it('should log HTTP request details', () => {
            const logger = require('../src/logger');
            logger.logRequest('POST', '/tokendata', 'application/msgpack', '192.168.1.100', 1024);
            
            expect(consoleLogs.log).to.have.lengthOf(1);
            expect(consoleLogs.log[0]).to.include('Request: POST /tokendata');
            expect(consoleLogs.log[0]).to.include('application/msgpack');
            expect(consoleLogs.log[0]).to.include('192.168.1.100');
            expect(consoleLogs.log[0]).to.include('1024 bytes');
        });

        it('should log processing success with device count', () => {
            const logger = require('../src/logger');
            const gatewayInfo = {
                version: '1.5.0',
                messageId: 12345,
                ip: '192.168.1.100',
                mac: '12:34:56:78:9A:BC'
            };
            logger.logProcessingSuccess(5, gatewayInfo);
            
            expect(consoleLogs.log).to.have.lengthOf(1);
            expect(consoleLogs.log[0]).to.include('Successfully processed 5 devices');
            expect(consoleLogs.log[0]).to.include('1.5.0');
            expect(consoleLogs.log[0]).to.include('12345');
        });

        it('should log processing errors with context', () => {
            const logger = require('../src/logger');
            const testError = new Error('Test processing error');
            const context = { operation: 'test', data: 'sample' };
            
            logger.logProcessingError('data parsing', testError, context);
            
            expect(consoleLogs.error).to.have.lengthOf(1);
            expect(consoleLogs.error[0]).to.include('Error during data parsing');
            expect(consoleLogs.error[0]).to.include('Test processing error');
            expect(consoleLogs.error[0]).to.include('operation');
        });

        it('should log MQTT connection events', () => {
            const logger = require('../src/logger');
            
            logger.logMqttConnection('connect', { broker: 'localhost:1883' });
            expect(consoleLogs.log.some(log => log.includes('MQTT client connected successfully'))).to.be.true;
            
            logger.logMqttConnection('error', { error: 'Connection refused' });
            expect(consoleLogs.error.some(log => log.includes('MQTT connection error'))).to.be.true;
        });

        it('should log MQTT publishing events', () => {
            process.env.LOG_LEVEL = 'debug';
            clearRequireCache(['../src/config.js', '../src/logger.js']);
            
            const logger = require('../src/logger');
            
            // Test successful publish
            logger.logMqttPublish('/test/topic', true, null, 'msg123');
            expect(consoleLogs.log.some(log => 
                log.includes('Published to MQTT topic: /test/topic') && 
                log.includes('msg123')
            )).to.be.true;
            
            // Test failed publish
            const error = new Error('Publish failed');
            logger.logMqttPublish('/test/topic', false, error, 'msg456');
            expect(consoleLogs.error.some(log => 
                log.includes('Failed to publish to MQTT topic: /test/topic') &&
                log.includes('Publish failed')
            )).to.be.true;
        });
    });

    describe('Log Level Filtering', () => {
        it('should respect ERROR log level filtering', () => {
            process.env.LOG_LEVEL = 'error';
            clearRequireCache(['../src/config.js', '../src/logger.js']);
            
            const logger = require('../src/logger');
            
            logger.error('Error message');
            logger.warn('Warning message');
            logger.info('Info message');
            logger.debug('Debug message');
            
            expect(consoleLogs.error).to.have.lengthOf(1);
            expect(consoleLogs.warn).to.have.lengthOf(0);
            expect(consoleLogs.log).to.have.lengthOf(0);
        });

        it('should respect WARN log level filtering', () => {
            process.env.LOG_LEVEL = 'warn';
            clearRequireCache(['../src/config.js', '../src/logger.js']);
            
            const logger = require('../src/logger');
            
            logger.error('Error message');
            logger.warn('Warning message');
            logger.info('Info message');
            logger.debug('Debug message');
            
            expect(consoleLogs.error).to.have.lengthOf(1);
            expect(consoleLogs.warn).to.have.lengthOf(1);
            expect(consoleLogs.log).to.have.lengthOf(0);
        });

        it('should respect INFO log level filtering', () => {
            process.env.LOG_LEVEL = 'info';
            clearRequireCache(['../src/config.js', '../src/logger.js']);
            
            const logger = require('../src/logger');
            
            logger.error('Error message');
            logger.warn('Warning message');
            logger.info('Info message');
            logger.debug('Debug message');
            
            expect(consoleLogs.error).to.have.lengthOf(1);
            expect(consoleLogs.warn).to.have.lengthOf(1);
            expect(consoleLogs.log).to.have.lengthOf(1);
        });

        it('should respect DEBUG log level filtering', () => {
            process.env.LOG_LEVEL = 'debug';
            clearRequireCache(['../src/config.js', '../src/logger.js']);
            
            const logger = require('../src/logger');
            
            logger.error('Error message');
            logger.warn('Warning message');
            logger.info('Info message');
            logger.debug('Debug message');
            
            expect(consoleLogs.error).to.have.lengthOf(1);
            expect(consoleLogs.warn).to.have.lengthOf(1);
            expect(consoleLogs.log).to.have.lengthOf(2); // INFO + DEBUG
        });
    });
});

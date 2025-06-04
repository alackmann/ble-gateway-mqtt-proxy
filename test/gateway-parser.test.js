/**
 * Tests for Gateway Parser Module
 * Tests parsing of top-level gateway data structure
 */

const { expect } = require('chai');
const sinon = require('sinon');
const gatewayParser = require('../src/gateway-parser');
const logger = require('../src/logger');
const testUtils = require('./utils');

describe('Gateway Parser Module', () => {
    let loggerStub;

    beforeEach(() => {
        // Stub logger methods to avoid console output during tests
        loggerStub = {
            debug: sinon.stub(logger, 'debug'),
            warn: sinon.stub(logger, 'warn'),
            error: sinon.stub(logger, 'error'),
            info: sinon.stub(logger, 'info')
        };
    });

    afterEach(() => {
        // Restore logger methods
        Object.values(loggerStub).forEach(stub => stub.restore());
    });

    describe('parseGatewayData()', () => {
        it('should parse complete gateway data successfully', () => {
            const mockData = testUtils.createMockGatewayData();
            const result = gatewayParser.parseGatewayData(mockData);

            expect(result).to.have.property('gatewayInfo');
            expect(result).to.have.property('devices');
            expect(result).to.have.property('deviceCount');

            expect(result.gatewayInfo).to.deep.include({
                version: mockData.v,
                messageId: mockData.mid,
                time: mockData.time,
                ip: mockData.ip,
                mac: mockData.mac
            });

            expect(result.devices).to.equal(mockData.devices);
            expect(result.deviceCount).to.equal(mockData.devices.length);
        });

        it('should parse gateway data with optional fields', () => {
            const mockData = testUtils.createMockGatewayData({
                includeOptionalFields: true
            });
            
            const result = gatewayParser.parseGatewayData(mockData);

            expect(result.gatewayInfo).to.include({
                rssi: mockData.rssi,
                iccid: mockData.iccid
            });
        });

        it('should handle missing devices array gracefully', () => {
            const mockData = {
                v: '1.4.1',
                mid: 123,
                time: Date.now(),
                ip: '192.168.1.100',
                mac: 'aa:bb:cc:dd:ee:ff'
                // No devices array
            };

            const result = gatewayParser.parseGatewayData(mockData);

            expect(result.devices).to.be.an('array').that.is.empty;
            expect(result.deviceCount).to.equal(0);
            expect(loggerStub.warn.calledWith('No devices array found in gateway data')).to.be.true;
        });

        it('should log warning for missing required fields', () => {
            const mockData = {
                // Missing version and messageId
                time: Date.now(),
                ip: '192.168.1.100',
                mac: 'aa:bb:cc:dd:ee:ff',
                devices: []
            };

            const result = gatewayParser.parseGatewayData(mockData);

            expect(result.gatewayInfo.version).to.be.undefined;
            expect(result.gatewayInfo.messageId).to.be.undefined;
            expect(loggerStub.warn.calledWith('Missing required gateway fields')).to.be.true;
        });

        it('should throw error for null/undefined input', () => {
            expect(() => gatewayParser.parseGatewayData(null)).to.throw('Invalid gateway data: must be an object');
            expect(() => gatewayParser.parseGatewayData(undefined)).to.throw('Invalid gateway data: must be an object');
            expect(() => gatewayParser.parseGatewayData('string')).to.throw('Invalid gateway data: must be an object');
        });

        it('should throw error for invalid devices array', () => {
            const mockData = {
                v: '1.4.1',
                mid: 123,
                devices: 'not-an-array' // Invalid devices
            };

            expect(() => gatewayParser.parseGatewayData(mockData)).to.throw('Invalid devices data: must be an array');
        });

        it('should log debug information during parsing', () => {
            const mockData = testUtils.createMockGatewayData();
            gatewayParser.parseGatewayData(mockData);

            expect(loggerStub.debug.calledWith('Parsing gateway data structure')).to.be.true;
            expect(loggerStub.debug.calledWith(sinon.match(/Found \d+ devices in gateway data/))).to.be.true;
            expect(loggerStub.debug.calledWith('Extracted gateway information')).to.be.true;
        });
    });

    describe('validateGatewayData()', () => {
        it('should validate complete gateway data as valid', () => {
            const gatewayInfo = {
                version: '1.4.1',
                messageId: 123,
                time: Date.now(),
                ip: '192.168.1.100',
                mac: 'aa:bb:cc:dd:ee:ff'
            };

            const result = gatewayParser.validateGatewayData(gatewayInfo);

            expect(result.isValid).to.be.true;
            expect(result.errors).to.be.empty;
            expect(result.warnings).to.be.empty;
        });

        it('should detect missing required fields as errors', () => {
            const gatewayInfo = {
                // Missing version and messageId
                time: Date.now(),
                ip: '192.168.1.100',
                mac: 'aa:bb:cc:dd:ee:ff'
            };

            const result = gatewayParser.validateGatewayData(gatewayInfo);

            expect(result.isValid).to.be.false;
            expect(result.errors).to.include('Missing firmware version (v)');
            expect(result.errors).to.include('Missing message ID (mid)');
        });

        it('should detect missing optional fields as warnings', () => {
            const gatewayInfo = {
                version: '1.4.1',
                messageId: 123
                // Missing ip and mac
            };

            const result = gatewayParser.validateGatewayData(gatewayInfo);

            expect(result.isValid).to.be.true; // Still valid without optional fields
            expect(result.warnings).to.include('Missing gateway IP address');
            expect(result.warnings).to.include('Missing gateway MAC address');
        });

        it('should detect invalid data types as warnings', () => {
            const gatewayInfo = {
                version: 123, // Should be string
                messageId: '456', // Should be number
                time: 'not-a-number', // Should be number
                ip: '192.168.1.100',
                mac: 'aa:bb:cc:dd:ee:ff'
            };

            const result = gatewayParser.validateGatewayData(gatewayInfo);

            expect(result.isValid).to.be.true; // Type warnings don't make it invalid
            expect(result.warnings).to.include('Version should be a string');
            expect(result.warnings).to.include('Message ID should be a number');
            expect(result.warnings).to.include('Time should be a number');
        });

        it('should handle messageId being 0 as valid', () => {
            const gatewayInfo = {
                version: '1.4.1',
                messageId: 0, // Zero is a valid messageId
                ip: '192.168.1.100',
                mac: 'aa:bb:cc:dd:ee:ff'
            };

            const result = gatewayParser.validateGatewayData(gatewayInfo);

            expect(result.isValid).to.be.true;
            expect(result.errors).to.be.empty;
        });

        it('should detect null messageId as error', () => {
            const gatewayInfo = {
                version: '1.4.1',
                messageId: null, // Null is invalid
                ip: '192.168.1.100',
                mac: 'aa:bb:cc:dd:ee:ff'
            };

            const result = gatewayParser.validateGatewayData(gatewayInfo);

            expect(result.isValid).to.be.false;
            expect(result.errors).to.include('Missing message ID (mid)');
        });
    });

    describe('formatGatewayInfo()', () => {
        it('should format complete gateway information', () => {
            const gatewayInfo = {
                version: '1.4.1',
                messageId: 123,
                time: 1640995200000,
                ip: '192.168.1.100',
                mac: 'aa:bb:cc:dd:ee:ff',
                rssi: -45,
                iccid: '1234567890123456789'
            };

            const result = gatewayParser.formatGatewayInfo(gatewayInfo);

            expect(result).to.deep.equal(gatewayInfo);
        });

        it('should exclude null and undefined values', () => {
            const gatewayInfo = {
                version: '1.4.1',
                messageId: 123,
                time: null,
                ip: undefined,
                mac: 'aa:bb:cc:dd:ee:ff',
                rssi: 0, // Zero should be included
                iccid: ''
            };

            const result = gatewayParser.formatGatewayInfo(gatewayInfo);

            expect(result).to.deep.equal({
                version: '1.4.1',
                messageId: 123,
                mac: 'aa:bb:cc:dd:ee:ff',
                rssi: 0,
                iccid: ''
            });
        });

        it('should handle messageId being 0', () => {
            const gatewayInfo = {
                version: '1.4.1',
                messageId: 0, // Zero should be included
                mac: 'aa:bb:cc:dd:ee:ff'
            };

            const result = gatewayParser.formatGatewayInfo(gatewayInfo);

            expect(result).to.include({ messageId: 0 });
        });

        it('should handle empty gateway info', () => {
            const gatewayInfo = {};
            const result = gatewayParser.formatGatewayInfo(gatewayInfo);

            expect(result).to.deep.equal({});
        });
    });

    describe('getGatewayMetadata()', () => {
        it('should extract essential metadata for device messages', () => {
            const gatewayInfo = {
                version: '1.4.1',
                messageId: 123,
                time: 1640995200000,
                ip: '192.168.1.100',
                mac: 'aa:bb:cc:dd:ee:ff',
                rssi: -45,
                iccid: '1234567890123456789'
            };

            const result = gatewayParser.getGatewayMetadata(gatewayInfo);

            expect(result).to.deep.equal({
                gateway_mac: 'aa:bb:cc:dd:ee:ff',
                gateway_ip: '192.168.1.100'
            });
        });

        it('should handle missing MAC address', () => {
            const gatewayInfo = {
                version: '1.4.1',
                messageId: 123,
                ip: '192.168.1.100'
                // No MAC address
            };

            const result = gatewayParser.getGatewayMetadata(gatewayInfo);

            expect(result).to.deep.equal({
                gateway_ip: '192.168.1.100'
            });
        });

        it('should handle missing IP address', () => {
            const gatewayInfo = {
                version: '1.4.1',
                messageId: 123,
                mac: 'aa:bb:cc:dd:ee:ff'
                // No IP address
            };

            const result = gatewayParser.getGatewayMetadata(gatewayInfo);

            expect(result).to.deep.equal({
                gateway_mac: 'aa:bb:cc:dd:ee:ff'
            });
        });

        it('should return empty object if no metadata available', () => {
            const gatewayInfo = {
                version: '1.4.1',
                messageId: 123
                // No MAC or IP
            };

            const result = gatewayParser.getGatewayMetadata(gatewayInfo);

            expect(result).to.deep.equal({});
        });
    });

    describe('Integration Tests', () => {
        it('should parse and validate realistic gateway data', () => {
            const mockData = testUtils.createMockGatewayData({
                deviceCount: 3,
                includeOptionalFields: true
            });

            const parsed = gatewayParser.parseGatewayData(mockData);
            const validation = gatewayParser.validateGatewayData(parsed.gatewayInfo);
            const formatted = gatewayParser.formatGatewayInfo(parsed.gatewayInfo);
            const metadata = gatewayParser.getGatewayMetadata(parsed.gatewayInfo);

            expect(validation.isValid).to.be.true;
            expect(validation.warnings).to.be.empty;
            expect(parsed.deviceCount).to.equal(3);
            expect(formatted).to.include({
                version: mockData.v,
                messageId: mockData.mid
            });
            expect(metadata).to.include({
                gateway_mac: mockData.mac,
                gateway_ip: mockData.ip
            });
        });

        it('should handle minimal valid gateway data', () => {
            const mockData = {
                v: '1.4.1',
                mid: 0, // Zero is valid
                devices: []
            };

            const parsed = gatewayParser.parseGatewayData(mockData);
            const validation = gatewayParser.validateGatewayData(parsed.gatewayInfo);
            const formatted = gatewayParser.formatGatewayInfo(parsed.gatewayInfo);

            expect(validation.isValid).to.be.true;
            expect(validation.warnings.length).to.be.greaterThan(0); // Should have warnings for missing optional fields
            expect(parsed.deviceCount).to.equal(0);
            expect(formatted).to.include({
                version: '1.4.1',
                messageId: 0
            });
        });
    });
});

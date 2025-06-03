/**
 * Test suite for JSON Transformer module
 * Tests transformation of parsed BLE device data to JSON payload format
 */

const { expect } = require('chai');
const sinon = require('sinon');

const jsonTransformer = require('../src/json-transformer');

describe('JSON Transformer', () => {
    let clock;

    beforeEach(() => {
        // Mock the current time for consistent testing
        clock = sinon.useFakeTimers(new Date('2023-10-27T12:34:56.789Z'));
    });

    afterEach(() => {
        clock.restore();
    });

    describe('transformDeviceToJson', () => {
        const mockParsedDevice = {
            advertising_type_code: 0,
            advertising_type_description: 'Connectable undirected advertisement',
            mac_address: '12:3B:6A:1A:64:CF',
            rssi: -86,
            advertisement_data_hex: '0201061AFF4C000215B5B182C7EAB14988AA99B5C1517008D90001CF64C5'
        };

        it('should transform a valid parsed device to JSON payload with required fields only', () => {
            const result = jsonTransformer.transformDeviceToJson(mockParsedDevice);

            expect(result).to.be.an('object');
            expect(result).to.have.property('mac_address', '12:3B:6A:1A:64:CF');
            expect(result).to.have.property('rssi', -86);
            expect(result).to.have.property('advertising_type_code', 0);
            expect(result).to.have.property('advertising_type_description', 'Connectable undirected advertisement');
            expect(result).to.have.property('advertisement_data_hex', '0201061AFF4C000215B5B182C7EAB14988AA99B5C1517008D90001CF64C5');
            expect(result).to.have.property('last_seen_timestamp', '2023-10-27T12:34:56.789Z');
            
            // Should not have optional fields
            expect(result).to.not.have.property('gateway_mac');
            expect(result).to.not.have.property('gateway_ip');
        });

        it('should include gateway MAC when provided in options', () => {
            const options = { gatewayMac: 'AA:BB:CC:DD:EE:FF' };
            const result = jsonTransformer.transformDeviceToJson(mockParsedDevice, options);

            expect(result).to.have.property('gateway_mac', 'AA:BB:CC:DD:EE:FF');
            expect(result).to.not.have.property('gateway_ip');
        });

        it('should include gateway IP when provided in options', () => {
            const options = { gatewayIp: '192.168.1.100' };
            const result = jsonTransformer.transformDeviceToJson(mockParsedDevice, options);

            expect(result).to.have.property('gateway_ip', '192.168.1.100');
            expect(result).to.not.have.property('gateway_mac');
        });

        it('should include both gateway MAC and IP when provided in options', () => {
            const options = { 
                gatewayMac: 'AA:BB:CC:DD:EE:FF',
                gatewayIp: '192.168.1.100'
            };
            const result = jsonTransformer.transformDeviceToJson(mockParsedDevice, options);

            expect(result).to.have.property('gateway_mac', 'AA:BB:CC:DD:EE:FF');
            expect(result).to.have.property('gateway_ip', '192.168.1.100');
        });

        it('should use custom timestamp when provided as Date object', () => {
            const customDate = new Date('2023-01-15T08:30:45.123Z');
            const options = { timestamp: customDate };
            const result = jsonTransformer.transformDeviceToJson(mockParsedDevice, options);

            expect(result).to.have.property('last_seen_timestamp', '2023-01-15T08:30:45.123Z');
        });

        it('should use custom timestamp when provided as string', () => {
            const options = { timestamp: '2023-01-15T08:30:45.123Z' };
            const result = jsonTransformer.transformDeviceToJson(mockParsedDevice, options);

            expect(result).to.have.property('last_seen_timestamp', '2023-01-15T08:30:45.123Z');
        });

        it('should ignore invalid gateway MAC (non-string)', () => {
            const options = { gatewayMac: 123 };
            const result = jsonTransformer.transformDeviceToJson(mockParsedDevice, options);

            expect(result).to.not.have.property('gateway_mac');
        });

        it('should ignore invalid gateway IP (non-string)', () => {
            const options = { gatewayIp: 123 };
            const result = jsonTransformer.transformDeviceToJson(mockParsedDevice, options);

            expect(result).to.not.have.property('gateway_ip');
        });

        it('should throw error for null parsed device', () => {
            expect(() => {
                jsonTransformer.transformDeviceToJson(null);
            }).to.throw('Parsed device data must be an object');
        });

        it('should throw error for undefined parsed device', () => {
            expect(() => {
                jsonTransformer.transformDeviceToJson(undefined);
            }).to.throw('Parsed device data must be an object');
        });

        it('should throw error for non-object parsed device', () => {
            expect(() => {
                jsonTransformer.transformDeviceToJson('invalid');
            }).to.throw('Parsed device data must be an object');
        });

        it('should throw error for missing mac_address', () => {
            const invalidDevice = { ...mockParsedDevice };
            delete invalidDevice.mac_address;

            expect(() => {
                jsonTransformer.transformDeviceToJson(invalidDevice);
            }).to.throw('Missing required field: mac_address');
        });

        it('should throw error for missing rssi', () => {
            const invalidDevice = { ...mockParsedDevice };
            delete invalidDevice.rssi;

            expect(() => {
                jsonTransformer.transformDeviceToJson(invalidDevice);
            }).to.throw('Missing required field: rssi');
        });

        it('should throw error for missing advertising_type_code', () => {
            const invalidDevice = { ...mockParsedDevice };
            delete invalidDevice.advertising_type_code;

            expect(() => {
                jsonTransformer.transformDeviceToJson(invalidDevice);
            }).to.throw('Missing required field: advertising_type_code');
        });

        it('should throw error for missing advertising_type_description', () => {
            const invalidDevice = { ...mockParsedDevice };
            delete invalidDevice.advertising_type_description;

            expect(() => {
                jsonTransformer.transformDeviceToJson(invalidDevice);
            }).to.throw('Missing required field: advertising_type_description');
        });

        it('should throw error for missing advertisement_data_hex', () => {
            const invalidDevice = { ...mockParsedDevice };
            delete invalidDevice.advertisement_data_hex;

            expect(() => {
                jsonTransformer.transformDeviceToJson(invalidDevice);
            }).to.throw('Missing required field: advertisement_data_hex');
        });

        it('should handle device with zero RSSI', () => {
            const deviceWithZeroRssi = { ...mockParsedDevice, rssi: 0 };
            const result = jsonTransformer.transformDeviceToJson(deviceWithZeroRssi);

            expect(result).to.have.property('rssi', 0);
        });

        it('should handle device with empty advertisement data', () => {
            const deviceWithEmptyData = { ...mockParsedDevice, advertisement_data_hex: '' };
            const result = jsonTransformer.transformDeviceToJson(deviceWithEmptyData);

            expect(result).to.have.property('advertisement_data_hex', '');
        });
    });

    describe('transformDevicesToJson', () => {
        const mockDevices = [
            {
                advertising_type_code: 0,
                advertising_type_description: 'Connectable undirected advertisement',
                mac_address: '12:3B:6A:1A:64:CF',
                rssi: -86,
                advertisement_data_hex: '0201061AFF4C000215B5B182C7EAB14988AA99B5C1517008D90001CF64C5'
            },
            {
                advertising_type_code: 3,
                advertising_type_description: 'Non-Connectable undirected advertisement',
                mac_address: 'AA:BB:CC:DD:EE:FF',
                rssi: -72,
                advertisement_data_hex: '020106'
            }
        ];

        it('should transform multiple valid devices successfully', () => {
            const result = jsonTransformer.transformDevicesToJson(mockDevices);

            expect(result).to.be.an('object');
            expect(result).to.have.property('payloads').that.is.an('array').with.length(2);
            expect(result).to.have.property('errors').that.is.an('array').with.length(0);
            expect(result).to.have.property('totalCount', 2);
            expect(result).to.have.property('successCount', 2);
            expect(result).to.have.property('errorCount', 0);

            // Check first payload
            expect(result.payloads[0]).to.have.property('mac_address', '12:3B:6A:1A:64:CF');
            expect(result.payloads[0]).to.have.property('rssi', -86);
            expect(result.payloads[0]).to.have.property('advertising_type_code', 0);

            // Check second payload
            expect(result.payloads[1]).to.have.property('mac_address', 'AA:BB:CC:DD:EE:FF');
            expect(result.payloads[1]).to.have.property('rssi', -72);
            expect(result.payloads[1]).to.have.property('advertising_type_code', 3);
        });

        it('should include gateway information in all payloads when provided', () => {
            const options = { 
                gatewayMac: 'AA:BB:CC:DD:EE:FF',
                gatewayIp: '192.168.1.100'
            };
            const result = jsonTransformer.transformDevicesToJson(mockDevices, options);

            expect(result.successCount).to.equal(2);
            result.payloads.forEach(payload => {
                expect(payload).to.have.property('gateway_mac', 'AA:BB:CC:DD:EE:FF');
                expect(payload).to.have.property('gateway_ip', '192.168.1.100');
            });
        });

        it('should handle mix of valid and invalid devices', () => {
            const mixedDevices = [
                mockDevices[0], // Valid
                { invalid: 'device' }, // Invalid - missing required fields
                mockDevices[1] // Valid
            ];

            const result = jsonTransformer.transformDevicesToJson(mixedDevices);

            expect(result.totalCount).to.equal(3);
            expect(result.successCount).to.equal(2);
            expect(result.errorCount).to.equal(1);
            expect(result.payloads).to.have.length(2);
            expect(result.errors).to.have.length(1);
            expect(result.errors[0]).to.have.property('deviceIndex', 1);
            expect(result.errors[0]).to.have.property('deviceMac', 'unknown');
        });

        it('should handle empty array', () => {
            const result = jsonTransformer.transformDevicesToJson([]);

            expect(result.totalCount).to.equal(0);
            expect(result.successCount).to.equal(0);
            expect(result.errorCount).to.equal(0);
            expect(result.payloads).to.have.length(0);
            expect(result.errors).to.have.length(0);
        });

        it('should throw error for null input', () => {
            expect(() => {
                jsonTransformer.transformDevicesToJson(null);
            }).to.throw('Invalid parsed devices data: must be an array');
        });

        it('should throw error for non-array input', () => {
            expect(() => {
                jsonTransformer.transformDevicesToJson('invalid');
            }).to.throw('Invalid parsed devices data: must be an array');
        });
    });

    describe('validateJsonPayload', () => {
        const validPayload = {
            mac_address: '12:3B:6A:1A:64:CF',
            rssi: -86,
            advertising_type_code: 0,
            advertising_type_description: 'Connectable undirected advertisement',
            advertisement_data_hex: '0201061AFF4C000215B5B182C7EAB14988AA99B5C1517008D90001CF64C5',
            last_seen_timestamp: '2023-10-27T12:34:56.789Z',
            gateway_mac: 'AA:BB:CC:DD:EE:FF',
            gateway_ip: '192.168.1.100'
        };

        it('should validate a complete valid payload', () => {
            const result = jsonTransformer.validateJsonPayload(validPayload);

            expect(result.isValid).to.be.true;
            expect(result.errors).to.have.length(0);
            expect(result.warnings).to.have.length(0);
        });

        it('should validate payload without optional fields', () => {
            const minimalPayload = { ...validPayload };
            delete minimalPayload.gateway_mac;
            delete minimalPayload.gateway_ip;

            const result = jsonTransformer.validateJsonPayload(minimalPayload);

            expect(result.isValid).to.be.true;
            expect(result.errors).to.have.length(0);
        });

        it('should reject null payload', () => {
            const result = jsonTransformer.validateJsonPayload(null);

            expect(result.isValid).to.be.false;
            expect(result.errors).to.include('JSON payload must be an object');
        });

        it('should reject non-object payload', () => {
            const result = jsonTransformer.validateJsonPayload('invalid');

            expect(result.isValid).to.be.false;
            expect(result.errors).to.include('JSON payload must be an object');
        });

        it('should reject payload missing required field', () => {
            const invalidPayload = { ...validPayload };
            delete invalidPayload.mac_address;

            const result = jsonTransformer.validateJsonPayload(invalidPayload);

            expect(result.isValid).to.be.false;
            expect(result.errors).to.include('Missing required field: mac_address');
        });

        it('should reject payload with wrong field type', () => {
            const invalidPayload = { ...validPayload, rssi: 'invalid' };

            const result = jsonTransformer.validateJsonPayload(invalidPayload);

            expect(result.isValid).to.be.false;
            expect(result.errors).to.include('Field rssi must be of type number, got string');
        });

        it('should reject invalid MAC address format', () => {
            const invalidPayload = { ...validPayload, mac_address: 'invalid-mac' };

            const result = jsonTransformer.validateJsonPayload(invalidPayload);

            expect(result.isValid).to.be.false;
            expect(result.errors).to.include('MAC address must be in format XX:XX:XX:XX:XX:XX with uppercase hex digits');
        });

        it('should reject lowercase MAC address', () => {
            const invalidPayload = { ...validPayload, mac_address: '12:3b:6a:1a:64:cf' };

            const result = jsonTransformer.validateJsonPayload(invalidPayload);

            expect(result.isValid).to.be.false;
            expect(result.errors).to.include('MAC address must be in format XX:XX:XX:XX:XX:XX with uppercase hex digits');
        });

        it('should warn about unusual RSSI values', () => {
            const payloadWithHighRssi = { ...validPayload, rssi: 10 };

            const result = jsonTransformer.validateJsonPayload(payloadWithHighRssi);

            expect(result.isValid).to.be.true;
            expect(result.warnings).to.include('RSSI value 10 is outside typical range (-120 to 0)');
        });

        it('should warn about very low RSSI values', () => {
            const payloadWithLowRssi = { ...validPayload, rssi: -150 };

            const result = jsonTransformer.validateJsonPayload(payloadWithLowRssi);

            expect(result.isValid).to.be.true;
            expect(result.warnings).to.include('RSSI value -150 is outside typical range (-120 to 0)');
        });

        it('should warn about unknown advertising type code', () => {
            const payloadWithUnknownType = { ...validPayload, advertising_type_code: 10 };

            const result = jsonTransformer.validateJsonPayload(payloadWithUnknownType);

            expect(result.isValid).to.be.true;
            expect(result.warnings).to.include('Advertising type code 10 is outside defined range (0-4)');
        });

        it('should reject invalid hex data', () => {
            const invalidPayload = { ...validPayload, advertisement_data_hex: 'XYZ123' };

            const result = jsonTransformer.validateJsonPayload(invalidPayload);

            expect(result.isValid).to.be.false;
            expect(result.errors).to.include('Advertisement data hex must contain only uppercase hex digits (0-9, A-F)');
        });

        it('should reject lowercase hex data', () => {
            const invalidPayload = { ...validPayload, advertisement_data_hex: '0201061aff4c00' };

            const result = jsonTransformer.validateJsonPayload(invalidPayload);

            expect(result.isValid).to.be.false;
            expect(result.errors).to.include('Advertisement data hex must contain only uppercase hex digits (0-9, A-F)');
        });

        it('should reject invalid timestamp format', () => {
            const invalidPayload = { ...validPayload, last_seen_timestamp: 'invalid-timestamp' };

            const result = jsonTransformer.validateJsonPayload(invalidPayload);

            expect(result.isValid).to.be.false;
            expect(result.errors).to.include('Invalid ISO 8601 timestamp format');
        });

        it('should warn about non-standard timestamp format', () => {
            const payloadWithNonStandardTimestamp = { ...validPayload, last_seen_timestamp: '2023-10-27T12:34:56Z' };

            const result = jsonTransformer.validateJsonPayload(payloadWithNonStandardTimestamp);

            expect(result.isValid).to.be.true;
            expect(result.warnings).to.include('Timestamp is not in standard ISO 8601 format');
        });

        it('should reject invalid gateway MAC type', () => {
            const invalidPayload = { ...validPayload, gateway_mac: 123 };

            const result = jsonTransformer.validateJsonPayload(invalidPayload);

            expect(result.isValid).to.be.false;
            expect(result.errors).to.include('Gateway MAC must be a string');
        });

        it('should reject invalid gateway MAC format', () => {
            const invalidPayload = { ...validPayload, gateway_mac: 'invalid-mac' };

            const result = jsonTransformer.validateJsonPayload(invalidPayload);

            expect(result.isValid).to.be.false;
            expect(result.errors).to.include('Gateway MAC address must be in format XX:XX:XX:XX:XX:XX with uppercase hex digits');
        });

        it('should reject invalid gateway IP type', () => {
            const invalidPayload = { ...validPayload, gateway_ip: 123 };

            const result = jsonTransformer.validateJsonPayload(invalidPayload);

            expect(result.isValid).to.be.false;
            expect(result.errors).to.include('Gateway IP must be a string');
        });
    });

    describe('getJsonStatistics', () => {
        const mockPayloads = [
            {
                mac_address: '12:3B:6A:1A:64:CF',
                rssi: -86,
                advertising_type_code: 0,
                advertising_type_description: 'Connectable undirected advertisement',
                advertisement_data_hex: '0201061AFF4C000215B5B182C7EAB14988AA99B5C1517008D90001CF64C5',
                last_seen_timestamp: '2023-10-27T12:34:56.789Z',
                gateway_mac: 'AA:BB:CC:DD:EE:FF'
            },
            {
                mac_address: 'AA:BB:CC:DD:EE:FF',
                rssi: -72,
                advertising_type_code: 3,
                advertising_type_description: 'Non-Connectable undirected advertisement',
                advertisement_data_hex: '020106',
                last_seen_timestamp: '2023-10-27T12:35:00.000Z',
                gateway_ip: '192.168.1.100'
            },
            {
                mac_address: 'FF:EE:DD:CC:BB:AA',
                rssi: -90,
                advertising_type_code: 0,
                advertising_type_description: 'Connectable undirected advertisement',
                advertisement_data_hex: 'AABBCC',
                last_seen_timestamp: '2023-10-27T12:33:30.123Z',
                gateway_mac: 'AA:BB:CC:DD:EE:FF',
                gateway_ip: '192.168.1.100'
            }
        ];

        it('should calculate statistics for valid payloads', () => {
            const stats = jsonTransformer.getJsonStatistics(mockPayloads);

            expect(stats.totalCount).to.equal(3);
            expect(stats.rssiRange.min).to.equal(-90);
            expect(stats.rssiRange.max).to.equal(-72);
            expect(stats.rssiRange.average).to.equal(-82.67);
            
            expect(stats.advertisingTypes).to.deep.equal({
                '0: Connectable undirected advertisement': 2,
                '3: Non-Connectable undirected advertisement': 1
            });

            expect(stats.timestampRange.earliest).to.equal('2023-10-27T12:33:30.123Z');
            expect(stats.timestampRange.latest).to.equal('2023-10-27T12:35:00.000Z');

            expect(stats.gatewayInfo.withMac).to.equal(2);
            expect(stats.gatewayInfo.withIp).to.equal(2);
            expect(stats.gatewayInfo.withBoth).to.equal(1);
        });

        it('should handle empty array', () => {
            const stats = jsonTransformer.getJsonStatistics([]);

            expect(stats.totalCount).to.equal(0);
            expect(stats.rssiRange.min).to.be.null;
            expect(stats.rssiRange.max).to.be.null;
            expect(stats.rssiRange.average).to.be.null;
            expect(stats.advertisingTypes).to.deep.equal({});
            expect(stats.timestampRange.earliest).to.be.null;
            expect(stats.timestampRange.latest).to.be.null;
            expect(stats.gatewayInfo.withMac).to.equal(0);
            expect(stats.gatewayInfo.withIp).to.equal(0);
            expect(stats.gatewayInfo.withBoth).to.equal(0);
        });

        it('should handle null input', () => {
            const stats = jsonTransformer.getJsonStatistics(null);

            expect(stats.totalCount).to.equal(0);
            expect(stats.rssiRange.min).to.be.null;
        });

        it('should handle non-array input', () => {
            const stats = jsonTransformer.getJsonStatistics('invalid');

            expect(stats.totalCount).to.equal(0);
        });

        it('should handle payloads with missing fields gracefully', () => {
            const incompletePayloads = [
                { mac_address: '12:3B:6A:1A:64:CF' }, // Missing RSSI, type, timestamp
                { rssi: -80 }, // Missing other fields
                {} // Empty payload
            ];

            const stats = jsonTransformer.getJsonStatistics(incompletePayloads);

            expect(stats.totalCount).to.equal(3);
            expect(stats.rssiRange.min).to.equal(-80);
            expect(stats.rssiRange.max).to.equal(-80);
            expect(stats.rssiRange.average).to.equal(-80);
        });
    });
});

/**
 * Unit tests for utility functions
 */

const { expect } = require('chai');
const { formatMac, normalizeMac, addNormalizedMac, slugify } = require('../src/utils');

describe('Utility Functions', () => {
    describe('formatMac()', () => {
        it('should format a MAC address without colons to a colon-separated uppercase format', () => {
            expect(formatMac('123b6a1b85ef')).to.equal('12:3B:6A:1B:85:EF');
            expect(formatMac('aabbccddeeff')).to.equal('AA:BB:CC:DD:EE:FF');
            expect(formatMac('112233445566')).to.equal('11:22:33:44:55:66');
        });

        it('should handle MAC addresses with mixed case', () => {
            expect(formatMac('123B6a1B85Ef')).to.equal('12:3B:6A:1B:85:EF');
        });

        it('should normalize MAC addresses by removing existing colons', () => {
            expect(formatMac('12:3b:6a:1b:85:ef')).to.equal('12:3B:6A:1B:85:EF');
        });

        it('should throw an error for invalid MAC addresses', () => {
            // Empty string
            expect(() => formatMac('')).to.throw('MAC address must be a non-empty string');
            
            // Null or undefined
            expect(() => formatMac(null)).to.throw('MAC address must be a non-empty string');
            expect(() => formatMac(undefined)).to.throw('MAC address must be a non-empty string');
            
            // Invalid length
            expect(() => formatMac('123')).to.throw('Invalid MAC address format');
            expect(() => formatMac('123456789012345')).to.throw('Invalid MAC address format');
            
            // Invalid characters
            expect(() => formatMac('123G6A1B85EF')).to.throw('Invalid MAC address format');
            expect(() => formatMac('Hello, World!')).to.throw('Invalid MAC address format');
        });
    });

    describe('normalizeMac()', () => {
        it('should normalize a MAC address with colons to lowercase without colons', () => {
            expect(normalizeMac('12:3B:6A:1B:85:EF')).to.equal('123b6a1b85ef');
            expect(normalizeMac('AA:BB:CC:DD:EE:FF')).to.equal('aabbccddeeff');
            expect(normalizeMac('11:22:33:44:55:66')).to.equal('112233445566');
        });

        it('should normalize a MAC address without colons to lowercase', () => {
            expect(normalizeMac('123B6A1B85EF')).to.equal('123b6a1b85ef');
            expect(normalizeMac('AABBCCDDEEFF')).to.equal('aabbccddeeff');
        });

        it('should handle already normalized MAC addresses', () => {
            expect(normalizeMac('123b6a1b85ef')).to.equal('123b6a1b85ef');
            expect(normalizeMac('aabbccddeeff')).to.equal('aabbccddeeff');
        });

        it('should handle mixed case MAC addresses with colons', () => {
            expect(normalizeMac('12:3b:6A:1B:85:Ef')).to.equal('123b6a1b85ef');
        });

        it('should trim whitespace from MAC addresses', () => {
            expect(normalizeMac('  12:3B:6A:1B:85:EF  ')).to.equal('123b6a1b85ef');
            expect(normalizeMac('  123B6A1B85EF  ')).to.equal('123b6a1b85ef');
        });

        it('should throw an error for invalid MAC addresses', () => {
            // Empty string
            expect(() => normalizeMac('')).to.throw('MAC address must be a non-empty string');
            
            // Null or undefined
            expect(() => normalizeMac(null)).to.throw('MAC address must be a non-empty string');
            expect(() => normalizeMac(undefined)).to.throw('MAC address must be a non-empty string');
            
            // Invalid length
            expect(() => normalizeMac('123')).to.throw('Invalid MAC address format');
            expect(() => normalizeMac('123456789012345')).to.throw('Invalid MAC address format');
            
            // Invalid characters
            expect(() => normalizeMac('123G6A1B85EF')).to.throw('Invalid MAC address format');
            expect(() => normalizeMac('12:3G:6A:1B:85:EF')).to.throw('Invalid MAC address format');
        });
    });

    describe('addNormalizedMac()', () => {
        it('should add normalized_mac field to device payload', () => {
            const devicePayload = {
                mac_address: '12:3B:6A:1B:85:EF',
                rssi: -50,
                timestamp: '2023-01-01T10:00:00Z'
            };
            
            const result = addNormalizedMac(devicePayload);
            
            expect(result).to.deep.equal({
                mac_address: '12:3B:6A:1B:85:EF',
                rssi: -50,
                timestamp: '2023-01-01T10:00:00Z',
                normalized_mac: '123b6a1b85ef'
            });
        });

        it('should preserve all existing fields in device payload', () => {
            const devicePayload = {
                mac_address: 'AA:BB:CC:DD:EE:FF',
                rssi: -70,
                advertising_type_code: 0,
                advertising_type_description: 'Connectable undirected advertisement',
                advertisement_data_hex: '1234567890ABCDEF',
                last_seen_timestamp: '2023-01-01T10:00:00Z',
                gateway_mac: 'gateway123',
                gateway_ip: '192.168.1.1'
            };
            
            const result = addNormalizedMac(devicePayload);
            
            expect(result).to.have.property('normalized_mac', 'aabbccddeeff');
            expect(result.mac_address).to.equal('AA:BB:CC:DD:EE:FF');
            expect(result.rssi).to.equal(-70);
            expect(result.advertising_type_code).to.equal(0);
        });

        it('should throw an error for missing mac_address field', () => {
            const devicePayload = {
                rssi: -50,
                timestamp: '2023-01-01T10:00:00Z'
            };
            
            expect(() => addNormalizedMac(devicePayload)).to.throw('Device payload must contain mac_address field');
        });

        it('should throw an error for null or undefined payload', () => {
            expect(() => addNormalizedMac(null)).to.throw('Device payload must contain mac_address field');
            expect(() => addNormalizedMac(undefined)).to.throw('Device payload must contain mac_address field');
            expect(() => addNormalizedMac({})).to.throw('Device payload must contain mac_address field');
        });
    });

    describe('slugify()', () => {
        it('should convert a string to a URL-friendly slug', () => {
            expect(slugify('Car Token')).to.equal('car_token');
            expect(slugify('Andre Bike Token')).to.equal('andre_bike_token');
            expect(slugify('Living Room Sensor')).to.equal('living_room_sensor');
        });

        it('should handle strings with special characters', () => {
            expect(slugify('Car Token #1')).to.equal('car_token_1');
            expect(slugify('Living Room & Kitchen')).to.equal('living_room_kitchen');
            expect(slugify('Personal/Work Phone')).to.equal('personalwork_phone');
        });

        it('should handle strings with dots and multiple spaces', () => {
            expect(slugify('Car   Token')).to.equal('car_token');
            expect(slugify('Home.Office.Sensor')).to.equal('home_office_sensor');
        });

        it('should handle edge cases', () => {
            expect(slugify('')).to.equal('');
            expect(slugify(null)).to.equal('');
            expect(slugify(undefined)).to.equal('');
            expect(slugify('   ')).to.equal('');
            expect(slugify('____')).to.equal('');
        });
    });
});

/**
 * Unit tests for utility functions
 */

const { expect } = require('chai');
const path = require('path');
const fs = require('fs');

// Direct file content evaluation for troubleshooting
const utilsFilePath = path.join(__dirname, '../src/utils.js');
const utilsFileContent = fs.readFileSync(utilsFilePath, 'utf8');
console.log(`Utils file exists: ${fs.existsSync(utilsFilePath)}`);
console.log(`Utils file size: ${utilsFileContent.length} bytes`);

// Manual evaluation 
const utilsModule = eval(`(function(module, exports, require) { ${utilsFileContent} \nreturn module.exports; })({exports: {}}, {}, require)`);
const { formatMac, slugify } = utilsModule;

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

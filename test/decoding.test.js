/**
 * Request Body Decoding Tests
 * Tests for MessagePack and JSON decoding functionality
 */

const { expect } = require('chai');
const request = require('supertest');
const express = require('express');
const msgpack = require('msgpack5')();

// Create a test app instance that mimics the main application
function createTestApp() {
    const app = express();
    
    // Apply the same middleware as the main app
    app.use('/tokendata', express.raw({ 
        type: ['application/msgpack', 'application/json'],
        limit: '10mb'
    }));

    // Implement the same decoding logic as the main app
    app.post('/tokendata', (req, res) => {
        try {
            const contentType = req.get('Content-Type');
            
            // Validate Content-Type
            if (!contentType || (!contentType.includes('application/msgpack') && !contentType.includes('application/json'))) {
                return res.status(400).json({ 
                    error: 'Content-Type must be application/msgpack or application/json' 
                });
            }
            
            // Validate request body exists
            if (!req.body || req.body.length === 0) {
                return res.status(400).json({ 
                    error: 'Request body is required' 
                });
            }
            
            // Request body decoding logic
            let decodedData;
            
            try {
                if (contentType.includes('application/msgpack')) {
                    decodedData = msgpack.decode(req.body);
                } else if (contentType.includes('application/json')) {
                    decodedData = JSON.parse(req.body.toString());
                }
                
                // Store decoded data in response for testing purposes
                res.locals.decodedData = decodedData;
                
            } catch (decodeError) {
                return res.status(400).json({
                    error: 'Invalid request body format',
                    details: decodeError.message
                });
            }
            
            // Return 204 No Content with decoded data available for inspection
            res.status(204).send();
            
        } catch (error) {
            res.status(500).json({ 
                error: 'Internal server error' 
            });
        }
    });

    return app;
}

describe('Request Body Decoding', () => {
    let app;

    beforeEach(() => {
        app = createTestApp();
    });

    describe('MessagePack Decoding', () => {
        it('should decode simple MessagePack data', (done) => {
            const testData = {
                v: '1.5.0',
                mid: 12345,
                time: 1234567890,
                message: 'test'
            };
            const packedData = msgpack.encode(testData);

            request(app)
                .post('/tokendata')
                .set('Content-Type', 'application/msgpack')
                .send(packedData)
                .expect(204)
                .end(done);
        });

        it('should decode MessagePack data with Buffer arrays', (done) => {
            const testData = {
                v: '1.5.0',
                devices: [
                    Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05]),
                    Buffer.from([0x06, 0x07, 0x08, 0x09, 0x0A])
                ]
            };
            const packedData = msgpack.encode(testData);

            request(app)
                .post('/tokendata')
                .set('Content-Type', 'application/msgpack')
                .send(packedData)
                .expect(204)
                .end(done);
        });

        it('should decode complex MessagePack gateway data structure', (done) => {
            const gatewayData = {
                v: '1.5.0',
                mid: 123456,
                time: Math.floor(Date.now() / 1000),
                ip: '192.168.1.100',
                mac: '12:34:56:78:9A:BC',
                rssi: -45,
                iccid: '1234567890123456789',
                devices: [
                    Buffer.from([
                        0x00, // Advertising type
                        0x11, 0x22, 0x33, 0x44, 0x55, 0x66, // MAC address
                        0xC0, // RSSI
                        0x02, 0x01, 0x06, // Advertisement data
                        0x03, 0x02, 0x0F, 0x18,
                        0x05, 0x09, 0x54, 0x65, 0x73, 0x74
                    ]),
                    Buffer.from([
                        0x01,
                        0x66, 0x55, 0x44, 0x33, 0x22, 0x11,
                        0xB0,
                        0x02, 0x01, 0x1A,
                        0x03, 0x03, 0x12, 0x18,
                        0x00, 0x00, 0x00, 0x00, 0x00, 0x00
                    ])
                ]
            };
            const packedData = msgpack.encode(gatewayData);

            request(app)
                .post('/tokendata')
                .set('Content-Type', 'application/msgpack')
                .send(packedData)
                .expect(204)
                .end(done);
        });

        it('should handle malformed MessagePack data', (done) => {
            // Create truly invalid MessagePack data by starting with an incomplete map
            const invalidData = Buffer.from([0x81, 0xFF]);

            request(app)
                .post('/tokendata')
                .set('Content-Type', 'application/msgpack')
                .send(invalidData)
                .expect(400)
                .expect((res) => {
                    expect(res.body.error).to.equal('Invalid request body format');
                    expect(res.body).to.have.property('details');
                })
                .end(done);
        });
    });

    describe('JSON Decoding', () => {
        it('should decode simple JSON data', (done) => {
            const testData = {
                v: '1.5.0',
                mid: 12345,
                time: 1234567890,
                message: 'test'
            };

            request(app)
                .post('/tokendata')
                .set('Content-Type', 'application/json')
                .send(JSON.stringify(testData))
                .expect(204)
                .end(done);
        });

        it('should decode JSON data with hex string arrays', (done) => {
            const testData = {
                v: '1.5.0',
                devices: [
                    '0102030405',
                    '060708090A'
                ]
            };

            request(app)
                .post('/tokendata')
                .set('Content-Type', 'application/json')
                .send(JSON.stringify(testData))
                .expect(204)
                .end(done);
        });

        it('should decode complex JSON gateway data structure', (done) => {
            const gatewayData = {
                v: '1.5.0',
                mid: 123456,
                time: Math.floor(Date.now() / 1000),
                ip: '192.168.1.100',
                mac: '12:34:56:78:9A:BC',
                rssi: -45,
                devices: [
                    '0011223344556C002010603020F18050954657374',
                    '016655443322114B02011A030312180000000000'
                ]
            };

            request(app)
                .post('/tokendata')
                .set('Content-Type', 'application/json')
                .send(JSON.stringify(gatewayData))
                .expect(204)
                .end(done);
        });

        it('should handle malformed JSON data', (done) => {
            const invalidJson = '{ "v": "1.5.0", "invalid": ';

            request(app)
                .post('/tokendata')
                .set('Content-Type', 'application/json')
                .send(invalidJson)
                .expect(400)
                .expect((res) => {
                    expect(res.body.error).to.equal('Invalid request body format');
                    expect(res.body).to.have.property('details');
                })
                .end(done);
        });

        it('should handle empty JSON object', (done) => {
            request(app)
                .post('/tokendata')
                .set('Content-Type', 'application/json')
                .send('{}')
                .expect(204)
                .end(done);
        });
    });

    describe('Content-Type Edge Cases', () => {
        it('should handle Content-Type with charset for JSON', (done) => {
            const testData = { v: '1.0.0', test: true };

            request(app)
                .post('/tokendata')
                .set('Content-Type', 'application/json; charset=utf-8')
                .send(JSON.stringify(testData))
                .expect(204)
                .end(done);
        });

        it('should handle Content-Type with additional parameters for MessagePack', (done) => {
            const testData = { v: '1.0.0', test: true };
            const packedData = msgpack.encode(testData);

            request(app)
                .post('/tokendata')
                .set('Content-Type', 'application/msgpack; boundary=something')
                .send(packedData)
                .expect(204)
                .end(done);
        });
    });

    describe('Large Payload Handling', () => {
        it('should handle large MessagePack payloads', (done) => {
            const devices = [];
            // Create 500 mock devices with 20 bytes each
            for (let i = 0; i < 500; i++) {
                devices.push(Buffer.from(Array(20).fill().map((_, idx) => (i + idx) % 256)));
            }

            const largeData = {
                v: '1.5.0',
                mid: 999999,
                devices: devices
            };
            const packedData = msgpack.encode(largeData);

            request(app)
                .post('/tokendata')
                .set('Content-Type', 'application/msgpack')
                .send(packedData)
                .expect(204)
                .end(done);
        });

        it('should handle large JSON payloads', (done) => {
            const devices = [];
            // Create 500 mock device hex strings
            for (let i = 0; i < 500; i++) {
                const deviceHex = Array(40).fill().map((_, idx) => 
                    ((i + idx) % 256).toString(16).padStart(2, '0')
                ).join('');
                devices.push(deviceHex);
            }

            const largeData = {
                v: '1.5.0',
                mid: 999999,
                devices: devices
            };

            request(app)
                .post('/tokendata')
                .set('Content-Type', 'application/json')
                .send(JSON.stringify(largeData))
                .expect(204)
                .end(done);
        });
    });
});

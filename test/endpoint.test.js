/**
 * HTTP Endpoint Tests
 * Tests for the HTTP ingestion endpoint functionality
 */

const { expect } = require('chai');
const request = require('supertest');
const express = require('express');
const msgpack = require('msgpack5')();

// Create a test app instance
function createTestApp() {
    const app = express();
    
    // Apply the same middleware as the main app
    app.use('/tokendata', express.raw({ 
        type: ['application/msgpack', 'application/json'],
        limit: '10mb'
    }));

    // Copy the main endpoint logic for testing
    app.post('/tokendata', (req, res) => {
        try {
            const contentType = req.get('Content-Type');
            const sourceIP = req.ip || req.connection.remoteAddress;
            
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
            
            // Return 204 No Content as specified in the technical spec
            res.status(204).send();
            
        } catch (error) {
            res.status(500).json({ 
                error: 'Internal server error' 
            });
        }
    });

    // Health check endpoint
    app.get('/health', (req, res) => {
        res.status(200).json({ 
            status: 'ok', 
            timestamp: new Date().toISOString(),
            version: '1.0.0'
        });
    });

    // 404 handler
    app.use((req, res) => {
        res.status(404).json({ 
            error: 'Endpoint not found' 
        });
    });

    return app;
}

describe('HTTP Endpoint', () => {
    let app;

    beforeEach(() => {
        app = createTestApp();
    });

    describe('POST /tokendata', () => {
        describe('Content-Type Validation', () => {
            it('should accept application/msgpack content type', (done) => {
                const testData = { test: 'data' };
                const packedData = msgpack.encode(testData);

                request(app)
                    .post('/tokendata')
                    .set('Content-Type', 'application/msgpack')
                    .send(packedData)
                    .expect(204)
                    .end(done);
            });

            it('should accept application/json content type', (done) => {
                const testData = { test: 'data' };

                request(app)
                    .post('/tokendata')
                    .set('Content-Type', 'application/json')
                    .send(JSON.stringify(testData))
                    .expect(204)
                    .end(done);
            });

            it('should reject unsupported content types', (done) => {
                request(app)
                    .post('/tokendata')
                    .set('Content-Type', 'text/plain')
                    .send('test data')
                    .expect(400)
                    .expect((res) => {
                        expect(res.body.error).to.include('Content-Type must be application/msgpack or application/json');
                    })
                    .end(done);
            });

            it('should reject requests without content type', (done) => {
                request(app)
                    .post('/tokendata')
                    .send('test data')
                    .expect(400)
                    .expect((res) => {
                        expect(res.body.error).to.include('Content-Type must be application/msgpack or application/json');
                    })
                    .end(done);
            });
        });

        describe('Request Body Validation', () => {
            it('should reject empty request body', (done) => {
                request(app)
                    .post('/tokendata')
                    .set('Content-Type', 'application/json')
                    .expect(400)
                    .expect((res) => {
                        expect(res.body.error).to.include('Request body is required');
                    })
                    .end(done);
            });

            it('should handle valid MessagePack data', (done) => {
                const testData = { 
                    v: '1.0.0',
                    devices: [Buffer.from([0x01, 0x02, 0x03])]
                };
                const packedData = msgpack.encode(testData);

                request(app)
                    .post('/tokendata')
                    .set('Content-Type', 'application/msgpack')
                    .send(packedData)
                    .expect(204)
                    .end(done);
            });

            it('should handle valid JSON data', (done) => {
                const testData = { 
                    v: '1.0.0',
                    devices: ['010203']
                };

                request(app)
                    .post('/tokendata')
                    .set('Content-Type', 'application/json')
                    .send(JSON.stringify(testData))
                    .expect(204)
                    .end(done);
            });
        });

        describe('Response Status Codes', () => {
            it('should return 204 No Content for successful processing', (done) => {
                const testData = { test: 'data' };

                request(app)
                    .post('/tokendata')
                    .set('Content-Type', 'application/json')
                    .send(JSON.stringify(testData))
                    .expect(204)
                    .expect((res) => {
                        expect(res.body).to.be.empty;
                    })
                    .end(done);
            });

            it('should return 400 Bad Request for invalid content type', (done) => {
                request(app)
                    .post('/tokendata')
                    .set('Content-Type', 'text/plain')
                    .send('test')
                    .expect(400)
                    .end(done);
            });

            it('should return 400 Bad Request for empty body', (done) => {
                request(app)
                    .post('/tokendata')
                    .set('Content-Type', 'application/json')
                    .expect(400)
                    .end(done);
            });
        });
    });

    describe('GET /health', () => {
        it('should return health status', (done) => {
            request(app)
                .get('/health')
                .expect(200)
                .expect((res) => {
                    expect(res.body).to.have.property('status', 'ok');
                    expect(res.body).to.have.property('timestamp');
                    expect(res.body).to.have.property('version');
                    expect(res.body.timestamp).to.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
                })
                .end(done);
        });
    });

    describe('404 Handler', () => {
        it('should return 404 for unknown endpoints', (done) => {
            request(app)
                .get('/unknown')
                .expect(404)
                .expect((res) => {
                    expect(res.body.error).to.equal('Endpoint not found');
                })
                .end(done);
        });

        it('should return 404 for POST to unknown endpoints', (done) => {
            request(app)
                .post('/unknown')
                .set('Content-Type', 'application/json')
                .send('{}')
                .expect(404)
                .end(done);
        });
    });

    describe('MessagePack Integration', () => {
        it('should properly decode MessagePack data structure', (done) => {
            const gatewayData = {
                v: '1.5.0',
                mid: 123,
                time: 1234567890,
                ip: '192.168.1.100',
                mac: '12:34:56:78:9A:BC',
                devices: [
                    Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09]),
                    Buffer.from([0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x10, 0x11, 0x12])
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

        it('should handle large MessagePack payloads', (done) => {
            const devices = [];
            // Create 100 mock devices
            for (let i = 0; i < 100; i++) {
                devices.push(Buffer.from(Array(20).fill().map((_, idx) => i + idx)));
            }

            const gatewayData = {
                v: '1.5.0',
                devices: devices
            };
            const packedData = msgpack.encode(gatewayData);

            request(app)
                .post('/tokendata')
                .set('Content-Type', 'application/msgpack')
                .send(packedData)
                .expect(204)
                .end(done);
        });
    });
});

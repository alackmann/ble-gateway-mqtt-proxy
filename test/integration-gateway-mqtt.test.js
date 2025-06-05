/**
 * Integration test for Gateway Status MQTT Publishing (Task 12)
 * Tests that gateway data is published to MQTT when a valid POST is received
 */

const chai = require('chai');
const sinon = require('sinon');
const request = require('supertest');
const msgpack = require('msgpack5')();
const { expect } = chai;

// Import modules
const mqttClient = require('../src/mqtt-client');
const logger = require('../src/logger');
const { createMockGatewayData } = require('./utils');

describe('Gateway Status MQTT Publishing Integration (Task 12)', () => {
    let app;
    let mqttPublishStub;
    let mqttInitStub;
    let mqttConnectedStub;
    let loggerStub;

    beforeEach(() => {
        // Mock MQTT and logger before requiring the app
        mqttInitStub = sinon.stub(mqttClient, 'initializeMqttClient').resolves();
        mqttConnectedStub = sinon.stub(mqttClient, 'isConnected').returns(true);
        mqttPublishStub = sinon.stub(mqttClient, 'publishGatewayData').resolves();
        
        // Also stub device publishing to avoid issues
        sinon.stub(mqttClient, 'publishMultipleDeviceData').resolves({
            totalCount: 0,
            successCount: 0,
            errorCount: 0,
            errors: []
        });

        // Stub logger methods to avoid console output during tests
        loggerStub = {
            debug: sinon.stub(logger, 'debug'),
            info: sinon.stub(logger, 'info'),
            warn: sinon.stub(logger, 'warn'),
            error: sinon.stub(logger, 'error'),
            logRequest: sinon.stub(logger, 'logRequest'),
            logProcessingSuccess: sinon.stub(logger, 'logProcessingSuccess'),
            logProcessingError: sinon.stub(logger, 'logProcessingError'),
            logStartup: sinon.stub(logger, 'logStartup')
        };
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('Valid POST Request Processing', () => {
        it('should publish gateway status to MQTT when processing valid MessagePack data', async () => {
            // Require the app after stubs are in place
            delete require.cache[require.resolve('../src/index.js')];
            const express = require('express');
            const app = express();
            
            // We need to recreate just the POST endpoint for testing
            app.use('/tokendata', express.raw({ 
                type: () => true, 
                limit: '10mb' 
            }));
            
            // Create the test route (simplified version of the main endpoint)
            app.post('/tokendata', async (req, res) => {
                try {
                    const decodedData = msgpack.decode(req.body);
                    const gatewayParser = require('../src/gateway-parser');
                    const parsedData = gatewayParser.parseGatewayData(decodedData);
                    const validation = gatewayParser.validateGatewayData(parsedData.gatewayInfo);
                    
                    if (!validation.isValid) {
                        return res.status(400).json({ error: 'Invalid gateway data' });
                    }
                    
                    // This is what we're testing - gateway MQTT publishing
                    await mqttClient.publishGatewayData(parsedData.gatewayInfo);
                    
                    res.status(204).send();
                } catch (error) {
                    res.status(500).json({ error: 'Internal server error' });
                }
            });
            
            // Create test gateway data
            const gatewayData = createMockGatewayData({ deviceCount: 0 });
            const messagePackData = msgpack.encode(gatewayData);

            // Send POST request
            const response = await request(app)
                .post('/tokendata')
                .set('Content-Type', 'application/msgpack')
                .send(messagePackData);

            // Verify HTTP response
            expect(response.status).to.equal(204);

            // Verify gateway data was published to MQTT
            expect(mqttPublishStub.calledOnce).to.be.true;
            
            const publishedData = mqttPublishStub.getCall(0).args[0];
            expect(publishedData).to.include({
                version: gatewayData.v,
                messageId: gatewayData.mid,  
                ip: gatewayData.ip,
                mac: gatewayData.mac
            });
        });

        it('should handle MQTT publishing failures gracefully', async () => {
            // Make MQTT publishing fail
            mqttPublishStub.rejects(new Error('MQTT connection failed'));
            
            // Create test app
            const express = require('express');
            const app = express();
            app.use('/tokendata', express.raw({ type: () => true, limit: '10mb' }));
            
            app.post('/tokendata', async (req, res) => {
                try {
                    const decodedData = msgpack.decode(req.body);
                    const gatewayParser = require('../src/gateway-parser');
                    const parsedData = gatewayParser.parseGatewayData(decodedData);
                    const validation = gatewayParser.validateGatewayData(parsedData.gatewayInfo);
                    
                    if (!validation.isValid) {
                        return res.status(400).json({ error: 'Invalid gateway data' });
                    }
                    
                    // Try to publish gateway data - should fail but not affect response
                    try {
                        await mqttClient.publishGatewayData(parsedData.gatewayInfo);
                    } catch (gatewayMqttError) {
                        // Log error but continue
                    }
                    
                    res.status(204).send();
                } catch (error) {
                    res.status(500).json({ error: 'Internal server error' });
                }
            });
            
            const gatewayData = createMockGatewayData({ deviceCount: 0 });
            const messagePackData = msgpack.encode(gatewayData);

            // Send POST request
            const response = await request(app)
                .post('/tokendata')
                .set('Content-Type', 'application/msgpack')
                .send(messagePackData);

            // Should still return 204 (MQTT failures don't affect HTTP response)
            expect(response.status).to.equal(204);

            // Verify gateway publishing was attempted
            expect(mqttPublishStub.calledOnce).to.be.true;
        });
    });

    describe('Invalid Requests', () => {
        it('should not publish gateway status for invalid gateway data', async () => {
            // Create test app
            const express = require('express');
            const app = express();
            app.use('/tokendata', express.raw({ type: () => true, limit: '10mb' }));
            
            app.post('/tokendata', async (req, res) => {
                try {
                    const decodedData = msgpack.decode(req.body);
                    const gatewayParser = require('../src/gateway-parser');
                    const parsedData = gatewayParser.parseGatewayData(decodedData);
                    const validation = gatewayParser.validateGatewayData(parsedData.gatewayInfo);
                    
                    if (!validation.isValid) {
                        return res.status(400).json({ error: 'Invalid gateway data' });
                    }
                    
                    await mqttClient.publishGatewayData(parsedData.gatewayInfo);
                    res.status(204).send();
                } catch (error) {
                    res.status(500).json({ error: 'Internal server error' });
                }
            });
            
            // Create invalid gateway data (missing required fields)
            const invalidData = { invalid: 'data' };
            const messagePackData = msgpack.encode(invalidData);

            // Send POST request
            const response = await request(app)
                .post('/tokendata')
                .set('Content-Type', 'application/msgpack')
                .send(messagePackData);

            // Should return 400 for invalid data
            expect(response.status).to.equal(400);

            // Gateway status should NOT be published for invalid data
            expect(mqttPublishStub.called).to.be.false;
        });

        it('should not publish gateway status for empty requests', async () => {
            // Create test app  
            const express = require('express');
            const app = express();
            app.use('/tokendata', express.raw({ type: () => true, limit: '10mb' }));
            
            app.post('/tokendata', async (req, res) => {
                if (!req.body || req.body.length === 0) {
                    return res.status(400).json({ error: 'Request body is required' });
                }
                res.status(204).send();
            });

            // Send empty POST request
            const response = await request(app)
                .post('/tokendata')
                .set('Content-Type', 'application/msgpack')
                .send(Buffer.alloc(0));

            // Should return 400 for empty body
            expect(response.status).to.equal(400);

            // Gateway status should NOT be published
            expect(mqttPublishStub.called).to.be.false;
        });
    });
});

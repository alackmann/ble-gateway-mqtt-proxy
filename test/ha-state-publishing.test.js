/**
 * Integration tests for Home Assistant state topic publishing
 */

const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire').noCallThru();

describe('Home Assistant State Topic Publishing Integration', () => {
    let mqttClient;
    let mockMqtt;
    let mockConfig;
    let mockLogger;
    let jsonTransformer;
    
    beforeEach(() => {
        // Create mock dependencies
        mockMqtt = {
            connect: sinon.stub().returns({
                on: sinon.stub().returns({}),
                publish: sinon.stub().callsArg(3), // Call callback with no error
                end: sinon.stub().callsArg(0), // Call callback with no error
                connected: true
            })
        };
        
        mockLogger = {
            info: sinon.stub(),
            warn: sinon.stub(),
            error: sinon.stub(),
            debug: sinon.stub(),
            logMqttPublish: sinon.stub(),
            logMqttConnection: sinon.stub()
        };
        
        // Configure mock configuration
        mockConfig = {
            config: {
                mqtt: {
                    brokerUrl: 'mqtt://localhost:1883',
                    username: 'test',
                    password: 'test',
                    topicPrefix: 'blegateway/',
                    qos: 1,
                    retain: true // Set to true to confirm it's being overridden for state topics
                },
                homeAssistant: {
                    enabled: true,
                    discoveryTopicPrefix: 'homeassistant',
                    devices: new Map([
                        ['123b6a1b85ef', { name: 'Car Token' }],
                        ['aabbccddeeff', { name: 'Bike Token' }]
                    ])
                }
            }
        };
        
        // Load the MQTT client module with mocks
        mqttClient = proxyquire('../src/mqtt-client', {
            'mqtt': mockMqtt,
            './config': mockConfig,
            './logger': mockLogger
        });
        
        // Initialize the MQTT client
        mqttClient.initializeMqttClient();
    });
    
    afterEach(() => {
        sinon.restore();
    });
    
    describe('State Topic Format', () => {
        it('should use the new state topic format for all devices', () => {
            // Test topic construction
            const macAddress = '00:11:22:33:44:55';
            const topic = mqttClient.constructTopic(macAddress);
            
            // Should use the new state topic format
            expect(topic).to.equal('blegateway/state/00:11:22:33:44:55');
        });
        
        it('should use the same state topic format for HA and non-HA devices', () => {
            // HA configured device
            const haTopic = mqttClient.constructTopic('12:3B:6A:1B:85:EF');
            
            // Non-HA device
            const nonHaTopic = mqttClient.constructTopic('00:11:22:33:44:55');
            
            // Both should use the same format pattern
            expect(haTopic).to.equal('blegateway/state/12:3B:6A:1B:85:EF');
            expect(nonHaTopic).to.equal('blegateway/state/00:11:22:33:44:55');
        });
    });
    
    describe('Message Retention', () => {
        it('should always publish state messages with retain=false', async () => {
            // Create a test payload
            const testPayload = {
                mac_address: '00:11:22:33:44:55',
                rssi: -75,
                advertising_type_code: 0,
                advertising_type_description: 'Test',
                advertisement_data_hex: 'AABB',
                last_seen_timestamp: new Date().toISOString()
            };
            
            // Publish the payload
            await mqttClient.publishDeviceData(testPayload);
            
            // Verify the publish was called with retain=false
            const publishArgs = mockMqtt.connect().publish.firstCall.args;
            expect(publishArgs[2].retain).to.be.false;
            
            // Even though config.mqtt.retain was set to true
            expect(mockConfig.config.mqtt.retain).to.be.true;
        });
        
        it('should publish multiple device messages with retain=false', async () => {
            // Create test payloads
            const testPayloads = [
                {
                    mac_address: '00:11:22:33:44:55',
                    rssi: -75,
                    advertising_type_code: 0,
                    advertising_type_description: 'Test 1',
                    advertisement_data_hex: 'AABB',
                    last_seen_timestamp: new Date().toISOString()
                },
                {
                    mac_address: '66:77:88:99:AA:BB',
                    rssi: -80,
                    advertising_type_code: 0,
                    advertising_type_description: 'Test 2',
                    advertisement_data_hex: 'CCDD',
                    last_seen_timestamp: new Date().toISOString()
                }
            ];
            
            // Publish the payloads
            await mqttClient.publishMultipleDeviceData(testPayloads);
            
            // Verify all publishes were called with retain=false
            const calls = mockMqtt.connect().publish.getCalls();
            expect(calls.length).to.equal(2);
            
            calls.forEach(call => {
                expect(call.args[2].retain).to.be.false;
            });
        });
    });
    
    describe('Topic Prefixes', () => {
        it('should handle topic prefix with trailing slash', () => {
            // Original prefix already has trailing slash
            const macAddress = '00:11:22:33:44:55';
            const topic = mqttClient.constructTopic(macAddress);
            expect(topic).to.equal('blegateway/state/00:11:22:33:44:55');
            
            // Change to prefix without trailing slash
            const originalPrefix = mockConfig.config.mqtt.topicPrefix;
            mockConfig.config.mqtt.topicPrefix = 'blegateway';
            
            const topic2 = mqttClient.constructTopic(macAddress);
            expect(topic2).to.equal('blegateway/state/00:11:22:33:44:55');
            
            // Restore original prefix
            mockConfig.config.mqtt.topicPrefix = originalPrefix;
        });
    });
    
    describe('Integration with Device Publishing', () => {
        it('should publish device data to the correct state topic', async () => {
            // Create a test payload
            const testPayload = {
                mac_address: '12:3B:6A:1B:85:EF', // HA configured device
                rssi: -75,
                advertising_type_code: 0,
                advertising_type_description: 'Test',
                advertisement_data_hex: 'AABB',
                last_seen_timestamp: new Date().toISOString()
            };
            
            // Publish the payload
            await mqttClient.publishDeviceData(testPayload);
            
            // Verify the publish was called with the correct topic
            const publishArgs = mockMqtt.connect().publish.firstCall.args;
            expect(publishArgs[0]).to.equal('blegateway/state/12:3B:6A:1B:85:EF');
            
            // Verify the message content is the full JSON payload
            const message = JSON.parse(publishArgs[1]);
            expect(message).to.deep.equal(testPayload);
        });
    });
});

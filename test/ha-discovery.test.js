/**
 * Unit tests for Home Assistant MQTT Discovery integration
 */

const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire').noCallThru();

describe('Home Assistant Discovery Publisher', () => {
    let haDiscovery;
    let mqttClientStub;
    let loggerStub;
    let configStub;
    let formatMacStub;
    let slugifyStub;
    
    // Sample device data
    const devices = new Map();
    devices.set('123b6a1b85ef', { name: 'Car Token' });
    devices.set('aabbccddeeff', { name: 'Bike Token' });
    
    beforeEach(() => {
        // Create stubs
        mqttClientStub = {
            publish: sinon.stub().resolves(),
            isConnected: sinon.stub().returns(true)
        };
        
        loggerStub = {
            info: sinon.stub(),
            warn: sinon.stub(),
            error: sinon.stub(),
            debug: sinon.stub()
        };
        
        configStub = {
            config: {
                mqtt: {
                    topicPrefix: 'blegateway/'
                },
                homeAssistant: {
                    enabled: true,
                    discoveryTopicPrefix: 'homeassistant',
                    devices: devices,
                    gatewayName: 'April Brother BLE Gateway'
                }
            }
        };
        
        formatMacStub = sinon.stub().callsFake(mac => {
            // Simple implementation for test
            return mac.match(/.{1,2}/g).join(':').toUpperCase();
        });
        
        slugifyStub = sinon.stub().callsFake(text => {
            // Simple implementation for test
            return text.toLowerCase().replace(/\s+/g, '_');
        });
        
        // Create module with stubs
        haDiscovery = proxyquire('../src/ha-discovery', {
            './logger': loggerStub,
            './config': configStub,
            './utils': { formatMac: formatMacStub, slugify: slugifyStub }
        });
        
        // Reset published devices between tests
        haDiscovery.resetPublishedDevices();
    });
    
    afterEach(() => {
        sinon.restore();
    });
    
    describe('createDeviceObject()', () => {
        it('should create a valid device object for Home Assistant', () => {
            const result = haDiscovery.createDeviceObject('123b6a1b85ef', 'Car Token');
            
            expect(result).to.be.an('object');
            expect(result.identifiers).to.be.an('array').with.lengthOf(1);
            expect(result.identifiers[0]).to.equal('123b6a1b85ef');
            expect(result.name).to.equal('Car Token');
            expect(result.model).to.equal('April Brother BLE Gateway v4 Token');
            expect(result.manufacturer).to.equal('April Brother');
        });
    });
    
    describe('createRssiSensorConfig()', () => {
        it('should create a valid RSSI sensor config', () => {
            const deviceObject = haDiscovery.createDeviceObject('123b6a1b85ef', 'Car Token');
            const result = haDiscovery.createRssiSensorConfig(
                '123b6a1b85ef', 
                '12:3B:6A:1B:85:EF', 
                'Car Token', 
                deviceObject
            );
            
            expect(result).to.be.an('object');
            expect(result.name).to.equal('Car Token RSSI');
            expect(result.unique_id).to.equal('ble_token_123b6a1b85ef_rssi');
            expect(result.state_topic).to.equal('blegateway/state/123b6a1b85ef');
            expect(result.value_template).to.equal('{{ value_json.rssi | default(0) }}');
            expect(result.unit_of_measurement).to.equal('dBm');
            expect(result.device_class).to.equal('signal_strength');
            expect(result.expire_after).to.equal(300);
            expect(result.device).to.deep.equal(deviceObject);
        });
    });
    
    describe('createLastSeenSensorConfig()', () => {
        it('should create a valid Last Seen sensor config', () => {
            const deviceObject = haDiscovery.createDeviceObject('123b6a1b85ef', 'Car Token');
            const result = haDiscovery.createLastSeenSensorConfig(
                '123b6a1b85ef', 
                '12:3B:6A:1B:85:EF', 
                'Car Token', 
                deviceObject
            );
            
            expect(result).to.be.an('object');
            expect(result.name).to.equal('Car Token Last Seen');
            expect(result.unique_id).to.equal('ble_token_123b6a1b85ef_last_seen');
            expect(result.state_topic).to.equal('blegateway/state/123b6a1b85ef');
            expect(result.value_template).to.equal('{{ value_json.last_seen_timestamp }}');
            expect(result.device_class).to.equal('timestamp');
            expect(result.expire_after).to.equal(300);
            expect(result.device).to.deep.equal(deviceObject);
        });
    });
    
    describe('publishDeviceDiscovery()', () => {
        it('should publish discovery messages for a single device', async () => {
            const result = await haDiscovery.publishDeviceDiscovery(
                mqttClientStub, 
                '123b6a1b85ef', 
                { name: 'Car Token' }
            );
            
            expect(result).to.be.true;
            expect(mqttClientStub.publish.calledTwice).to.be.true;
            
            // Verify RSSI sensor config publish
            const rssiCall = mqttClientStub.publish.getCall(0);
            expect(rssiCall.args[0]).to.equal('homeassistant/sensor/car_token_rssi/config');
            expect(JSON.parse(rssiCall.args[1])).to.have.property('name', 'Car Token RSSI');
            expect(rssiCall.args[2]).to.deep.equal({ retain: true });
            
            // Verify Last Seen sensor config publish
            const lastSeenCall = mqttClientStub.publish.getCall(1);
            expect(lastSeenCall.args[0]).to.equal('homeassistant/sensor/car_token_last_seen/config');
            expect(JSON.parse(lastSeenCall.args[1])).to.have.property('name', 'Car Token Last Seen');
            expect(lastSeenCall.args[2]).to.deep.equal({ retain: true });
            
            // Verify logging
            expect(loggerStub.info.calledTwice).to.be.true;
            expect(loggerStub.error.called).to.be.false;
        });
        
        it('should not publish discovery messages for already published devices', async () => {
            // First call should publish
            await haDiscovery.publishDeviceDiscovery(
                mqttClientStub, 
                '123b6a1b85ef', 
                { name: 'Car Token' }
            );
            
            mqttClientStub.publish.reset();
            loggerStub.info.reset();
            
            // Second call should not publish
            const result = await haDiscovery.publishDeviceDiscovery(
                mqttClientStub, 
                '123b6a1b85ef', 
                { name: 'Car Token' }
            );
            
            expect(result).to.be.false;
            expect(mqttClientStub.publish.called).to.be.false;
            expect(loggerStub.info.called).to.be.false;
        });
        
        it('should handle errors during publishing', async () => {
            mqttClientStub.publish.rejects(new Error('MQTT error'));
            
            const result = await haDiscovery.publishDeviceDiscovery(
                mqttClientStub, 
                '123b6a1b85ef', 
                { name: 'Car Token' }
            );
            
            expect(result).to.be.false;
            expect(loggerStub.error.calledOnce).to.be.true;
        });
    });
    
    describe('publishDiscoveryMessages()', () => {
        beforeEach(() => {
            // Make sure the gatewayName is set for all tests in this describe block
            configStub.config.homeAssistant.gatewayName = 'Test Gateway';
            
            // Mock the publishGatewayDiscovery method to prevent errors
            const originalPublishGatewayDiscovery = haDiscovery.publishGatewayDiscovery;
            sinon.stub(haDiscovery, 'publishGatewayDiscovery').callsFake(async (mqttClient) => {
                // Return true for first call, false for subsequent calls
                if (!gatewayPublished) {
                    gatewayPublished = true;
                    return true;
                }
                return false;
            });
        });
        
        afterEach(() => {
            // Restore the original method
            if (haDiscovery.publishGatewayDiscovery.restore) {
                haDiscovery.publishGatewayDiscovery.restore();
            }
            gatewayPublished = false;
        });
        
        let gatewayPublished = false;
        
        it('should publish discovery messages for all configured devices', async () => {
            // Reset the existing publish stub to track calls
            mqttClientStub.publish.resetHistory();
            
            const result = await haDiscovery.publishDiscoveryMessages(mqttClientStub);
            
            expect(result).to.equal(3); // Two devices + gateway published
            // Should have 10 publish calls (2 per device + 6 for gateway)
            expect(mqttClientStub.publish.callCount).to.equal(10); 
            expect(loggerStub.info.callCount).to.be.at.least(5); // Start message + 2 per device + summary
        });
        
        it('should do nothing when Home Assistant is disabled', async () => {
            configStub.config.homeAssistant.enabled = false;
            
            const result = await haDiscovery.publishDiscoveryMessages(mqttClientStub);
            
            expect(result).to.equal(0);
            expect(mqttClientStub.publish.called).to.be.false;
            expect(loggerStub.info.calledOnce).to.be.true;
            expect(loggerStub.info.firstCall.args[0]).to.include('disabled');
        });
        
        it('should handle disconnected MQTT client', async () => {
            mqttClientStub.isConnected.returns(false);
            
            const result = await haDiscovery.publishDiscoveryMessages(mqttClientStub);
            
            expect(result).to.equal(0);
            expect(mqttClientStub.publish.called).to.be.false;
            expect(loggerStub.error.calledOnce).to.be.true;
            expect(loggerStub.error.firstCall.args[0]).to.include('not connected');
        });
        
        it('should handle empty device list', async () => {
            configStub.config.homeAssistant.devices = new Map();
            
            const result = await haDiscovery.publishDiscoveryMessages(mqttClientStub);
            
            // It still publishes gateway discovery
            expect(result).to.equal(1); // Only gateway (stub returns 1)
            expect(loggerStub.warn.calledOnce).to.be.true;
            expect(loggerStub.warn.firstCall.args[0]).to.include('No Home Assistant BLE devices');
        });
        
        it('should only publish discovery messages for new devices', async () => {
            // First call should publish both devices + gateway
            await haDiscovery.publishDiscoveryMessages(mqttClientStub);
            
            mqttClientStub.publish.reset();
            loggerStub.info.reset();
            
            // Second call should not publish any devices
            const result = await haDiscovery.publishDiscoveryMessages(mqttClientStub);
            
            expect(result).to.equal(0);
            expect(mqttClientStub.publish.called).to.be.false;
            expect(loggerStub.info.callCount).to.be.at.least(2); // Start message + summary
        });
    });
    
    describe('createGatewayDeviceObject()', () => {
        it('should create a valid device object for the gateway', () => {
            configStub.config.homeAssistant.gatewayName = 'Test Gateway';
            
            const result = haDiscovery.createGatewayDeviceObject();
            
            expect(result).to.be.an('object');
            expect(result.identifiers).to.be.an('array').with.lengthOf(1);
            expect(result.identifiers[0]).to.equal('ble_gateway');
            expect(result.name).to.equal('Test Gateway');
            expect(result.model).to.equal('April Brother BLE Gateway v4');
            expect(result.manufacturer).to.equal('April Brother');
        });
    });
    
    describe('createGatewaySensorConfig()', () => {
        it('should create a valid gateway sensor config', () => {
            const deviceObject = haDiscovery.createGatewayDeviceObject();
            const result = haDiscovery.createGatewaySensorConfig(
                'version',
                'Gateway Version',
                '{{ value_json.version }}',
                null,
                deviceObject
            );
            
            expect(result).to.be.an('object');
            expect(result.name).to.equal('Gateway Version');
            expect(result.unique_id).to.equal('ble_gateway_version');
            expect(result.state_topic).to.equal('blegateway/gateway/state');
            expect(result.value_template).to.equal('{{ value_json.version }}');
            expect(result.device).to.equal(deviceObject);
        });
        
        it('should include device class when provided', () => {
            const deviceObject = haDiscovery.createGatewayDeviceObject();
            const result = haDiscovery.createGatewaySensorConfig(
                'last_ping',
                'Gateway Last Ping',
                '{{ value_json.processed_timestamp }}',
                'timestamp',
                deviceObject
            );
            
            expect(result).to.be.an('object');
            expect(result.device_class).to.equal('timestamp');
        });
    });
    
    describe('publishGatewayDiscovery()', () => {
        beforeEach(() => {
            configStub.config.homeAssistant.gatewayName = 'Test Gateway';
        });
        
        it('should publish discovery messages for the gateway', async () => {
            const result = await haDiscovery.publishGatewayDiscovery(mqttClientStub);
            
            expect(result).to.be.true;
            // Should publish 6 sensors: version, ip, mac, message_id, time, last_ping
            expect(mqttClientStub.publish.callCount).to.equal(6);
            expect(mqttClientStub.publish.args[0][0]).to.include('homeassistant/sensor/test_gateway_version/config');
            expect(mqttClientStub.publish.args[0][2]).to.deep.include({ retain: true });
        });
        
        it('should not publish discovery messages if already published', async () => {
            // First call should publish
            await haDiscovery.publishGatewayDiscovery(mqttClientStub);
            
            mqttClientStub.publish.reset();
            
            // Second call should not publish
            const result = await haDiscovery.publishGatewayDiscovery(mqttClientStub);
            
            expect(result).to.be.false;
            expect(mqttClientStub.publish.called).to.be.false;
        });
        
        it('should handle errors during publishing', async () => {
            mqttClientStub.publish.rejects(new Error('Test error'));
            
            try {
                await haDiscovery.publishGatewayDiscovery(mqttClientStub);
                // Should not reach here
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.equal('Test error');
                expect(loggerStub.error.called).to.be.true;
            }
        });
    });
});

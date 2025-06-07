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
                    devices: devices
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
            expect(result.identifiers[0]).to.equal('ble_token_123b6a1b85ef');
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
            expect(result.state_topic).to.equal('blegateway/state/12:3B:6A:1B:85:EF');
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
            expect(result.state_topic).to.equal('blegateway/state/12:3B:6A:1B:85:EF');
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
        it('should publish discovery messages for all configured devices', async () => {
            const result = await haDiscovery.publishDiscoveryMessages(mqttClientStub);
            
            expect(result).to.equal(2); // Two devices published
            expect(mqttClientStub.publish.callCount).to.equal(4); // Two messages per device
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
            
            expect(result).to.equal(0);
            expect(mqttClientStub.publish.called).to.be.false;
            expect(loggerStub.warn.calledOnce).to.be.true;
            expect(loggerStub.warn.firstCall.args[0]).to.include('No Home Assistant devices');
        });
        
        it('should only publish discovery messages for new devices', async () => {
            // First call should publish both devices
            await haDiscovery.publishDiscoveryMessages(mqttClientStub);
            
            mqttClientStub.publish.reset();
            loggerStub.info.reset();
            
            // Second call should not publish any devices
            const result = await haDiscovery.publishDiscoveryMessages(mqttClientStub);
            
            expect(result).to.equal(0);
            expect(mqttClientStub.publish.called).to.be.false;
            expect(loggerStub.info.callCount).to.equal(2); // Start message + summary
        });
    });
});

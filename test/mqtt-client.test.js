/**
 * MQTT Client Module Tests - Fixed Version
 * Tests for MQTT broker connection and publishing functionality
 */

const { expect } = require('chai');
const sinon = require('sinon');
const EventEmitter = require('events');
const proxyquire = require('proxyquire').noCallThru();
const { config } = require('../src/config');

describe('MQTT Client Module', function() {
  let mockClient;
  let mqttMock;
  let loggerMock;
  let mqttClient;
  
  beforeEach(function() {
    // Create a new mock client for each test
    mockClient = new EventEmitter();
    mockClient.connected = false;
    mockClient.reconnecting = false;
    mockClient.options = { clientId: 'test-client-id' };
    mockClient.publish = sinon.stub();
    mockClient.end = sinon.stub();
    
    // Create mqtt mock
    mqttMock = {
      connect: sinon.stub().returns(mockClient)
    };
    
    // Create logger mock
    loggerMock = {
      info: sinon.stub(),
      debug: sinon.stub(),
      warn: sinon.stub(),
      error: sinon.stub(),
      logMqttConnection: sinon.stub(),
      logMqttPublish: sinon.stub()
    };
    
    // Create a fresh instance of the module under test
    mqttClient = proxyquire('../src/mqtt-client', {
      'mqtt': mqttMock,
      './logger': loggerMock
    });
    
    // Reset any state
    mqttClient._resetState();
  });
  
  describe('constructTopic()', function() {
    it('should correctly construct a topic with MAC address', function() {
      const macAddress = '00:11:22:33:44:55';
      const origPrefix = config.mqtt.topicPrefix;
      
      // Test with the default prefix
      const topic = mqttClient.constructTopic(macAddress);
      expect(topic).to.equal(origPrefix + macAddress);
    });
    
    it('should handle prefix with trailing slash', function() {
      const macAddress = '00:11:22:33:44:55';
      const origPrefix = config.mqtt.topicPrefix;
      
      // Save original and restore after test
      try {
        // The prefix already has a trailing slash in default config
        const topic = mqttClient.constructTopic(macAddress);
        expect(topic).to.equal(origPrefix + macAddress);
        
        // Test a prefix without a trailing slash
        config.mqtt.topicPrefix = '/test/prefix';
        const topic2 = mqttClient.constructTopic(macAddress);
        expect(topic2).to.equal('/test/prefix/' + macAddress);
      } finally {
        config.mqtt.topicPrefix = origPrefix;
      }
    });
    
    it('should validate MAC address parameter', function() {
      expect(() => mqttClient.constructTopic(null)).to.throw('Invalid MAC address');
      expect(() => mqttClient.constructTopic('')).to.throw('Invalid MAC address');
      expect(() => mqttClient.constructTopic(123)).to.throw('Invalid MAC address');
    });
  });
  
  describe('initializeMqttClient()', function() {
    it('should connect to the MQTT broker', function(done) {
      const connectPromise = mqttClient.initializeMqttClient();
      
      // Simulate successful connection
      mockClient.connected = true;
      mockClient.emit('connect');
      
      connectPromise.then(result => {
        expect(result).to.be.true;
        expect(mqttMock.connect.calledOnce).to.be.true;
        expect(mqttMock.connect.firstCall.args[0]).to.equal(config.mqtt.brokerUrl);
        expect(loggerMock.logMqttConnection.calledWith('connected')).to.be.true;
        done();
      }).catch(done);
    });
    
    it('should handle connection errors', function(done) {
      const connectPromise = mqttClient.initializeMqttClient();
      
      // Simulate connection error
      const error = new Error('Connection failed');
      mockClient.emit('error', error);
      
      connectPromise.then(() => {
        done(new Error('Expected promise to be rejected'));
      }).catch(err => {
        expect(err.message).to.equal('Connection failed');
        expect(loggerMock.logMqttConnection.calledWith('error')).to.be.true;
        done();
      });
    });
  });
  
  describe('isConnected()', function() {
    it('should return false when not connected', function() {
      // The isConnected function returns mqttClient && mqttClient.connected
      // which should evaluate to false, not null, when mqttClient is null
      const result = mqttClient.isConnected();
      expect(result).to.equal(false);
    });
    
    it('should return true when connected', function(done) {
      const connectPromise = mqttClient.initializeMqttClient();
      
      // Simulate successful connection
      mockClient.connected = true;
      mockClient.emit('connect');
      
      connectPromise.then(() => {
        expect(mqttClient.isConnected()).to.be.true;
        done();
      }).catch(done);
    });
  });
  
  describe('publishDeviceData()', function() {
    beforeEach(function(done) {
      // Setup connected client for tests
      const connectPromise = mqttClient.initializeMqttClient();
      mockClient.connected = true;
      mockClient.emit('connect');
      connectPromise.then(() => done()).catch(done);
    });
    
    it('should successfully publish device data', function(done) {
      const testPayload = {
        mac_address: '00:11:22:33:44:55',
        rssi: -45
      };
      
      // Setup publish to succeed
      mockClient.publish.callsFake((topic, message, options, callback) => {
        callback(null);
      });
      
      mqttClient.publishDeviceData(testPayload).then(result => {
        expect(result).to.be.true;
        expect(mockClient.publish.calledOnce).to.be.true;
        
        // Verify topic construction
        const publishArgs = mockClient.publish.firstCall.args;
        expect(publishArgs[0]).to.include(testPayload.mac_address);
        
        // Verify message is JSON string
        expect(typeof publishArgs[1]).to.equal('string');
        const parsedMessage = JSON.parse(publishArgs[1]);
        expect(parsedMessage).to.deep.equal(testPayload);
        
        // Verify QoS and retain options
        expect(publishArgs[2].qos).to.equal(config.mqtt.qos);
        expect(publishArgs[2].retain).to.equal(config.mqtt.retain);
        
        done();
      }).catch(done);
    });
    
    it('should handle publish errors', function(done) {
      const testPayload = {
        mac_address: '00:11:22:33:44:55',
        rssi: -45
      };
      
      // Setup publish to fail
      const publishError = new Error('Publish failed');
      mockClient.publish.callsFake((topic, message, options, callback) => {
        callback(publishError);
      });
      
      mqttClient.publishDeviceData(testPayload).then(() => {
        done(new Error('Expected promise to be rejected'));
      }).catch(error => {
        expect(error.message).to.equal('Publish failed');
        expect(loggerMock.logMqttPublish.calledWith('failed')).to.be.true;
        done();
      });
    });
    
    it('should validate payload has mac_address', function(done) {
      const invalidPayload = {
        rssi: -45
      };
      
      mqttClient.publishDeviceData(invalidPayload).then(() => {
        done(new Error('Expected promise to be rejected'));
      }).catch(error => {
        expect(error.message).to.include('missing mac_address');
        done();
      });
    });
  });
  
  describe('publishMultipleDeviceData()', function() {
    beforeEach(function(done) {
      // Setup connected client for tests
      const connectPromise = mqttClient.initializeMqttClient();
      mockClient.connected = true;
      mockClient.emit('connect');
      connectPromise.then(() => done()).catch(done);
    });
    
    it('should publish multiple payloads', function(done) {
      const testPayloads = [
        { mac_address: '00:11:22:33:44:55', rssi: -45 },
        { mac_address: '66:77:88:99:AA:BB', rssi: -60 }
      ];
      
      // Setup publish to succeed
      mockClient.publish.callsFake((topic, message, options, callback) => {
        callback(null);
      });
      
      mqttClient.publishMultipleDeviceData(testPayloads).then(results => {
        expect(results.totalCount).to.equal(2);
        expect(results.successCount).to.equal(2);
        expect(results.errorCount).to.equal(0);
        expect(mockClient.publish.callCount).to.equal(2);
        done();
      }).catch(done);
    });
    
    it('should handle empty array', function(done) {
      mqttClient.publishMultipleDeviceData([]).then(results => {
        expect(results.totalCount).to.equal(0);
        expect(results.successCount).to.equal(0);
        expect(results.errorCount).to.equal(0);
        expect(mockClient.publish.called).to.be.false;
        done();
      }).catch(done);
    });
    
    it('should validate input is array', function(done) {
      // The error is thrown inside a Promise constructor, but it's still a Promise rejection
      mqttClient.publishMultipleDeviceData('not-an-array')
        .then(() => {
          done(new Error('Expected promise to be rejected'));
        })
        .catch(error => {
          try {
            expect(error.message).to.include('must be an array');
            done();
          } catch (err) {
            done(err);
          }
        });
    });
  });
  
  describe('disconnect()', function() {
    it('should gracefully disconnect the client', function(done) {
      // Setup connected client
      const connectPromise = mqttClient.initializeMqttClient();
      mockClient.connected = true;
      mockClient.emit('connect');
      
      connectPromise.then(() => {
        // Setup end to call callback
        mockClient.end.callsFake((force, options, callback) => {
          callback();
        });
        
        return mqttClient.disconnect();
      }).then(() => {
        expect(mockClient.end.calledOnce).to.be.true;
        expect(loggerMock.logMqttConnection.calledWith('disconnected')).to.be.true;
        done();
      }).catch(done);
    });
  });
});

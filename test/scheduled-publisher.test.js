/**
 * Unit tests for ScheduledPublisher
 */
const { expect } = require('chai');
const sinon = require('sinon');
const ScheduledPublisher = require('../src/scheduled-publisher');
const { config } = require('../src/config');

describe('ScheduledPublisher', () => {
    let scheduledPublisher;
    let mockMqttClient;
    let mockPublishDeviceData;
    let mockPublishGatewayStatus;
    let clock;
    let originalIntervalConfig;
    let originalDevicesConfig;

    beforeEach(() => {
        // Set up fake timers
        clock = sinon.useFakeTimers();

        // Store original config values
        originalIntervalConfig = config.mqtt.publishIntervalSeconds;
        originalDevicesConfig = config.homeAssistant.devices;

        // Reset config to default test state
        config.mqtt.publishIntervalSeconds = 10;
        config.homeAssistant.devices = new Map();

        // Create mocks
        mockMqttClient = {
            publish: sinon.stub().resolves(),
            isConnected: sinon.stub().returns(true)
        };
        mockPublishDeviceData = sinon.stub().resolves();
        mockPublishGatewayStatus = sinon.stub().resolves();

        // Create instance
        scheduledPublisher = new ScheduledPublisher(
            mockMqttClient,
            mockPublishDeviceData,
            mockPublishGatewayStatus
        );
    });

    afterEach(() => {
        scheduledPublisher.shutdown();
        clock.restore();
        
        // Restore original config values
        config.mqtt.publishIntervalSeconds = originalIntervalConfig;
        config.homeAssistant.devices = originalDevicesConfig;
        
        sinon.restore();
    });

    describe('constructor', () => {
        it('should initialize with empty state', () => {
            const state = scheduledPublisher.getState();
            expect(state.deviceCacheSize).to.equal(0);
            expect(state.seenMacsCount).to.equal(0);
            expect(state.hasScheduledPublish).to.equal(false);
            expect(state.deviceMacs).to.deep.equal([]);
            expect(state.seenMacs).to.deep.equal([]);
        });
    });

    describe('handleIncomingData - immediate publishing (interval = 0)', () => {
        beforeEach(() => {
            config.mqtt.publishIntervalSeconds = 0;
        });

        it('should publish immediately when interval is disabled', async () => {
            const devicePayloads = [
                { mac_address: 'AA:BB:CC:DD:EE:FF', rssi: -50 },
                { mac_address: 'FF:EE:DD:CC:BB:AA', rssi: -60 }
            ];
            const gatewayMetadata = { mac: 'gateway123', ip: '192.168.1.1' };
            const gatewayInfo = { version: '1.0' };

            const result = await scheduledPublisher.handleIncomingData(
                devicePayloads,
                gatewayMetadata,
                gatewayInfo
            );

            expect(result).to.equal(true);
            expect(mockPublishDeviceData.callCount).to.equal(1);
            expect(mockPublishDeviceData.firstCall.args[0]).to.deep.equal(devicePayloads);
            expect(mockPublishDeviceData.firstCall.args[1]).to.deep.equal(gatewayMetadata);
            expect(mockPublishDeviceData.firstCall.args[2]).to.deep.equal(gatewayInfo);
        });
    });

    describe('handleIncomingData - scheduled publishing (interval > 0)', () => {
        beforeEach(() => {
            config.mqtt.publishIntervalSeconds = 10;
        });

        it('should cache device data without immediate publishing when no tracked devices', async () => {
            const devicePayloads = [
                { mac_address: 'AA:BB:CC:DD:EE:FF', rssi: -50 },
                { mac_address: 'FF:EE:DD:CC:BB:AA', rssi: -60 }
            ];
            const gatewayMetadata = { mac: 'gateway123', ip: '192.168.1.1' };
            const gatewayInfo = { version: '1.0' };

            const result = await scheduledPublisher.handleIncomingData(
                devicePayloads,
                gatewayMetadata,
                gatewayInfo
            );

            expect(result).to.equal(false);
            expect(mockPublishDeviceData.callCount).to.equal(0);

            const state = scheduledPublisher.getState();
            expect(state.deviceCacheSize).to.equal(2);
            expect(state.seenMacsCount).to.equal(2);
            expect(state.deviceMacs).to.include('aa:bb:cc:dd:ee:ff'); // Should be normalized to lowercase
            expect(state.deviceMacs).to.include('ff:ee:dd:cc:bb:aa'); // Should be normalized to lowercase
        });

        it('should update existing device data with latest information', async () => {
            // First payload
            await scheduledPublisher.handleIncomingData(
                [{ mac_address: 'AA:BB:CC:DD:EE:FF', rssi: -50, timestamp: '2023-01-01T10:00:00Z' }],
                { mac: 'gateway123', ip: '192.168.1.1' },
                { version: '1.0' }
            );

            // Second payload with updated data for same device
            await scheduledPublisher.handleIncomingData(
                [{ mac_address: 'AA:BB:CC:DD:EE:FF', rssi: -45, timestamp: '2023-01-01T10:01:00Z' }],
                { mac: 'gateway123', ip: '192.168.1.1' },
                { version: '1.0' }
            );

            const state = scheduledPublisher.getState();
            expect(state.deviceCacheSize).to.equal(1);
            expect(state.seenMacsCount).to.equal(1);

            // Verify the latest data is cached
            const cachedDevices = Array.from(scheduledPublisher.deviceCache.values());
            expect(cachedDevices[0].rssi).to.equal(-45);
            expect(cachedDevices[0].timestamp).to.equal('2023-01-01T10:01:00Z');
        });

        it('should trigger immediate publish when new tracked device appears', async () => {
            // Configure a tracked device (config expects lowercase MAC)
            config.homeAssistant.devices.set('aa:bb:cc:dd:ee:ff', { name: 'Test Device' });

            // First, add some untracked devices to cache
            await scheduledPublisher.handleIncomingData(
                [{ mac_address: 'FF:EE:DD:CC:BB:AA', rssi: -60 }],
                { mac: 'gateway123', ip: '192.168.1.1' },
                { version: '1.0' }
            );
            expect(mockPublishDeviceData.callCount).to.equal(0);

            // Now send the tracked device (gateway sends uppercase)
            const result = await scheduledPublisher.handleIncomingData(
                [{ mac_address: 'AA:BB:CC:DD:EE:FF', rssi: -50 }],
                { mac: 'gateway123', ip: '192.168.1.1' },
                { version: '1.0' }
            );

            expect(result).to.equal(true);
            expect(mockPublishDeviceData.callCount).to.equal(1);

            // Should publish all cached devices (both untracked and tracked)
            const publishedDevices = mockPublishDeviceData.firstCall.args[0];
            expect(publishedDevices).to.have.length(2);
            expect(publishedDevices.some(d => d.mac_address === 'FF:EE:DD:CC:BB:AA')).to.equal(true);
            expect(publishedDevices.some(d => d.mac_address === 'AA:BB:CC:DD:EE:FF')).to.equal(true);
        });

        it('should not trigger immediate publish for already seen tracked device', async () => {
            // Configure a tracked device (config expects lowercase MAC)
            config.homeAssistant.devices.set('aa:bb:cc:dd:ee:ff', { name: 'Test Device' });

            // First payload with tracked device (gateway sends uppercase)
            const result1 = await scheduledPublisher.handleIncomingData(
                [{ mac_address: 'AA:BB:CC:DD:EE:FF', rssi: -50 }],
                { mac: 'gateway123', ip: '192.168.1.1' },
                { version: '1.0' }
            );
            expect(result1).to.equal(true);
            expect(mockPublishDeviceData.callCount).to.equal(1);

            // Reset mock
            mockPublishDeviceData.resetHistory();

            // Second payload with same tracked device should not trigger immediate publish
            const result2 = await scheduledPublisher.handleIncomingData(
                [{ mac_address: 'AA:BB:CC:DD:EE:FF', rssi: -45 }],
                { mac: 'gateway123', ip: '192.168.1.1' },
                { version: '1.0' }
            );
            expect(result2).to.equal(false);
            expect(mockPublishDeviceData.callCount).to.equal(0);
        });
    });

    describe('scheduled publishing', () => {
        beforeEach(() => {
            config.mqtt.publishIntervalSeconds = 5;
        });

        it('should initialize scheduled publishing when interval is configured', () => {
            scheduledPublisher.initialize();
            
            const state = scheduledPublisher.getState();
            expect(state.hasScheduledPublish).to.equal(true);
        });

        it('should not initialize scheduled publishing when interval is 0', () => {
            config.mqtt.publishIntervalSeconds = 0;
            scheduledPublisher.initialize();
            
            const state = scheduledPublisher.getState();
            expect(state.hasScheduledPublish).to.equal(false);
        });

        it('should perform scheduled publish with cached device data', async () => {
            // Add some devices to cache (gateway sends uppercase)
            await scheduledPublisher.handleIncomingData(
                [
                    { mac_address: 'AA:BB:CC:DD:EE:FF', rssi: -50 },
                    { mac_address: 'FF:EE:DD:CC:BB:AA', rssi: -60 }
                ],
                { mac: 'gateway123', ip: '192.168.1.1' },
                { version: '1.0' }
            );

            scheduledPublisher.initialize();

            // Fast-forward time to trigger scheduled publish
            clock.tick(5000);

            // Allow promise to resolve
            await clock.tickAsync(0);

            expect(mockPublishDeviceData.callCount).to.equal(1);
            const publishedDevices = mockPublishDeviceData.firstCall.args[0];
            expect(publishedDevices).to.have.length(2);
            expect(publishedDevices.some(d => d.mac_address === 'AA:BB:CC:DD:EE:FF')).to.equal(true);
            expect(publishedDevices.some(d => d.mac_address === 'FF:EE:DD:CC:BB:AA')).to.equal(true);
        });

        it('should publish gateway status only when no device data is cached', async () => {
            // Set gateway info without device data
            scheduledPublisher.lastGatewayInfo = { version: '1.0' };
            scheduledPublisher.initialize();

            // Fast-forward time to trigger scheduled publish
            clock.tick(5000);

            // Allow promise to resolve
            await clock.tickAsync(0);

            expect(mockPublishDeviceData.callCount).to.equal(0);
            expect(mockPublishGatewayStatus.callCount).to.equal(1);
            expect(mockPublishGatewayStatus.firstCall.args[0]).to.deep.equal({ version: '1.0' });
        });

        it('should reschedule after each publish', async () => {
            scheduledPublisher.initialize();

            // Fast-forward time to trigger first scheduled publish
            clock.tick(5000);
            await clock.tickAsync(0);

            // Should still have a scheduled publish for the next interval
            const state = scheduledPublisher.getState();
            expect(state.hasScheduledPublish).to.equal(true);

            // Fast-forward again to trigger second publish
            clock.tick(5000);
            await clock.tickAsync(0);

            // Should still be scheduled
            const state2 = scheduledPublisher.getState();
            expect(state2.hasScheduledPublish).to.equal(true);
        });

        it('should clear device cache and seen MACs after scheduled publish', async () => {
            // Add devices and mark them as seen (gateway sends uppercase)
            await scheduledPublisher.handleIncomingData(
                [
                    { mac_address: 'AA:BB:CC:DD:EE:FF', rssi: -50 },
                    { mac_address: 'FF:EE:DD:CC:BB:AA', rssi: -60 }
                ],
                { mac: 'gateway123', ip: '192.168.1.1' },
                { version: '1.0' }
            );
            
            // Verify devices are cached before publish
            const stateBefore = scheduledPublisher.getState();
            expect(stateBefore.deviceCacheSize).to.equal(2);
            expect(stateBefore.seenMacsCount).to.equal(2);

            scheduledPublisher.initialize();

            // Trigger scheduled publish
            clock.tick(5000);
            await clock.tickAsync(0);

            // Device cache and seen MACs should be cleared after publish
            const stateAfter = scheduledPublisher.getState();
            expect(stateAfter.deviceCacheSize).to.equal(0); // Cache should be empty
            expect(stateAfter.seenMacsCount).to.equal(0); // Seen MACs should be empty
            expect(stateAfter.deviceMacs).to.deep.equal([]); // No devices in cache
            expect(stateAfter.seenMacs).to.deep.equal([]); // No seen MACs
            
            // Verify publish was called with the correct data
            expect(mockPublishDeviceData.callCount).to.equal(1);
            const publishedDevices = mockPublishDeviceData.firstCall.args[0];
            expect(publishedDevices).to.have.length(2);
        });
    });

    describe('shutdown', () => {
        it('should clear timers and state when shutdown', () => {
            scheduledPublisher.initialize();
            
            // Add some data
            scheduledPublisher.deviceCache.set('test', { mac_address: 'test' });
            scheduledPublisher.seenMacsSinceLastPublish.add('test');

            scheduledPublisher.shutdown();

            const state = scheduledPublisher.getState();
            expect(state.hasScheduledPublish).to.equal(false);
            expect(state.deviceCacheSize).to.equal(0);
            expect(state.seenMacsCount).to.equal(0);
        });
    });

    describe('clearCache', () => {
        it('should clear all cached data', async () => {
            // Add some data (gateway sends uppercase)
            await scheduledPublisher.handleIncomingData(
                [{ mac_address: 'AA:BB:CC:DD:EE:FF', rssi: -50 }],
                { mac: 'gateway123', ip: '192.168.1.1' },
                { version: '1.0' }
            );
            expect(scheduledPublisher.getState().deviceCacheSize).to.equal(1);

            scheduledPublisher.clearCache();

            const state = scheduledPublisher.getState();
            expect(state.deviceCacheSize).to.equal(0);
            expect(state.seenMacsCount).to.equal(0);
        });
    });

    describe('edge cases', () => {
        it('should handle MAC address normalization correctly', async () => {
            // Test with mixed case MAC addresses (gateway sends uppercase, but test both for robustness)
            await scheduledPublisher.handleIncomingData(
                [{ mac_address: 'AA:BB:CC:DD:EE:FF', rssi: -50 }],
                { mac: 'gateway123', ip: '192.168.1.1' },
                { version: '1.0' }
            );

            await scheduledPublisher.handleIncomingData(
                [{ mac_address: 'aa:bb:cc:dd:ee:ff', rssi: -45 }],
                { mac: 'gateway123', ip: '192.168.1.1' },
                { version: '1.0' }
            );

            // Should be treated as the same device
            const state = scheduledPublisher.getState();
            expect(state.deviceCacheSize).to.equal(1);
            expect(state.deviceMacs).to.include('aa:bb:cc:dd:ee:ff'); // Should be normalized to lowercase
        });

        it('should handle multiple tracked devices in single payload', async () => {
            // Configure multiple tracked devices (config expects lowercase MAC)
            config.homeAssistant.devices.set('aa:bb:cc:dd:ee:ff', { name: 'Device 1' });
            config.homeAssistant.devices.set('ff:ee:dd:cc:bb:aa', { name: 'Device 2' });

            const result = await scheduledPublisher.handleIncomingData(
                [
                    { mac_address: 'AA:BB:CC:DD:EE:FF', rssi: -50 }, // Gateway sends uppercase
                    { mac_address: 'FF:EE:DD:CC:BB:AA', rssi: -60 }, // Gateway sends uppercase
                    { mac_address: '11:22:33:44:55:66', rssi: -70 } // untracked
                ],
                { mac: 'gateway123', ip: '192.168.1.1' },
                { version: '1.0' }
            );

            expect(result).to.equal(true);
            expect(mockPublishDeviceData.callCount).to.equal(1);
            const publishedDevices = mockPublishDeviceData.firstCall.args[0];
            expect(publishedDevices).to.have.length(3); // Should publish all devices
        });

        it('should handle rescheduling when immediate publish occurs', async () => {
            config.homeAssistant.devices.set('aa:bb:cc:dd:ee:ff', { name: 'Test Device' });
            scheduledPublisher.initialize();
            expect(scheduledPublisher.getState().hasScheduledPublish).to.equal(true);

            // Trigger immediate publish (gateway sends uppercase)
            await scheduledPublisher.handleIncomingData(
                [{ mac_address: 'AA:BB:CC:DD:EE:FF', rssi: -50 }],
                { mac: 'gateway123', ip: '192.168.1.1' },
                { version: '1.0' }
            );

            // Should still have scheduled publish after immediate publish
            expect(scheduledPublisher.getState().hasScheduledPublish).to.equal(true);
        });
    });

    describe('identifyNewTrackedDevices', () => {
        it('should return empty array when no tracked devices are configured', () => {
            config.homeAssistant.devices.clear();
            const currentMacs = new Set(['aa:bb:cc:dd:ee:ff', 'ff:ee:dd:cc:bb:aa']); // Normalized MACs
            
            const result = scheduledPublisher.identifyNewTrackedDevices(currentMacs);
            
            expect(result).to.be.an('array');
            expect(result).to.have.length(0);
        });

        it('should return empty array when no current MACs match tracked devices', () => {
            config.homeAssistant.devices.set('aa:bb:cc:dd:ee:ff', { name: 'Device 1' });
            config.homeAssistant.devices.set('ff:ee:dd:cc:bb:aa', { name: 'Device 2' });
            const currentMacs = new Set(['11:22:33:44:55:66', '77:88:99:aa:bb:cc']); // Normalized MACs
            
            const result = scheduledPublisher.identifyNewTrackedDevices(currentMacs);
            
            expect(result).to.be.an('array');
            expect(result).to.have.length(0);
        });

        it('should return all tracked devices when none have been seen before', () => {
            config.homeAssistant.devices.set('aa:bb:cc:dd:ee:ff', { name: 'Device 1' });
            config.homeAssistant.devices.set('ff:ee:dd:cc:bb:aa', { name: 'Device 2' });
            const currentMacs = new Set(['aa:bb:cc:dd:ee:ff', 'ff:ee:dd:cc:bb:aa', '11:22:33:44:55:66']); // Normalized MACs
            
            const result = scheduledPublisher.identifyNewTrackedDevices(currentMacs);
            
            expect(result).to.be.an('array');
            expect(result).to.have.length(2);
            expect(result).to.include('aa:bb:cc:dd:ee:ff');
            expect(result).to.include('ff:ee:dd:cc:bb:aa');
        });

        it('should return only new tracked devices when some have been seen before', () => {
            config.homeAssistant.devices.set('aa:bb:cc:dd:ee:ff', { name: 'Device 1' });
            config.homeAssistant.devices.set('ff:ee:dd:cc:bb:aa', { name: 'Device 2' });
            config.homeAssistant.devices.set('11:22:33:44:55:66', { name: 'Device 3' });
            
            // Mark one device as already seen
            scheduledPublisher.seenMacsSinceLastPublish.add('aa:bb:cc:dd:ee:ff');
            
            const currentMacs = new Set(['aa:bb:cc:dd:ee:ff', 'ff:ee:dd:cc:bb:aa', '77:88:99:aa:bb:cc']); // Normalized MACs
            
            const result = scheduledPublisher.identifyNewTrackedDevices(currentMacs);
            
            expect(result).to.be.an('array');
            expect(result).to.have.length(1);
            expect(result).to.include('ff:ee:dd:cc:bb:aa');
            expect(result).to.not.include('aa:bb:cc:dd:ee:ff'); // Already seen
            expect(result).to.not.include('77:88:99:aa:bb:cc'); // Not tracked
        });

        it('should return empty array when all tracked devices have been seen', () => {
            config.homeAssistant.devices.set('aa:bb:cc:dd:ee:ff', { name: 'Device 1' });
            config.homeAssistant.devices.set('ff:ee:dd:cc:bb:aa', { name: 'Device 2' });
            
            // Mark both devices as already seen
            scheduledPublisher.seenMacsSinceLastPublish.add('aa:bb:cc:dd:ee:ff');
            scheduledPublisher.seenMacsSinceLastPublish.add('ff:ee:dd:cc:bb:aa');
            
            const currentMacs = new Set(['aa:bb:cc:dd:ee:ff', 'ff:ee:dd:cc:bb:aa', '11:22:33:44:55:66']); // Normalized MACs
            
            const result = scheduledPublisher.identifyNewTrackedDevices(currentMacs);
            
            expect(result).to.be.an('array');
            expect(result).to.have.length(0);
        });

        it('should handle empty current MACs set', () => {
            config.homeAssistant.devices.set('aa:bb:cc:dd:ee:ff', { name: 'Device 1' });
            const currentMacs = new Set();
            
            const result = scheduledPublisher.identifyNewTrackedDevices(currentMacs);
            
            expect(result).to.be.an('array');
            expect(result).to.have.length(0);
        });

        it('should handle case sensitivity correctly - MACs are normalized before this method', () => {
            // Config uses lowercase (as per real configuration)
            config.homeAssistant.devices.set('aa:bb:cc:dd:ee:ff', { name: 'Device 1' });
            
            // Current MACs are already normalized to lowercase when this method is called
            const currentMacs = new Set(['aa:bb:cc:dd:ee:ff']); // Normalized MAC
            
            const result = scheduledPublisher.identifyNewTrackedDevices(currentMacs);
            
            expect(result).to.be.an('array');
            expect(result).to.have.length(1);
            expect(result).to.include('aa:bb:cc:dd:ee:ff');
        });

        it('should handle multiple new tracked devices in single call', () => {
            config.homeAssistant.devices.set('aa:bb:cc:dd:ee:ff', { name: 'Device 1' });
            config.homeAssistant.devices.set('ff:ee:dd:cc:bb:aa', { name: 'Device 2' });
            config.homeAssistant.devices.set('11:22:33:44:55:66', { name: 'Device 3' });
            config.homeAssistant.devices.set('77:88:99:aa:bb:cc', { name: 'Device 4' });
            
            // Mark some devices as seen
            scheduledPublisher.seenMacsSinceLastPublish.add('aa:bb:cc:dd:ee:ff');
            scheduledPublisher.seenMacsSinceLastPublish.add('77:88:99:aa:bb:cc');
            
            const currentMacs = new Set([
                'aa:bb:cc:dd:ee:ff', // Tracked, already seen
                'ff:ee:dd:cc:bb:aa', // Tracked, new
                '11:22:33:44:55:66', // Tracked, new
                '77:88:99:aa:bb:cc', // Tracked, already seen
                'dd:dd:dd:dd:dd:dd'  // Not tracked
            ]); // All normalized MACs
            
            const result = scheduledPublisher.identifyNewTrackedDevices(currentMacs);
            
            expect(result).to.be.an('array');
            expect(result).to.have.length(2);
            expect(result).to.include('ff:ee:dd:cc:bb:aa');
            expect(result).to.include('11:22:33:44:55:66');
            expect(result).to.not.include('aa:bb:cc:dd:ee:ff');
            expect(result).to.not.include('77:88:99:aa:bb:cc');
            expect(result).to.not.include('dd:dd:dd:dd:dd:dd');
        });
    });

    describe('realistic gateway data', () => {
        it('should handle realistic gateway MAC address format in end-to-end scenario', async () => {
            // Configure tracked device (config expects lowercase)
            config.homeAssistant.devices.set('4d:fb:56:9a:c3:30', { name: 'Real BLE Device' });

            // Simulate realistic gateway payload (uppercase MAC as provided by gateway)
            const realisticDevicePayload = {
                "mac_address": "4D:FB:56:9A:C3:30",
                "rssi": -87,
                "advertising_type_code": 0,
                "advertising_type_description": "Connectable undirected advertisement",
                "advertisement_data_hex": "11162CFE004004510D0221D1D6464564899F020AF8",
                "last_seen_timestamp": "2025-06-23T03:38:47.408Z"
            };

            // First call should trigger immediate publish since it's a new tracked device
            const result1 = await scheduledPublisher.handleIncomingData(
                [realisticDevicePayload],
                { mac: 'gateway123', ip: '192.168.1.1' },
                { version: '1.0' }
            );

            expect(result1).to.equal(true);
            expect(mockPublishDeviceData.callCount).to.equal(1);

            // Check that the device was cached with normalized MAC
            const state = scheduledPublisher.getState();
            expect(state.deviceCacheSize).to.equal(1);
            expect(state.deviceMacs).to.include('4d:fb:56:9a:c3:30'); // Should be normalized to lowercase
            expect(state.seenMacs).to.include('4d:fb:56:9a:c3:30'); // Should be normalized to lowercase

            // Reset mock for second test
            mockPublishDeviceData.resetHistory();

            // Second call with same device should NOT trigger immediate publish (already seen)
            const result2 = await scheduledPublisher.handleIncomingData(
                [realisticDevicePayload],
                { mac: 'gateway123', ip: '192.168.1.1' },
                { version: '1.0' }
            );

            expect(result2).to.equal(false);
            expect(mockPublishDeviceData.callCount).to.equal(0);
        });
    });
});
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
    let originalCacheRetentionConfig;

    beforeEach(() => {
        // Set up fake timers
        clock = sinon.useFakeTimers();

        // Store original config values
        originalIntervalConfig = config.mqtt.publishIntervalSeconds;
        originalDevicesConfig = config.homeAssistant.devices;
        originalCacheRetentionConfig = config.mqtt.deviceCacheRetentionSeconds;

        // Reset config to default test state
        config.mqtt.publishIntervalSeconds = 10;
        config.mqtt.deviceCacheRetentionSeconds = 300;
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
        config.mqtt.deviceCacheRetentionSeconds = originalCacheRetentionConfig;
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
            expect(state.deviceMacs).to.include('aabbccddeeff'); // Should be normalized to lowercase without colons
            expect(state.deviceMacs).to.include('ffeeddccbbaa'); // Should be normalized to lowercase without colons
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
            const cachedDevices = Array.from(scheduledPublisher.deviceCache.values()).map(entry => entry.data);
            expect(cachedDevices[0].rssi).to.equal(-45);
            expect(cachedDevices[0].timestamp).to.equal('2023-01-01T10:01:00Z');
        });

        it('should trigger immediate publish when new tracked device is added to cache', async () => {
            // Configure a tracked device (config expects normalized lowercase MAC without colons)
            config.homeAssistant.devices.set('aabbccddeeff', { name: 'Test Device' });

            // First, add some untracked devices to cache
            await scheduledPublisher.handleIncomingData(
                [{ mac_address: 'FF:EE:DD:CC:BB:AA', rssi: -60 }],
                { mac: 'gateway123', ip: '192.168.1.1' },
                { version: '1.0' }
            );
            expect(mockPublishDeviceData.callCount).to.equal(0);

            // Now send the tracked device - should trigger immediate publish since it's new to cache
            const result = await scheduledPublisher.handleIncomingData(
                [{ mac_address: 'AA:BB:CC:DD:EE:FF', rssi: -50 }],
                { mac: 'gateway123', ip: '192.168.1.1' },
                { version: '1.0' }
            );

            expect(result).to.equal(true);
            expect(mockPublishDeviceData.callCount).to.equal(1);

            // Should publish all cached devices
            const publishedDevices = mockPublishDeviceData.firstCall.args[0];
            expect(publishedDevices).to.have.length(2);
            expect(publishedDevices.some(d => d.mac_address === 'FF:EE:DD:CC:BB:AA')).to.equal(true);
            expect(publishedDevices.some(d => d.mac_address === 'AA:BB:CC:DD:EE:FF')).to.equal(true);
        });

        it('should not trigger immediate publish for already cached tracked device', async () => {
            // Configure a tracked device (config expects normalized lowercase MAC without colons)
            config.homeAssistant.devices.set('aabbccddeeff', { name: 'Test Device' });

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

        it('should keep device cache but clear seen MACs after scheduled publish', async () => {
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

            // Device cache should be retained, but seen MACs should be cleared after publish
            const stateAfter = scheduledPublisher.getState();
            expect(stateAfter.deviceCacheSize).to.equal(2); // Cache should be retained
            expect(stateAfter.seenMacsCount).to.equal(0); // Seen MACs should be empty
            expect(stateAfter.deviceMacs).to.have.length(2); // Devices still in cache
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
            expect(state.deviceMacs).to.include('aabbccddeeff'); // Should be normalized to lowercase without colons
        });

        it('should handle multiple tracked devices in single payload', async () => {
            // Configure multiple tracked devices (config expects normalized lowercase MAC without colons)
            config.homeAssistant.devices.set('aabbccddeeff', { name: 'Device 1' });
            config.homeAssistant.devices.set('ffeeddccbbaa', { name: 'Device 2' });

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
            config.homeAssistant.devices.set('aabbccddeeff', { name: 'Test Device' });
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

    describe('cache behavior validation', () => {
        it('should correctly identify when devices are new to cache', async () => {
            config.homeAssistant.devices.set('aabbccddeeff', { name: 'Test Device' });
            
            // Device not in cache yet
            expect(scheduledPublisher.deviceCache.has('aabbccddeeff')).to.equal(false);
            
            // Add device - should be considered new
            const result = await scheduledPublisher.handleIncomingData(
                [{ mac_address: 'AA:BB:CC:DD:EE:FF', rssi: -50 }],
                { mac: 'gateway123', ip: '192.168.1.1' },
                { version: '1.0' }
            );
            
            expect(result).to.equal(true); // Should trigger immediate publish
            expect(scheduledPublisher.deviceCache.has('aabbccddeeff')).to.equal(true);
        });

        it('should correctly identify when devices are already in cache', async () => {
            config.homeAssistant.devices.set('aabbccddeeff', { name: 'Test Device' });
            
            // First add
            await scheduledPublisher.handleIncomingData(
                [{ mac_address: 'AA:BB:CC:DD:EE:FF', rssi: -50 }],
                { mac: 'gateway123', ip: '192.168.1.1' },
                { version: '1.0' }
            );
            
            // Reset mock
            mockPublishDeviceData.resetHistory();
            
            // Second add - should not trigger immediate publish
            const result = await scheduledPublisher.handleIncomingData(
                [{ mac_address: 'AA:BB:CC:DD:EE:FF', rssi: -45 }],
                { mac: 'gateway123', ip: '192.168.1.1' },
                { version: '1.0' }
            );
            
            expect(result).to.equal(false); // Should not trigger immediate publish
            expect(mockPublishDeviceData.callCount).to.equal(0);
        });
    });

    describe('realistic gateway data', () => {
        it('should handle realistic gateway MAC address format in end-to-end scenario', async () => {
            // Configure tracked device (config expects lowercase)
            config.homeAssistant.devices.set('4dfb569ac330', { name: 'Real BLE Device' });

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
            expect(state.deviceMacs).to.include('4dfb569ac330'); // Should be normalized to lowercase without colons
            expect(state.seenMacs).to.include('4dfb569ac330'); // Should be normalized to lowercase without colons

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

    describe('device cache TTL management', () => {
        beforeEach(() => {
            config.mqtt.publishIntervalSeconds = 300; // 5 minutes to avoid interference in these tests
            config.mqtt.deviceCacheRetentionSeconds = 60; // 60 seconds for testing
            
            // Create new instance to pick up the config change
            scheduledPublisher.shutdown();
            scheduledPublisher = new ScheduledPublisher(
                mockMqttClient,
                mockPublishDeviceData,
                mockPublishGatewayStatus
            );
        });

        it('should trigger immediate publish for tracked device when first added to cache', async () => {
            // Configure a tracked device
            config.homeAssistant.devices.set('aabbccddeeff', { name: 'Test Device' });

            const result = await scheduledPublisher.handleIncomingData(
                [{ mac_address: 'AA:BB:CC:DD:EE:FF', rssi: -50 }],
                { mac: 'gateway123', ip: '192.168.1.1' },
                { version: '1.0' }
            );

            // First appearance should trigger immediate publish since it's new to cache
            expect(result).to.equal(true);
            expect(mockPublishDeviceData.callCount).to.equal(1);

            const state = scheduledPublisher.getState();
            expect(state.deviceCacheSize).to.equal(1);
        });

        it('should not trigger immediate publish for tracked device already in cache', async () => {
            // Configure a tracked device
            config.homeAssistant.devices.set('aabbccddeeff', { name: 'Test Device' });

            // First appearance - will trigger immediate publish since it's new to cache
            const result1 = await scheduledPublisher.handleIncomingData(
                [{ mac_address: 'AA:BB:CC:DD:EE:FF', rssi: -50 }],
                { mac: 'gateway123', ip: '192.168.1.1' },
                { version: '1.0' }
            );
            expect(result1).to.equal(true);

            // Verify device is in cache
            expect(scheduledPublisher.deviceCache.has('aabbccddeeff')).to.equal(true);

            // Reset mock
            mockPublishDeviceData.resetHistory();

            // Advance time by 5 seconds (less than 10 second publish interval)
            clock.tick(5000);

            // Second appearance should not trigger immediate publish (device still in cache)
            const result2 = await scheduledPublisher.handleIncomingData(
                [{ mac_address: 'AA:BB:CC:DD:EE:FF', rssi: -45 }],
                { mac: 'gateway123', ip: '192.168.1.1' },
                { version: '1.0' }
            );

            expect(result2).to.equal(false);
            expect(mockPublishDeviceData.callCount).to.equal(0);
        });

        it('should trigger immediate publish when tracked device is re-added after TTL expiry', async () => {
            // Configure a tracked device
            config.homeAssistant.devices.set('aabbccddeeff', { name: 'Test Device' });

            // First appearance - will trigger immediate publish
            await scheduledPublisher.handleIncomingData(
                [{ mac_address: 'AA:BB:CC:DD:EE:FF', rssi: -50 }],
                { mac: 'gateway123', ip: '192.168.1.1' },
                { version: '1.0' }
            );

            // Reset mock
            mockPublishDeviceData.resetHistory();

            // Advance time by 65 seconds (more than 60 second TTL)
            clock.tick(65000);

            // Clean up expired devices (this would normally happen on scheduled publish)
            const now = clock.now;
            scheduledPublisher.cleanupExpiredDevices(now);

            // Device reappears after being cleaned up - should trigger immediate publish
            const result = await scheduledPublisher.handleIncomingData(
                [{ mac_address: 'AA:BB:CC:DD:EE:FF', rssi: -45 }],
                { mac: 'gateway123', ip: '192.168.1.1' },
                { version: '1.0' }
            );

            expect(result).to.equal(true);
            expect(mockPublishDeviceData.callCount).to.equal(1);
        });

        it('should clean up expired devices from cache based on TTL', async () => {
            // Record the start time
            const startTime = clock.now;
            
            // Add some devices to cache
            await scheduledPublisher.handleIncomingData(
                [
                    { mac_address: 'AA:BB:CC:DD:EE:FF', rssi: -50 },
                    { mac_address: 'FF:EE:DD:CC:BB:AA', rssi: -60 }
                ],
                { mac: 'gateway123', ip: '192.168.1.1' },
                { version: '1.0' }
            );

            expect(scheduledPublisher.getState().deviceCacheSize).to.equal(2);
            
            // Check TTL values
            const cacheEntries = Array.from(scheduledPublisher.deviceCache.values());
            const firstTTL = cacheEntries[0].ttl;
            const expectedTTL = startTime + (60 * 1000); // 60 seconds from start
            
            // Advance time beyond cache retention period (60 seconds in this test)
            clock.tick(65000);
            
            // Verify the time has advanced
            const currentTime = clock.now;
            expect(currentTime - startTime).to.equal(65000);
            expect(currentTime).to.be.greaterThan(firstTTL);

            // Trigger cleanup by calling cleanupExpiredDevices
            const cleanupResult = scheduledPublisher.cleanupExpiredDevices(currentTime);

            expect(cleanupResult.expiredCount).to.equal(2);
            expect(cleanupResult.remainingCount).to.equal(0);
            expect(scheduledPublisher.getState().deviceCacheSize).to.equal(0);
        });

        it('should update TTL when device is seen again', async () => {
            // Add device to cache
            await scheduledPublisher.handleIncomingData(
                [{ mac_address: 'AA:BB:CC:DD:EE:FF', rssi: -50 }],
                { mac: 'gateway123', ip: '192.168.1.1' },
                { version: '1.0' }
            );

            // Advance time by 30 seconds
            clock.tick(30000);

            // See device again - should update TTL
            await scheduledPublisher.handleIncomingData(
                [{ mac_address: 'AA:BB:CC:DD:EE:FF', rssi: -45 }],
                { mac: 'gateway123', ip: '192.168.1.1' },
                { version: '1.0' }
            );

            // Advance time by another 40 seconds (total 70 seconds from first seen, 40 from last update)
            clock.tick(40000);

            // Device should still be in cache because TTL was updated
            const now = Date.now();
            const cleanupResult = scheduledPublisher.cleanupExpiredDevices(now);

            expect(cleanupResult.expiredCount).to.equal(0);
            expect(cleanupResult.remainingCount).to.equal(1);
            expect(scheduledPublisher.getState().deviceCacheSize).to.equal(1);
        });

        it('should log cleanup statistics during scheduled publish', async () => {
            // Configure shorter intervals for this test
            config.mqtt.publishIntervalSeconds = 10;
            
            // Create new instance to pick up the config change
            scheduledPublisher.shutdown();
            scheduledPublisher = new ScheduledPublisher(
                mockMqttClient,
                mockPublishDeviceData,
                mockPublishGatewayStatus
            );
            
            // Add devices to cache
            await scheduledPublisher.handleIncomingData(
                [
                    { mac_address: 'AA:BB:CC:DD:EE:FF', rssi: -50 },
                    { mac_address: 'FF:EE:DD:CC:BB:AA', rssi: -60 }
                ],
                { mac: 'gateway123', ip: '192.168.1.1' },
                { version: '1.0' }
            );

            // Advance time to make the devices expire
            clock.tick(65000); // More than 60 seconds

            // Add a fresh device (won't trigger immediate publish as it's not tracked)
            await scheduledPublisher.handleIncomingData(
                [{ mac_address: '11:22:33:44:55:66', rssi: -70 }],
                { mac: 'gateway123', ip: '192.168.1.1' },
                { version: '1.0' }
            );

            // Reset mock to capture only the scheduled publish
            mockPublishDeviceData.resetHistory();

            scheduledPublisher.initialize();

            // Trigger scheduled publish
            clock.tick(10000);
            await clock.tickAsync(0);

            // Should have published only the fresh device that wasn't expired
            expect(mockPublishDeviceData.callCount).to.equal(1);
            const publishedDevices = mockPublishDeviceData.firstCall.args[0];
            expect(publishedDevices).to.have.length(1);
            expect(publishedDevices[0].mac_address).to.equal('11:22:33:44:55:66');
        });

        it('should handle multiple tracked devices being added at different times', async () => {
            // Configure multiple tracked devices
            config.homeAssistant.devices.set('aabbccddeeff', { name: 'Device 1' });
            config.homeAssistant.devices.set('ffeeddccbbaa', { name: 'Device 2' });

            // First appearance of device 1 - should trigger immediate publish
            const result1 = await scheduledPublisher.handleIncomingData(
                [{ mac_address: 'AA:BB:CC:DD:EE:FF', rssi: -50 }],
                { mac: 'gateway123', ip: '192.168.1.1' },
                { version: '1.0' }
            );
            expect(result1).to.equal(true);
            expect(mockPublishDeviceData.callCount).to.equal(1);

            // Reset mock
            mockPublishDeviceData.resetHistory();

            // Add device 2 later - should trigger immediate publish since it's new to cache
            const result2 = await scheduledPublisher.handleIncomingData(
                [{ mac_address: 'FF:EE:DD:CC:BB:AA', rssi: -60 }],
                { mac: 'gateway123', ip: '192.168.1.1' },
                { version: '1.0' }
            );
            expect(result2).to.equal(true);
            expect(mockPublishDeviceData.callCount).to.equal(1);

            // Should publish all cached devices
            const publishedDevices = mockPublishDeviceData.firstCall.args[0];
            expect(publishedDevices).to.have.length(2);
        });

        it('should use configured cache retention time for TTL management', async () => {
            // Set a custom cache retention time
            config.mqtt.deviceCacheRetentionSeconds = 30; // 30 seconds
            
            // Create new instance to pick up the config change
            scheduledPublisher.shutdown();
            scheduledPublisher = new ScheduledPublisher(
                mockMqttClient,
                mockPublishDeviceData,
                mockPublishGatewayStatus
            );

            // Configure a tracked device
            config.homeAssistant.devices.set('aabbccddeeff', { name: 'Test Device' });

            // First appearance - should trigger immediate publish
            const result1 = await scheduledPublisher.handleIncomingData(
                [{ mac_address: 'AA:BB:CC:DD:EE:FF', rssi: -50 }],
                { mac: 'gateway123', ip: '192.168.1.1' },
                { version: '1.0' }
            );
            expect(result1).to.equal(true);
            expect(mockPublishDeviceData.callCount).to.equal(1);

            // Reset mock
            mockPublishDeviceData.resetHistory();

            // Advance time by 35 seconds (more than 30 second TTL)
            clock.tick(35000);

            // Clean up expired devices
            const now = clock.now;
            scheduledPublisher.cleanupExpiredDevices(now);

            // Device reappears after cleanup - should trigger immediate publish
            const result2 = await scheduledPublisher.handleIncomingData(
                [{ mac_address: 'AA:BB:CC:DD:EE:FF', rssi: -45 }],
                { mac: 'gateway123', ip: '192.168.1.1' },
                { version: '1.0' }
            );

            expect(result2).to.equal(true);
            expect(mockPublishDeviceData.callCount).to.equal(1);
        });
    });

    // ...existing code...
});
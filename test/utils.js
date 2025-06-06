/**
 * Test Utilities
 * Helper functions and mock data for testing
 */

const msgpack = require('msgpack5')();

/**
 * Create mock BLE gateway data for testing
 * @param {Object} overrides - Properties to override in the default data
 * @returns {Object} Mock gateway data structure
 */
function createMockGatewayData(overrides = {}) {
    const defaultData = {
        v: '1.5.0',
        mid: 12345,
        time: Math.floor(Date.now() / 1000),
        ip: '192.168.1.100',
        mac: '12:34:56:78:9A:BC',
        rssi: -45,
        devices: [
            // Mock BLE device advertising data (20 bytes)
            Buffer.from([
                0x00, // Advertising type
                0x11, 0x22, 0x33, 0x44, 0x55, 0x66, // MAC address (6 bytes)
                0xC0, // RSSI (-64 dBm when adjusted)
                0x02, 0x01, 0x06, // Advertisement data (3 bytes)
                0x03, 0x02, 0x0F, 0x18, // More ad data
                0x05, 0x09, 0x54, 0x65, 0x73, 0x74 // Device name "Test"
            ]),
            Buffer.from([
                0x01, // Different advertising type
                0x66, 0x55, 0x44, 0x33, 0x22, 0x11, // Different MAC
                0xB0, // RSSI (-80 dBm when adjusted)
                0x02, 0x01, 0x1A, // Advertisement data
                0x03, 0x03, 0x12, 0x18, // Service UUID
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00 // Padding
            ])
        ]
    };

    // Handle deviceCount parameter
    if (overrides.deviceCount !== undefined) {
        const deviceCount = overrides.deviceCount;
        if (deviceCount === 0) {
            defaultData.devices = [];
        } else if (deviceCount > defaultData.devices.length) {
            // Add more devices if needed
            const additionalDevices = deviceCount - defaultData.devices.length;
            for (let i = 0; i < additionalDevices; i++) {
                defaultData.devices.push(Buffer.from([
                    0x02, // Different advertising type
                    0xAA + i, 0xBB + i, 0xCC + i, 0xDD + i, 0xEE + i, 0xFF, // Different MAC
                    0xA0 + i, // Different RSSI
                    0x02, 0x01, 0x1E, // Advertisement data
                    0x03, 0x03, 0x20 + i, 0x18, // Different service UUID
                    0x00, 0x00, 0x00, 0x00, 0x00, 0x00 // Padding
                ]));
            }
        } else if (deviceCount < defaultData.devices.length) {
            // Reduce devices if needed
            defaultData.devices = defaultData.devices.slice(0, deviceCount);
        }
        delete overrides.deviceCount; // Remove from overrides so it doesn't override the devices array
    }

    // Handle includeOptionalFields parameter
    if (overrides.includeOptionalFields) {
        defaultData.iccid = '1234567890123456789';
        delete overrides.includeOptionalFields; // Remove from overrides
    }

    return { ...defaultData, ...overrides };
}

/**
 * Create encoded MessagePack data for testing
 * @param {Object} data - Data to encode
 * @returns {Buffer} Encoded MessagePack data
 */
function createMockMessagePackData(data) {
    return msgpack.encode(data || createMockGatewayData());
}

/**
 * Create mock environment variables for testing
 * @returns {Object} Mock environment configuration
 */
function createMockEnvConfig() {
    return {
        SERVER_PORT: '9000',
        MQTT_BROKER_URL: 'mqtt://test.mosquitto.org:1883',
        MQTT_USERNAME: 'testuser',
        MQTT_PASSWORD: 'testpass',
        MQTT_TOPIC_PREFIX: '/test/ble/',
        MQTT_QOS: '1',
        MQTT_RETAIN: 'false',
        LOG_LEVEL: 'debug'
    };
}

/**
 * Clean up environment variables after tests
 * @param {Object} originalEnv - Original environment to restore
 */
function restoreEnvironment(originalEnv) {
    // Clear all test-related env vars
    const testVars = [
        'SERVER_PORT', 'MQTT_BROKER_URL', 'MQTT_USERNAME', 
        'MQTT_PASSWORD', 'MQTT_TOPIC_PREFIX', 'MQTT_QOS', 
        'MQTT_RETAIN', 'LOG_LEVEL'
    ];
    
    testVars.forEach(varName => {
        delete process.env[varName];
    });
    
    // Restore original values
    Object.assign(process.env, originalEnv);
}

/**
 * Clear require cache for modules
 * @param {string[]} modules - Module paths to clear from cache
 */
function clearRequireCache(modules) {
    modules.forEach(modulePath => {
        delete require.cache[require.resolve(modulePath)];
    });
}

module.exports = {
    createMockGatewayData,
    createMockMessagePackData,
    createMockEnvConfig,
    restoreEnvironment,
    clearRequireCache
};

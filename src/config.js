/**
 * Configuration Management Module
 * Reads configuration from environment variables with .env file support
 */

// Load environment variables from .env file (if it exists)
// Environment variables will always override .env values
// Skip dotenv in test environment to allow proper test isolation
if (process.env.NODE_ENV !== 'test') {
    require('dotenv').config();
}

/**
 * Configuration object with all required parameters
 */
const config = {
    // HTTP Server Configuration
    server: {
        port: parseInt(process.env.SERVER_PORT) || 8000,
    },

    // MQTT Broker Configuration
    mqtt: {
        brokerUrl: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
        username: process.env.MQTT_USERNAME || '',
        password: process.env.MQTT_PASSWORD || '',
        topicPrefix: process.env.MQTT_TOPIC_PREFIX || '/blegateways/aprilbrother/',
        qos: parseInt(process.env.MQTT_QOS) || 1,
        retain: process.env.MQTT_RETAIN === 'true' || false,
    },

    // Logging Configuration
    logging: {
        level: process.env.LOG_LEVEL || 'info',
    },

    // Home Assistant Integration Configuration
    homeAssistant: {
        enabled: process.env.HA_ENABLED === 'true' || false,
        discoveryTopicPrefix: process.env.HA_DISCOVERY_TOPIC_PREFIX || 'homeassistant',
        devices: parseHomeAssistantDevices(),
    },
};

/**
 * Parse Home Assistant BLE device environment variables
 * Format: HA_BLE_DEVICE_1=123b6a1b85ef,Car Token
 * 
 * @returns {Map<string, {name: string}>} Map of devices with MAC (no colons) as key and name as value
 */
function parseHomeAssistantDevices() {
    const deviceMap = new Map();
    
    if (process.env.NODE_ENV === 'test') {
        return deviceMap; // Skip in test environment unless tests specifically set env vars
    }
    
    let index = 1;
    let deviceEnvVar = process.env[`HA_BLE_DEVICE_${index}`];
    
    while (deviceEnvVar && index <= 100) { // Set a reasonable upper limit
        try {
            const [mac, name] = deviceEnvVar.split(',').map(part => part.trim());
            
            if (!mac || !name) {
                throw new Error(`Invalid format for HA_BLE_DEVICE_${index}: ${deviceEnvVar}. Expected format: "MAC,Name"`);
            }
            
            // Basic MAC validation (without colons)
            if (!/^[0-9a-fA-F]{12}$/.test(mac)) {
                throw new Error(`Invalid MAC address format in HA_BLE_DEVICE_${index}: ${mac}. Expected 12 hex characters without colons.`);
            }
            
            deviceMap.set(mac.toLowerCase(), { name });
            
        } catch (error) {
            console.error(`Error parsing HA_BLE_DEVICE_${index}: ${error.message}`);
        }
        
        index++;
        deviceEnvVar = process.env[`HA_BLE_DEVICE_${index}`];
    }
    
    return deviceMap;
}

/**
 * Validate configuration and log warnings for missing required values
 */
function validateConfig() {
    const warnings = [];
    
    if (!process.env.MQTT_BROKER_URL) {
        warnings.push('MQTT_BROKER_URL not set, using default: mqtt://localhost:1883');
    }
    
    if (!process.env.MQTT_TOPIC_PREFIX) {
        warnings.push('MQTT_TOPIC_PREFIX not set, using default: /blegateways/aprilbrother/');
    }

    if (config.homeAssistant.enabled) {
        if (config.homeAssistant.devices.size === 0) {
            warnings.push('HA_ENABLED is true but no HA_BLE_DEVICE_X variables were found or valid');
        }
    }

    return warnings;
}

/**
 * Get configuration value by path (e.g., 'server.port', 'mqtt.brokerUrl')
 */
function get(path) {
    return path.split('.').reduce((obj, key) => obj && obj[key], config);
}

/**
 * Log configuration status
 */
function logConfigStatus() {
    console.log('Configuration loaded:');
    console.log(`  Server Port: ${config.server.port}`);
    console.log(`  MQTT Broker: ${config.mqtt.brokerUrl}`);
    console.log(`  MQTT Topic Prefix: ${config.mqtt.topicPrefix}`);
    console.log(`  Log Level: ${config.logging.level}`);
    
    // Home Assistant configuration logging
    if (config.homeAssistant.enabled) {
        console.log('Home Assistant Integration:');
        console.log(`  Discovery Topic Prefix: ${config.homeAssistant.discoveryTopicPrefix}`);
        console.log(`  Configured Devices: ${config.homeAssistant.devices.size}`);
        
        if (config.homeAssistant.devices.size > 0) {
            console.log('  Devices:');
            config.homeAssistant.devices.forEach((device, mac) => {
                console.log(`    - ${device.name} (${mac})`);
            });
        }
    } else {
        console.log('Home Assistant Integration: Disabled');
    }
    
    const warnings = validateConfig();
    if (warnings.length > 0) {
        console.warn('Configuration warnings:');
        warnings.forEach(warning => console.warn(`  - ${warning}`));
    }
}

module.exports = {
    config,
    get,
    validateConfig,
    logConfigStatus,
};

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
        host: process.env.SERVER_HOST || '0.0.0.0', // Bind to all interfaces by default
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
        gatewayName: process.env.HA_GATEWAY_NAME || 'April Brother BLE Gateway'
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
    
    // In test environment, don't automatically skip parsing
    // Tests will explicitly set process.env.HA_BLE_DEVICE_X values if needed
    
    // Check for environment variables with pattern HA_BLE_DEVICE_X
    // where X is any number (non-sequential numbers are allowed)
    const deviceVarPattern = /^HA_BLE_DEVICE_(\d+)$/;
    const deviceVars = Object.keys(process.env)
        .filter(key => deviceVarPattern.test(key))
        .sort((a, b) => {
            const numA = parseInt(a.match(deviceVarPattern)[1]);
            const numB = parseInt(b.match(deviceVarPattern)[1]);
            return numA - numB;
        });
    
    for (const deviceVar of deviceVars) {
        try {
            const deviceEnvVar = process.env[deviceVar];
            const [mac, name] = deviceEnvVar.split(',').map(part => part.trim());
            
            if (!mac || !name) {
                throw new Error(`Invalid format for ${deviceVar}: ${deviceEnvVar}. Expected format: "MAC,Name"`);
            }
            
            // Remove colons if present
            const macWithoutColons = mac.replace(/:/g, '');
            
            // Basic MAC validation (without colons)
            if (!/^[0-9a-fA-F]{12}$/.test(macWithoutColons)) {
                throw new Error(`Invalid MAC address format in ${deviceVar}: ${mac}. Expected 12 hex characters with or without colons.`);
            }
            
            deviceMap.set(macWithoutColons.toLowerCase(), { name });
            
        } catch (error) {
            try {
                // Lazy load logger to avoid circular dependency
                const logger = require('./logger');
                if (logger.error) {
                    logger.error(`Error parsing ${deviceVar}: ${error.message}`);
                } else {
                    console.error(`Error parsing ${deviceVar}: ${error.message}`);
                }
            } catch (loggerError) {
                console.error(`Error parsing ${deviceVar}: ${error.message}`);
            }
        }
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
            warnings.push('HA_ENABLED is true but no HA_BLE_DEVICE_X variables were found');
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
    try {
        // Lazy load logger to avoid circular dependency
        const logger = require('./logger');
        const log = logger.info ? logger : console;
        
        log.info('Configuration loaded:');
        log.info(`  Server Port: ${config.server.port}`);
        log.info(`  MQTT Broker: ${config.mqtt.brokerUrl}`);
        log.info(`  MQTT Topic Prefix: ${config.mqtt.topicPrefix}`);
        log.info(`  Log Level: ${config.logging.level}`);
    
        // Home Assistant configuration logging
        if (config.homeAssistant.enabled) {
            log.info('Home Assistant Integration:');
            log.info(`  Discovery Topic Prefix: ${config.homeAssistant.discoveryTopicPrefix}`);
            log.info(`  Gateway Name: ${config.homeAssistant.gatewayName}`);
            log.info(`  Configured BLE Devices: ${config.homeAssistant.devices.size}`);
            
            if (config.homeAssistant.devices.size > 0) {
                log.info('  BLE Devices:');
                config.homeAssistant.devices.forEach((device, mac) => {
                    log.info(`    - ${device.name} (${mac})`);
                });
            }
        } else {
            log.info('Home Assistant Integration: Disabled');
        }
        
        const warnings = validateConfig();
        if (warnings.length > 0) {
            const warn = logger.warn ? logger.warn : console.warn;
            warn('Configuration warnings:');
            warnings.forEach(warning => warn(`  - ${warning}`));
        }
    } catch (loggerError) {
        // Fallback to console if logger is not available
        console.info('Configuration loaded:');
        console.info(`  Server Port: ${config.server.port}`);
        console.info(`  MQTT Broker: ${config.mqtt.brokerUrl}`);
        console.info(`  MQTT Topic Prefix: ${config.mqtt.topicPrefix}`);
        console.info(`  Log Level: ${config.logging.level}`);
        
        if (config.homeAssistant.enabled) {
            console.info('Home Assistant Integration:');
            console.info(`  Discovery Topic Prefix: ${config.homeAssistant.discoveryTopicPrefix}`);
            console.info(`  Gateway Name: ${config.homeAssistant.gatewayName}`);
            console.info(`  Configured BLE Devices: ${config.homeAssistant.devices.size}`);
        } else {
            console.info('Home Assistant Integration: Disabled');
        }
        
        const warnings = validateConfig();
        if (warnings.length > 0) {
            console.warn('Configuration warnings:');
            warnings.forEach(warning => console.warn(`  - ${warning}`));
        }
    }
}

module.exports = {
    config,
    get,
    validateConfig,
    logConfigStatus,
};

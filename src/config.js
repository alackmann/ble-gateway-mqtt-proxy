/**
 * Configuration Management Module
 * Reads configuration from environment variables with .env file support
 */

// Load environment variables from .env file (if it exists)
// Environment variables will always override .env values
require('dotenv').config();

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
        topicPrefix: process.env.MQTT_TOPIC_PREFIX || '/blegateways/aprilbrother/device/',
        qos: parseInt(process.env.MQTT_QOS) || 1,
        retain: process.env.MQTT_RETAIN === 'true' || false,
    },

    // Logging Configuration
    logging: {
        level: process.env.LOG_LEVEL || 'info',
    },
};

/**
 * Validate configuration and log warnings for missing required values
 */
function validateConfig() {
    const warnings = [];
    
    if (!process.env.MQTT_BROKER_URL) {
        warnings.push('MQTT_BROKER_URL not set, using default: mqtt://localhost:1883');
    }
    
    if (!process.env.MQTT_TOPIC_PREFIX) {
        warnings.push('MQTT_TOPIC_PREFIX not set, using default: /blegateways/aprilbrother/device/');
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

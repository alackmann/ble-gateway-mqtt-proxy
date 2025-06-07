/**
 * Home Assistant MQTT Discovery Integration
 * Implements publishing of MQTT Auto Discovery messages for Home Assistant
 */

const logger = require('./logger');
const config = require('./config').config;
const { formatMac, slugify } = require('./utils');

// Set of device MACs for which we have already published discovery messages
const publishedDevices = new Set();

/**
 * Creates the common device object for Home Assistant discovery
 * 
 * @param {string} macWithoutColons - MAC address without colons
 * @param {string} friendlyName - Friendly name for the device
 * @returns {Object} Device object for Home Assistant
 */
function createDeviceObject(macWithoutColons, friendlyName) {
    return {
        identifiers: [`ble_token_${macWithoutColons}`],
        name: friendlyName,
        model: "April Brother BLE Gateway v4 Token",
        manufacturer: "April Brother"
    };
}

/**
 * Creates the RSSI sensor config payload for Home Assistant
 * 
 * @param {string} macWithoutColons - MAC address without colons
 * @param {string} macWithColons - MAC address with colons
 * @param {string} friendlyName - Friendly name for the device
 * @param {Object} deviceObject - Common device object
 * @returns {Object} RSSI sensor config payload
 */
function createRssiSensorConfig(macWithoutColons, macWithColons, friendlyName, deviceObject) {
    return {
        name: `${friendlyName} RSSI`,
        unique_id: `ble_token_${macWithoutColons}_rssi`,
        state_topic: `${config.mqtt.topicPrefix}state/${macWithColons}`,
        value_template: "{{ value_json.rssi | default(0) }}",
        unit_of_measurement: "dBm",
        device_class: "signal_strength",
        expire_after: 300,
        device: deviceObject
    };
}

/**
 * Creates the Last Seen sensor config payload for Home Assistant
 * 
 * @param {string} macWithoutColons - MAC address without colons
 * @param {string} macWithColons - MAC address with colons
 * @param {string} friendlyName - Friendly name for the device
 * @param {Object} deviceObject - Common device object
 * @returns {Object} Last Seen sensor config payload
 */
function createLastSeenSensorConfig(macWithoutColons, macWithColons, friendlyName, deviceObject) {
    return {
        name: `${friendlyName} Last Seen`,
        unique_id: `ble_token_${macWithoutColons}_last_seen`,
        state_topic: `${config.mqtt.topicPrefix}state/${macWithColons}`,
        value_template: "{{ value_json.last_seen_timestamp }}",
        device_class: "timestamp",
        expire_after: 300,
        device: deviceObject
    };
}

/**
 * Publishes discovery messages for a single device
 * 
 * @param {Object} mqttClient - MQTT client instance
 * @param {string} macWithoutColons - MAC address without colons
 * @param {Object} deviceInfo - Device information object with name property
 * @returns {Promise<boolean>} True if messages were published, false if already published
 */
async function publishDeviceDiscovery(mqttClient, macWithoutColons, deviceInfo) {
    // Skip if device was already published
    if (publishedDevices.has(macWithoutColons)) {
        return false;
    }

    try {
        const friendlyName = deviceInfo.name;
        const macWithColons = formatMac(macWithoutColons);
        const deviceSlug = slugify(friendlyName);
        
        // Create common device object
        const deviceObject = createDeviceObject(macWithoutColons, friendlyName);
        
        // Create sensor configurations
        const rssiConfig = createRssiSensorConfig(macWithoutColons, macWithColons, friendlyName, deviceObject);
        const lastSeenConfig = createLastSeenSensorConfig(macWithoutColons, macWithColons, friendlyName, deviceObject);
        
        // Discovery topic prefixes
        const discoveryPrefix = config.homeAssistant.discoveryTopicPrefix;
        
        // Publish RSSI sensor config
        const rssiTopic = `${discoveryPrefix}/sensor/${deviceSlug}_rssi/config`;
        await mqttClient.publish(rssiTopic, JSON.stringify(rssiConfig), { retain: true });
        logger.info(`Published Home Assistant discovery for RSSI sensor: ${friendlyName} (${macWithColons})`);
        
        // Publish Last Seen sensor config
        const lastSeenTopic = `${discoveryPrefix}/sensor/${deviceSlug}_last_seen/config`;
        await mqttClient.publish(lastSeenTopic, JSON.stringify(lastSeenConfig), { retain: true });
        logger.info(`Published Home Assistant discovery for Last Seen sensor: ${friendlyName} (${macWithColons})`);
        
        // Mark as published
        publishedDevices.add(macWithoutColons);
        
        return true;
    } catch (error) {
        logger.error(`Error publishing Home Assistant discovery for device ${macWithoutColons}: ${error.message}`);
        return false;
    }
}

/**
 * Publishes discovery messages for all configured devices
 * 
 * @param {Object} mqttClient - MQTT client instance
 * @returns {Promise<number>} Number of devices for which discovery messages were published
 */
async function publishDiscoveryMessages(mqttClient) {
    if (!config.homeAssistant.enabled) {
        logger.info('Home Assistant integration is disabled. Skipping discovery message publishing.');
        return 0;
    }

    if (!mqttClient || !mqttClient.isConnected()) {
        logger.error('MQTT client not connected. Cannot publish discovery messages.');
        return 0;
    }

    const devices = config.homeAssistant.devices;
    if (devices.size === 0) {
        logger.warn('No Home Assistant devices configured. Skipping discovery message publishing.');
        return 0;
    }

    logger.info(`Publishing Home Assistant discovery messages for ${devices.size} devices...`);
    
    let publishedCount = 0;
    
    for (const [macWithoutColons, deviceInfo] of devices.entries()) {
        const wasPublished = await publishDeviceDiscovery(mqttClient, macWithoutColons, deviceInfo);
        if (wasPublished) {
            publishedCount++;
        }
    }
    
    logger.info(`Published Home Assistant discovery messages for ${publishedCount} new devices.`);
    return publishedCount;
}

/**
 * Resets the set of published devices
 * Primarily used for testing
 */
function resetPublishedDevices() {
    publishedDevices.clear();
}

module.exports = {
    publishDiscoveryMessages,
    publishDeviceDiscovery,
    resetPublishedDevices,
    // Export for testing
    createDeviceObject,
    createRssiSensorConfig,
    createLastSeenSensorConfig
};

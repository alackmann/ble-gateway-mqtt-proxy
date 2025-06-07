/**
 * Home Assistant MQTT Discovery Integration
 * Implements publishing of MQTT Auto Discovery messages for Home Assistant
 */

const logger = require('./logger');
const config = require('./config').config;
const { formatMac, slugify } = require('./utils');

// Set of device MACs for which we have already published discovery messages
const publishedDevices = new Set();
// Flag to track if gateway discovery messages have been published
let gatewayDiscoveryPublished = false;

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
        state_topic: `${config.mqtt.topicPrefix}state/${macWithoutColons}`,
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
        state_topic: `${config.mqtt.topicPrefix}state/${macWithoutColons}`,
        value_template: "{{ value_json.last_seen_timestamp }}",
        device_class: "timestamp",
        expire_after: 300,
        device: deviceObject
    };
}

/**
 * Creates the common device object for the BLE Gateway
 * 
 * @returns {Object} Device object for Home Assistant
 */
function createGatewayDeviceObject() {
    return {
        identifiers: [`ble_gateway`],
        name: config.homeAssistant.gatewayName,
        model: "April Brother BLE Gateway v4",
        manufacturer: "April Brother"
    };
}

/**
 * Creates a sensor config payload for a gateway sensor
 * 
 * @param {string} sensorType - Type of sensor (version, ip, mac, etc.)
 * @param {string} displayName - Friendly display name for the sensor
 * @param {string} valueTemplate - Template for extracting the value from the payload
 * @param {string} deviceClass - Optional device class for the sensor
 * @param {Object} deviceObject - Common device object
 * @returns {Object} Sensor config payload
 */
function createGatewaySensorConfig(sensorType, displayName, valueTemplate, deviceClass, deviceObject) {
    const sensorConfig = {
        name: `${displayName}`,
        unique_id: `ble_gateway_${sensorType}`,
        state_topic: `${config.mqtt.topicPrefix}gateway/state`,
        value_template: valueTemplate,
        device: deviceObject
    };
    
    if (deviceClass) {
        sensorConfig.device_class = deviceClass;
    }
    
    return sensorConfig;
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
 * Publishes discovery messages for the gateway
 * 
 * @param {Object} mqttClient - MQTT client instance
 * @returns {Promise<boolean>} True if messages were published, false if already published
 */
async function publishGatewayDiscovery(mqttClient) {
    // Skip if gateway discovery was already published
    if (gatewayDiscoveryPublished) {
        return false;
    }

    try {
        const gatewayName = config.homeAssistant.gatewayName;
        const gatewaySlug = slugify(gatewayName);
        
        // Create common device object
        const deviceObject = createGatewayDeviceObject();
        
        // Create sensor configurations
        const sensors = [
            {
                type: 'version',
                name: `${gatewayName} Version`,
                template: "{{ value_json.version }}",
                deviceClass: null
            },
            {
                type: 'ip',
                name: `${gatewayName} IP`,
                template: "{{ value_json.ip }}",
                deviceClass: null
            },
            {
                type: 'mac',
                name: `${gatewayName} MAC`,
                template: "{{ value_json.mac }}",
                deviceClass: null
            },
            {
                type: 'message_id',
                name: `${gatewayName} Message ID`,
                template: "{{ value_json.messageId }}",
                deviceClass: null
            },
            {
                type: 'time',
                name: `${gatewayName} Time`,
                template: "{{ value_json.time }}",
                deviceClass: null
            },
            {
                type: 'last_ping',
                name: `${gatewayName} Last Ping`,
                template: "{{ value_json.processed_timestamp }}",
                deviceClass: "timestamp"
            }
        ];
        
        // Discovery topic prefix
        const discoveryPrefix = config.homeAssistant.discoveryTopicPrefix;
        
        // Publish sensor configs
        for (const sensor of sensors) {
            const sensorConfig = createGatewaySensorConfig(
                sensor.type,
                sensor.name,
                sensor.template,
                sensor.deviceClass,
                deviceObject
            );
            
            const topic = `${discoveryPrefix}/sensor/${gatewaySlug}_${sensor.type}/config`;
            await mqttClient.publish(topic, JSON.stringify(sensorConfig), { retain: true });
            logger.info(`Published Home Assistant discovery for gateway sensor: ${sensor.name}`);
        }
        
        // Mark as published
        gatewayDiscoveryPublished = true;
        
        return true;
    } catch (error) {
        logger.error(`Error publishing Home Assistant discovery for gateway: ${error.message}`);
        throw error; // Re-throw the error after logging it
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

    let publishedCount = 0;
    
    // Publish BLE device discovery messages
    const devices = config.homeAssistant.devices;
    if (devices.size === 0) {
        logger.warn('No Home Assistant BLE devices configured. Skipping BLE device discovery message publishing.');
    } else {
        logger.info(`Publishing Home Assistant discovery messages for ${devices.size} BLE devices...`);
        
        for (const [macWithoutColons, deviceInfo] of devices.entries()) {
            const wasPublished = await publishDeviceDiscovery(mqttClient, macWithoutColons, deviceInfo);
            if (wasPublished) {
                publishedCount++;
            }
        }
        
        logger.info(`Published Home Assistant discovery messages for ${publishedCount} new BLE devices.`);
    }
    
    // Publish gateway discovery messages
    logger.info('Publishing Home Assistant discovery messages for gateway...');
    const gatewayPublished = await publishGatewayDiscovery(mqttClient);
    if (gatewayPublished) {
        publishedCount++;
        logger.info('Published Home Assistant discovery messages for gateway.');
    }
    
    return publishedCount;
}

/**
 * Resets the set of published devices and gateway discovery status
 * Primarily used for testing
 */
function resetPublishedDevices() {
    publishedDevices.clear();
    gatewayDiscoveryPublished = false;
}

module.exports = {
    publishDiscoveryMessages,
    publishDeviceDiscovery,
    publishGatewayDiscovery,
    resetPublishedDevices,
    // Export for testing
    createDeviceObject,
    createRssiSensorConfig,
    createLastSeenSensorConfig,
    createGatewayDeviceObject,
    createGatewaySensorConfig
};

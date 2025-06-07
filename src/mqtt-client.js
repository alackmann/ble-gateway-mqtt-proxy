/**
 * MQTT Client Module
 * Handles MQTT broker connection and publishing for BLE device data
 */

const mqtt = require('mqtt');
const { config } = require('./config');
const logger = require('./logger');

// MQTT client instance
let mqttClient = null;
let connectionAttempts = 0;
let reconnectTimer = null;
let isConnecting = false;

// Connection options and state
const CONNECTION_OPTIONS = {
    connectTimeout: 10000,    // 10 seconds
    reconnectPeriod: 5000,    // 5 seconds
    keepalive: 60,            // 60 seconds
    clean: true,              // Clean session
    rejectUnauthorized: false // For self-signed certificates
};

const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_BACKOFF_MAX = 30000; // 30 seconds max backoff

/**
 * Initialize MQTT client connection
 * @returns {Promise<boolean>} Promise that resolves to connection success status
 */
function initializeMqttClient() {
    return new Promise((resolve, reject) => {
        try {
            if (mqttClient && mqttClient.connected) {
                logger.info('MQTT client already connected');
                return resolve(true);
            }

            if (isConnecting) {
                logger.debug('MQTT connection already in progress');
                return resolve(false);
            }

            isConnecting = true;
            connectionAttempts++;

            logger.info('Initializing MQTT client connection', {
                brokerUrl: config.mqtt.brokerUrl,
                attempt: connectionAttempts,
                hasUsername: !!config.mqtt.username
            });

            // Prepare connection options
            const clientOptions = {
                ...CONNECTION_OPTIONS,
                clientId: `ble-gateway-${process.pid}-${Date.now()}`, // Unique client ID
            };

            // Add authentication if provided
            if (config.mqtt.username) {
                clientOptions.username = config.mqtt.username;
                if (config.mqtt.password) {
                    clientOptions.password = config.mqtt.password;
                }
            }

            // Create MQTT client
            mqttClient = mqtt.connect(config.mqtt.brokerUrl, clientOptions);

            // Set up event handlers
            setupEventHandlers(resolve, reject);

        } catch (error) {
            isConnecting = false;
            logger.error('Failed to initialize MQTT client', {
                error: error.message,
                brokerUrl: config.mqtt.brokerUrl
            });
            reject(error);
        }
    });
}

/**
 * Set up MQTT client event handlers
 * @param {Function} resolve - Promise resolve function
 * @param {Function} reject - Promise reject function
 */
function setupEventHandlers(resolve, reject) {
    // Connection successful
    mqttClient.on('connect', () => {
        isConnecting = false;
        connectionAttempts = 0; // Reset on successful connection
        
        logger.logMqttConnection('connected', {
            brokerUrl: config.mqtt.brokerUrl,
            clientId: mqttClient.options.clientId
        });
        
        resolve(true);
    });

    // Connection error
    mqttClient.on('error', (error) => {
        isConnecting = false;
        
        logger.logMqttConnection('error', {
            error: error.message,
            brokerUrl: config.mqtt.brokerUrl,
            attempt: connectionAttempts
        });
        
        if (connectionAttempts === 1) {
            // First attempt failed, reject the promise
            reject(error);
        }
    });

    // Connection closed
    mqttClient.on('close', () => {
        logger.logMqttConnection('disconnected', {
            brokerUrl: config.mqtt.brokerUrl,
            willReconnect: connectionAttempts < MAX_RECONNECT_ATTEMPTS
        });
    });

    // Reconnection attempt
    mqttClient.on('reconnect', () => {
        connectionAttempts++;
        
        logger.logMqttConnection('reconnecting', {
            attempt: connectionAttempts,
            maxAttempts: MAX_RECONNECT_ATTEMPTS
        });

        // Stop reconnecting after max attempts
        if (connectionAttempts > MAX_RECONNECT_ATTEMPTS) {
            logger.error('Max MQTT reconnection attempts reached, stopping', {
                attempts: connectionAttempts,
                maxAttempts: MAX_RECONNECT_ATTEMPTS
            });
            mqttClient.end(true); // Force close
        }
    });

    // Connection offline
    mqttClient.on('offline', () => {
        logger.logMqttConnection('offline', {
            brokerUrl: config.mqtt.brokerUrl
        });
    });
}

/**
 * Publish a JSON payload to MQTT broker
 * @param {Object} jsonPayload - JSON payload to publish
 * @returns {Promise<boolean>} Promise that resolves to publish success status
 */
function publishDeviceData(jsonPayload) {
    return new Promise((resolve, reject) => {
        try {
            // Validate input
            if (!jsonPayload || typeof jsonPayload !== 'object') {
                throw new Error('Invalid JSON payload: must be an object');
            }

            if (!jsonPayload.mac_address) {
                throw new Error('Invalid JSON payload: missing mac_address');
            }

            // Check MQTT client connection
            if (!mqttClient || !mqttClient.connected) {
                throw new Error('MQTT client not connected');
            }

            // Construct topic - now uses the new 'state/' topic format
            const topic = constructTopic(jsonPayload.mac_address);
            
            // Convert payload to JSON string
            const message = JSON.stringify(jsonPayload);
            
            // Publish options
            // BREAKING CHANGE: Always use retain: false for state messages
            // This overrides the MQTT_RETAIN configuration for state topics
            const publishOptions = {
                qos: config.mqtt.qos,
                retain: false // State messages must not be retained for Home Assistant compatibility
            };

            logger.debug('Publishing device data to MQTT', {
                topic: topic,
                deviceMac: jsonPayload.mac_address,
                messageSize: message.length,
                qos: publishOptions.qos,
                retain: publishOptions.retain
            });

            // Publish message
            mqttClient.publish(topic, message, publishOptions, (error) => {
                if (error) {
                    logger.logMqttPublish('failed', {
                        topic: topic,
                        deviceMac: jsonPayload.mac_address,
                        error: error.message
                    });
                    reject(error);
                } else {
                    logger.logMqttPublish('success', {
                        topic: topic,
                        deviceMac: jsonPayload.mac_address,
                        messageSize: message.length
                    });
                    resolve(true);
                }
            });

        } catch (error) {
            logger.logMqttPublish('failed', {
                deviceMac: jsonPayload?.mac_address || 'unknown',
                error: error.message
            });
            reject(error);
        }
    });
}

/**
 * Publish multiple JSON payloads to MQTT broker
 * @param {Array} jsonPayloads - Array of JSON payloads to publish
 * @returns {Promise<Object>} Promise that resolves to publish results
 */
function publishMultipleDeviceData(jsonPayloads) {
    return new Promise(async (resolve, reject) => {
        if (!Array.isArray(jsonPayloads)) {
            return reject(new Error('Invalid payloads: must be an array'));
        }

        logger.debug('Publishing multiple device payloads', {
            payloadCount: jsonPayloads.length,
            brokerConnected: mqttClient?.connected || false
        });

        const results = {
            payloads: [],
            errors: [],
            totalCount: jsonPayloads.length,
            successCount: 0,
            errorCount: 0
        };

        // Check MQTT connection before proceeding
        if (!mqttClient || !mqttClient.connected) {
            const error = 'MQTT client not connected';
            logger.error('Cannot publish payloads: MQTT not connected');
            
            // Add error for each payload
            for (let i = 0; i < jsonPayloads.length; i++) {
                results.errors.push({
                    payloadIndex: i,
                    deviceMac: jsonPayloads[i]?.mac_address || 'unknown',
                    error: error
                });
                results.errorCount++;
            }
            
            return resolve(results);
        }

        // Publish each payload
        for (let i = 0; i < jsonPayloads.length; i++) {
            const payload = jsonPayloads[i];
            
            try {
                await publishDeviceData(payload);
                results.payloads.push(payload);
                results.successCount++;
            } catch (error) {
                const errorInfo = {
                    payloadIndex: i,
                    deviceMac: payload?.mac_address || 'unknown',
                    error: error.message
                };
                results.errors.push(errorInfo);
                results.errorCount++;
                
                logger.warn(`Failed to publish payload ${i}`, errorInfo);
            }
        }

        logger.info('MQTT publishing completed', {
            totalPayloads: results.totalCount,
            successfulPublications: results.successCount,
            failedPublications: results.errorCount
        });

        resolve(results);
    });
}

/**
 * Publish gateway status data to MQTT broker
 * @param {Object} gatewayData - Gateway data object containing v, mid, time, ip, mac, etc.
 * @returns {Promise<boolean>} Promise that resolves to publish success status
 */
function publishGatewayData(gatewayData) {
    return new Promise((resolve, reject) => {
        try {
            // Validate input
            if (!gatewayData || typeof gatewayData !== 'object') {
                throw new Error('Invalid gateway data: must be an object');
            }

            // Check MQTT client connection
            if (!mqttClient || !mqttClient.connected) {
                throw new Error('MQTT client not connected');
            }

            // Add current timestamp
            const gatewayPayload = {
                ...gatewayData,
                processed_timestamp: new Date().toISOString()
            };

            // Construct gateway topic
            const topic = constructGatewayTopic();
            
            // Convert payload to JSON string
            const message = JSON.stringify(gatewayPayload);
            
            // Publish options
            const publishOptions = {
                qos: config.mqtt.qos,
                retain: false // Never retain gateway state messages
            };
            
            logger.debug('Publishing gateway data to MQTT', {
                topic: topic,
                payloadSize: message.length,
                qos: publishOptions.qos,
                retain: publishOptions.retain
            });
            
            // Publish the message
            mqttClient.publish(topic, message, publishOptions, (error) => {
                if (error) {
                    logger.logProcessingError('MQTT gateway publish failed', {
                        error: error.message,
                        topic: topic,
                        payloadSize: message.length
                    });
                    reject(error);
                } else {
                    logger.debug('Gateway data published successfully', {
                        topic: topic,
                        payloadSize: message.length
                    });
                    resolve(true);
                }
            });
            
        } catch (error) {
            logger.logProcessingError('Gateway data publishing error', {
                error: error.message,
                stack: error.stack
            });
            reject(error);
        }
    });
}

/**
 * Construct MQTT topic for device according to Home Assistant integration spec
 * @param {string} deviceMacAddress - Device MAC address (colon-separated)
 * @returns {string} Complete MQTT topic
 */
function constructTopic(deviceMacAddress) {
    if (!deviceMacAddress || typeof deviceMacAddress !== 'string') {
        throw new Error('Invalid MAC address for topic construction');
    }

    // Ensure topic prefix ends with a separator if it doesn't already
    let topicPrefix = config.mqtt.topicPrefix;
    if (topicPrefix && !topicPrefix.endsWith('/')) {
        topicPrefix += '/';
    }

    // BREAKING CHANGE: Construct topic: <MQTT_TOPIC_PREFIX>state/<DEVICE_MAC_ADDRESS>
    // This replaces the previous format: <MQTT_TOPIC_PREFIX>device/<DEVICE_MAC_ADDRESS>
    const topic = `${topicPrefix}state/${deviceMacAddress}`;
    
    logger.debug('Constructed MQTT topic', {
        deviceMac: deviceMacAddress,
        topicPrefix: topicPrefix,
        fullTopic: topic
    });

    return topic;
}

/**
 * Construct MQTT topic for gateway status messages
 * @returns {string} Complete MQTT topic for gateway
 */
function constructGatewayTopic() {
    // Ensure topic prefix ends with a separator if it doesn't already
    let topicPrefix = config.mqtt.topicPrefix;
    if (topicPrefix && !topicPrefix.endsWith('/')) {
        topicPrefix += '/';
    }

    // Construct topic: <MQTT_TOPIC_PREFIX>gateway/state
    const topic = `${topicPrefix}gateway/state`;
    
    logger.debug('Constructed gateway MQTT topic', {
        topicPrefix: topicPrefix,
        fullTopic: topic
    });

    return topic;
}

/**
 * Check if MQTT client is connected
 * @returns {boolean} Connection status
 */
function isConnected() {
    return Boolean(mqttClient && mqttClient.connected);
}

/**
 * Get MQTT client connection status and information
 * @returns {Object} Connection status information
 */
function getConnectionStatus() {
    return {
        connected: isConnected(),
        connecting: isConnecting,
        reconnecting: mqttClient?.reconnecting || false,
        connectionAttempts: connectionAttempts,
        clientId: mqttClient?.options?.clientId || null,
        brokerUrl: config.mqtt.brokerUrl,
        topicPrefix: config.mqtt.topicPrefix
    };
}

/**
 * Gracefully disconnect MQTT client
 * @returns {Promise<void>} Promise that resolves when disconnected
 */
function disconnect() {
    return new Promise((resolve) => {
        if (!mqttClient) {
            logger.debug('MQTT client not initialized, nothing to disconnect');
            return resolve();
        }

        if (!mqttClient.connected && !mqttClient.reconnecting) {
            logger.debug('MQTT client already disconnected');
            return resolve();
        }

        logger.info('Disconnecting MQTT client...');

        mqttClient.end(false, {}, () => {
            logger.logMqttConnection('disconnected', {
                brokerUrl: config.mqtt.brokerUrl,
                reason: 'graceful_shutdown'
            });
            mqttClient = null;
            connectionAttempts = 0;
            isConnecting = false;
            resolve();
        });
    });
}

/**
 * Reconnect MQTT client (force reconnection)
 * @returns {Promise<boolean>} Promise that resolves to connection success status
 */
function reconnect() {
    logger.info('Force reconnecting MQTT client...');
    
    // Disconnect first if connected
    if (mqttClient) {
        mqttClient.end(true); // Force close
        mqttClient = null;
        connectionAttempts = 0;
        isConnecting = false;
    }

    // Initialize new connection
    return initializeMqttClient();
}

/**
 * Reset module state (for testing)
 * @private
 */
function _resetState() {
    mqttClient = null;
    connectionAttempts = 0;
    reconnectTimer = null;
    isConnecting = false;
}

module.exports = {
    initializeMqttClient,
    publishDeviceData,
    publishMultipleDeviceData,
    publishGatewayData,
    constructTopic,
    constructGatewayTopic,
    isConnected,
    getConnectionStatus,
    disconnect,
    reconnect,
    _resetState
};

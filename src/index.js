/**
 * BLE Gateway Data Processor
 * Main entry point for the application
 */

const express = require('express');
const msgpack = require('msgpack5')();
const { config } = require('./config');
const logger = require('./logger');
const gatewayParser = require('./gateway-parser');
const deviceParser = require('./device-parser');
const jsonTransformer = require('./json-transformer');
const mqttClient = require('./mqtt-client');
const haDiscovery = require('./ha-discovery');
const ScheduledPublisher = require('./scheduled-publisher');

const app = express();

// Scheduled publisher instance
let scheduledPublisher = null;

/**
 * Publishes device data payloads and gateway status to MQTT.
 * 
 * This function encapsulates the MQTT publishing logic and comprehensive logging.
 * It handles both successful and failed publications gracefully, ensuring that
 * partial failures don't prevent gateway status updates.
 * 
 * MQTT TOPICS:
 * - Device data: Published to topics based on MAC address and device type
 * - Gateway status: Published to gateway-specific status topic
 * 
 * ERROR HANDLING:
 * - Continues processing even if some device publishes fail
 * - Always attempts to publish gateway status regardless of device publish results
 * - Logs detailed error information for debugging MQTT connectivity issues
 * 
 * @param {Array<Object>} payloads The JSON payloads to publish (from json-transformer.js)
 * @param {Object} gatewayMetadata Metadata about the gateway for logging (from gateway-parser.js)
 * @param {Object} gatewayInfo Gateway information to publish (raw gateway data)
 */
async function publishDeviceData(payloads, gatewayMetadata, gatewayInfo = null) {
    if (!payloads || payloads.length === 0) {
        logger.info('No device data to publish.');
        // Still publish gateway data if available
        if (gatewayInfo) {
            await publishGatewayStatus(gatewayInfo);
        }
        return;
    }
    try {
        logger.debug('Publishing device data to MQTT broker', {
            payloadCount: payloads.length,
            firstDeviceMac: payloads[0]?.mac_address,
            gatewayInfo: gatewayMetadata ? {
                mac: gatewayMetadata.mac,
                ip: gatewayMetadata.ip
            } : undefined
        });

        const mqttResults = await mqttClient.publishMultipleDeviceData(payloads);

        if (mqttResults.errorCount > 0) {
            logger.warn('Some MQTT publications failed', {
                totalPayloads: mqttResults.totalCount,
                successfulPublications: mqttResults.successCount,
                failedPublications: mqttResults.errorCount,
                errors: mqttResults.errors
            });
        }

        if (mqttResults.successCount === 0 && mqttResults.totalCount > 0) {
            logger.error('All MQTT publications failed', {
                totalPayloads: mqttResults.totalCount,
                errors: mqttResults.errors
            });
        } else if (mqttResults.successCount > 0) {
            logger.info(`Successfully published data for ${mqttResults.successCount} devices.`);
        }

        // Publish gateway status alongside device data
        if (gatewayInfo) {
            await publishGatewayStatus(gatewayInfo);
        }
    } catch (mqttError) {
        logger.error('MQTT publishing failed with exception', {
            error: mqttError.message,
            payloadCount: payloads.length
        });
    }
}

/**
 * Publishes gateway status information to MQTT.
 * 
 * Publishes heartbeat and status information about the gateway itself,
 * including firmware version, IP address, MAC address, and message sequence ID.
 * This is essential for monitoring gateway health and connectivity.
 * 
 * MQTT TOPIC: Uses gateway-specific topic for status updates
 * FREQUENCY: Called on every successful request processing
 * PURPOSE: Enables monitoring systems to track gateway uptime and health
 * 
 * @param {Object} gatewayInfo Gateway information to publish (contains version, messageId, ip, mac)
 */
async function publishGatewayStatus(gatewayInfo) {
    try {
        logger.debug('Publishing gateway status to MQTT broker', {
            gatewayInfo: {
                version: gatewayInfo.version,
                messageId: gatewayInfo.messageId,
                ip: gatewayInfo.ip,
                mac: gatewayInfo.mac
            }
        });
        
        await mqttClient.publishGatewayData(gatewayInfo);
        logger.debug('Gateway status published to MQTT successfully');
        
    } catch (gatewayMqttError) {
        logger.error('Gateway MQTT publishing failed', {
            error: gatewayMqttError.message,
            gatewayMac: gatewayInfo.mac
        });
    }
}

// Middleware to parse raw request bodies for MessagePack format
// 
// IMPORTANT: The BLE gateway hardware doesn't send proper Content-Type headers,
// so we use a custom type function that accepts all requests regardless of headers.
// This is necessary because express.raw() normally requires a specific content type.
// 
// SECURITY NOTE: This middleware only applies to the /tokendata route, not globally.
// The 10MB limit prevents memory exhaustion from oversized payloads.
app.use('/tokendata', express.raw({ 
    type: () => true, // Accept all requests regardless of Content-Type header
    limit: '10mb' // Set reasonable limit for BLE data (protects against DoS)
}));

/**
 * POST /tokendata - Main endpoint for receiving BLE gateway data
 * 
 * PROTOCOL: Always expects MessagePack format (hardware doesn't send Content-Type headers)
 * AUTHENTICATION: None (designed for local network deployment)
 * RATE LIMITING: None (handled by MQTT publishing intervals instead)
 * 
 * PROCESSING PIPELINE:
 * This endpoint processes incoming BLE device data from the gateway through several stages:
 * 1. Request validation and logging - Validate payload exists and log request details
 * 2. MessagePack decoding - Convert binary data to JavaScript objects  
 * 3. Gateway data parsing and validation - Extract and validate gateway metadata
 * 4. BLE device data parsing - Parse raw advertising data from each device
 * 5. JSON transformation - Convert to standardized format with gateway metadata
 * 6. MQTT publishing - Use scheduled publisher for intelligent throttling and device caching
 * 7. Success logging and response - Return 204 No Content on success
 * 8. Error handling - Handle and log any processing failures
 * 
 * MQTT PUBLISHING BEHAVIOR:
 * - Immediate: New Home Assistant tracked devices trigger immediate publish
 * - Scheduled: Regular interval publishes include ALL devices seen during interval
 * - Caching: Device state is cached by MAC address to prevent "device disappeared" issues
 * 
 * ERROR HANDLING:
 * - Partial failures are logged but don't stop processing (e.g., some devices fail parsing)
 * - Complete failures return appropriate HTTP error codes with details
 * - All errors include context for debugging (request size, gateway info, etc.)
 */
app.post('/tokendata', async (req, res) => {
    try {
        // =================================================================
        // SECTION 1: REQUEST VALIDATION AND INITIAL LOGGING
        // =================================================================
        // Extract source IP for logging and debugging purposes
        // Used for security monitoring and troubleshooting connection issues
        const sourceIP = req.ip || req.connection.remoteAddress;
        
        // Debug: Log raw request details for troubleshooting
        // This helps diagnose issues with request format, size, MessagePack parsing
        // and identify potential gateway configuration or network problems
        logger.debug('Raw request debug info', {
            hasBody: !!req.body,
            bodyType: typeof req.body,
            bodyConstructor: req.body?.constructor?.name,
            bodyLength: req.body?.length,
            isBuffer: Buffer.isBuffer(req.body),
            rawBodySize: req.body ? req.body.length : 'undefined',
            headers: req.headers
        });
        
        // Log incoming request for audit trail and monitoring
        logger.logRequest('POST', '/tokendata', 'MessagePack (assumed)', sourceIP, req.body?.length || 0);
        
        // Validate that request contains actual data
        // Empty requests are invalid and should be rejected early
        if (!req.body || req.body.length === 0) {
            logger.warn('Empty request body received', { 
                sourceIP,
                bodyExists: !!req.body,
                bodyLength: req.body?.length,
                bodyType: typeof req.body
            });
            return res.status(400).json({ 
                error: 'Request body is required' 
            });
        }
        
        logger.debug(`Processing ${req.body.length} bytes of MessagePack data`);
        
        // =================================================================
        // SECTION 2: MESSAGEPACK DECODING
        // =================================================================
        // Gateway sends data in MessagePack format for efficiency over JSON
        // MessagePack is a binary serialization format that's faster and smaller
        // than JSON, which is important for embedded devices with limited bandwidth
        let decodedData;
        
        try {
            logger.debug('Decoding MessagePack data...');
            decodedData = msgpack.decode(req.body);
            logger.debug('MessagePack data decoded successfully');
            
            // Log decoded data structure for verification (without full content for large payloads)
            // This helps understand the gateway's data format and debug structural issues
            // without overwhelming the logs with actual device data
            const dataKeys = Object.keys(decodedData || {});
            logger.debug('Decoded data keys', { keys: dataKeys });
            
            // Quick device count check for early logging
            // Provides immediate feedback on payload size before detailed processing
            const deviceCount = decodedData.devices && Array.isArray(decodedData.devices) ? decodedData.devices.length : 0;
            if (deviceCount > 0) {
                logger.info(`Found ${deviceCount} devices in payload`);
            }
            
            // Log top-level gateway information if present
            // This provides immediate visibility into gateway status and message tracking
            // These fields are used later by gateway-parser.js for validation
            const gatewayInfo = {
                version: decodedData.v,        // Gateway firmware version
                messageId: decodedData.mid,    // Message sequence ID for duplicate detection
                ip: decodedData.ip,           // Gateway IP address
                mac: decodedData.mac          // Gateway MAC (uppercase from hardware)
            };
            logger.debug('Gateway info', gatewayInfo);
            
        } catch (decodeError) {
            // MessagePack decoding failed - invalid data format
            logger.logProcessingError('MessagePack decoding', decodeError, { 
                sourceIP, 
                bodyLength: req.body.length 
            });
            return res.status(400).json({
                error: 'Invalid MessagePack format',
                details: decodeError.message
            });
        }
        
        logger.debug('Starting gateway data parsing', { 
            dataSize: Buffer.isBuffer(decodedData) ? decodedData.length : 
                      typeof decodedData === 'string' ? decodedData.length : 
                      JSON.stringify(decodedData).length
        });
        
        // =================================================================
        // SECTION 3: GATEWAY DATA PARSING AND VALIDATION
        // =================================================================
        // Parse and validate the top-level gateway information using gateway-parser.js
        // This module handles version validation, message ID tracking, and format checks
        // Validation ensures we have required fields before processing device data
        const parsedData = gatewayParser.parseGatewayData(decodedData);
        const validation = gatewayParser.validateGatewayData(parsedData.gatewayInfo);
        
        // Log validation warnings (non-fatal issues)
        if (validation.warnings.length > 0) {
            logger.warn('Gateway data validation warnings', { warnings: validation.warnings });
        }
        
        // Log errors and reject if data is invalid (fatal issues)
        if (!validation.isValid) {
            logger.error('Gateway data validation failed', { errors: validation.errors });
            return res.status(400).json({ 
                error: 'Invalid gateway data',
                details: validation.errors
            });
        }
        
        // Log successful gateway parsing with formatted information
        const formattedGatewayInfo = gatewayParser.formatGatewayInfo(parsedData.gatewayInfo);
        logger.info('Gateway data parsed successfully', {
            gateway: formattedGatewayInfo,
            deviceCount: parsedData.deviceCount
        });
        
        // =================================================================
        // SECTION 4: BLE DEVICE DATA PARSING
        // =================================================================
        // Parse raw BLE device data from the 'devices' array using device-parser.js
        // Each device contains MAC, RSSI, advertising data, manufacturer data, etc.
        // The parser handles different BLE advertising packet formats and vendor-specific data
        const deviceParsingResult = deviceParser.parseDevices(parsedData.devices);
        
        // Handle partial parsing failures (some devices failed)
        if (deviceParsingResult.errorCount > 0) {
            logger.warn('Some devices failed to parse', {
                totalDevices: deviceParsingResult.totalCount,
                successfulDevices: deviceParsingResult.successCount,
                failedDevices: deviceParsingResult.errorCount,
                errors: deviceParsingResult.errors
            });
        }
        
        // Handle complete parsing failure (all devices failed)
        if (deviceParsingResult.successCount === 0 && deviceParsingResult.totalCount > 0) {
            logger.error('All device parsing failed', { 
                totalDevices: deviceParsingResult.totalCount,
                errors: deviceParsingResult.errors
            });
            return res.status(400).json({ 
                error: 'Failed to parse any device data',
                details: 'All devices in the array had parsing errors'
            });
        }
        
        // Log device parsing summary (conditional logging based on error count)
        if (deviceParsingResult.errorCount > 0) {
            logger.info('Device parsing completed', {
                totalDevices: deviceParsingResult.totalCount,
                successfulDevices: deviceParsingResult.successCount,
                failedDevices: deviceParsingResult.errorCount
            });
        } else {
            logger.debug('Device parsing completed', {
                totalDevices: deviceParsingResult.totalCount,
                successfulDevices: deviceParsingResult.successCount,
                failedDevices: deviceParsingResult.errorCount
            });
        }

        // Get device statistics for debug logging only
        // This provides insights into RSSI ranges, advertising types, manufacturer data
        // Useful for understanding the BLE environment and device characteristics
        if (deviceParsingResult.devices.length > 0) {
            const deviceStats = deviceParser.getDeviceStatistics(deviceParsingResult.devices);
            logger.debug('Device statistics', deviceStats);
        }
        
        // =================================================================
        // SECTION 5: JSON TRANSFORMATION
        // =================================================================
        // Transform parsed device data into standardized JSON payloads using json-transformer.js
        // Adds gateway metadata (MAC, IP) and timestamps to each device record
        // Creates Home Assistant compatible format when HA discovery is enabled
        if (deviceParsingResult.successCount > 0) {
            const gatewayMetadata = gatewayParser.getGatewayMetadata(parsedData.gatewayInfo);
            const transformOptions = {
                gatewayMac: gatewayMetadata.mac,
                gatewayIp: gatewayMetadata.ip
            };
            
            const jsonTransformResult = jsonTransformer.transformDevicesToJson(
                deviceParsingResult.devices, 
                transformOptions
            );
            
            // Handle partial transformation failures
            if (jsonTransformResult.errorCount > 0) {
                logger.warn('Some devices failed JSON transformation', {
                    totalDevices: jsonTransformResult.totalCount,
                    successfulTransformations: jsonTransformResult.successCount,
                    failedTransformations: jsonTransformResult.errorCount,
                    errors: jsonTransformResult.errors
                });
            }
            
            // Handle complete transformation failure
            if (jsonTransformResult.successCount === 0) {
                logger.error('All JSON transformations failed', { 
                    totalDevices: jsonTransformResult.totalCount,
                    errors: jsonTransformResult.errors
                });
                return res.status(500).json({ 
                    error: 'Failed to transform device data to JSON format',
                    details: 'All devices failed JSON transformation'
                });
            }
            
            // Log JSON transformation summary (conditional logging)
            if (jsonTransformResult.errorCount > 0) {
                logger.info('JSON transformation completed', {
                    totalDevices: jsonTransformResult.totalCount,
                    successfulTransformations: jsonTransformResult.successCount,
                    failedTransformations: jsonTransformResult.errorCount
                });
            } else {
                logger.debug('JSON transformation completed', {
                    totalDevices: jsonTransformResult.totalCount,
                    successfulTransformations: jsonTransformResult.successCount,
                    failedTransformations: jsonTransformResult.errorCount
                });
            }

            // Get JSON statistics for debug logging only
            // Provides insights into payload sizes, field distributions, data quality
            // Helps identify potential issues with transformation logic or data format
            if (jsonTransformResult.payloads.length > 0) {
                const jsonStats = jsonTransformer.getJsonStatistics(jsonTransformResult.payloads);
                logger.debug('JSON payload statistics', jsonStats);
            }
            
            // =================================================================
            // SECTION 6: MQTT PUBLISHING WITH SCHEDULING LOGIC
            // =================================================================
            // Publish device data using scheduled-publisher.js for intelligent throttling
            // The publisher handles immediate vs scheduled publishing based on:
            // - Configured interval (MQTT_PUBLISH_INTERVAL_SECONDS)
            // - Presence of new tracked Home Assistant devices (triggers immediate publish)
            // - Device state caching to ensure all devices are included in scheduled publishes
            const transformedPayloads = jsonTransformResult.payloads;
            if (transformedPayloads.length > 0) {
                const gatewayMetadata = gatewayParser.getGatewayMetadata(parsedData.gatewayInfo);

                // Use the scheduled publisher to handle publishing logic
                // This delegates to scheduled-publisher.js which handles:
                // - MAC address normalization (uppercase->lowercase)
                // - Device state caching for scheduled publishes
                // - Timer management for interval-based publishing
                // - Immediate publishing for new Home Assistant devices
                if (scheduledPublisher) {
                    await scheduledPublisher.handleIncomingData(transformedPayloads, gatewayMetadata, parsedData.gatewayInfo);
                } else {
                    // Fallback to immediate publishing if scheduled publisher is not initialized
                    logger.warn('Scheduled publisher not initialized, falling back to immediate publishing');
                    await publishDeviceData(transformedPayloads, gatewayMetadata, parsedData.gatewayInfo);
                }
            } else {
                // No device payloads but still handle gateway status publishing
                logger.info('No JSON payloads to publish to MQTT');
                
                // Handle gateway-only publishing based on configuration
                // When no devices are present but gateway info is available,
                // still need to update gateway status for monitoring purposes
                if (scheduledPublisher && config.mqtt.publishIntervalSeconds > 0) {
                    // Let scheduled publisher handle gateway info caching
                    await scheduledPublisher.handleIncomingData([], gatewayParser.getGatewayMetadata(parsedData.gatewayInfo), parsedData.gatewayInfo);
                } else {
                    // Publish gateway status immediately if no interval is set
                    await publishGatewayStatus(parsedData.gatewayInfo);
                }
            }
        } else {
            // =================================================================
            // SECTION 6B: NO DEVICES TO TRANSFORM - GATEWAY ONLY PROCESSING
            // =================================================================
            // Handle case where no devices were successfully parsed but gateway data exists
            // Still need to publish gateway status information for health monitoring
            // This can happen when all devices fail parsing due to corrupt data
            logger.info('No devices to transform - skipping JSON transformation');
            
            // Handle gateway-only publishing based on configuration
            if (scheduledPublisher && config.mqtt.publishIntervalSeconds > 0) {
                // Let scheduled publisher handle gateway info caching
                await scheduledPublisher.handleIncomingData([], gatewayParser.getGatewayMetadata(parsedData.gatewayInfo), parsedData.gatewayInfo);
            } else {
                // Publish gateway status immediately if no interval is set
                await publishGatewayStatus(parsedData.gatewayInfo);
            }
        }
        
        // =================================================================
        // SECTION 7: SUCCESS LOGGING AND RESPONSE
        // =================================================================
        // Log comprehensive processing summary for monitoring and debugging
        // Provides visibility into processing success rates and gateway status
        // This information is used by monitoring systems and log analysis tools
        logger.info('POST request processed successfully', {
            devices: {
                total: deviceParsingResult.totalCount,
                successful: deviceParsingResult.successCount,
                failed: deviceParsingResult.errorCount
            },
            gateway: {
                version: parsedData.gatewayInfo.version,
                messageId: parsedData.gatewayInfo.messageId,
                ip: parsedData.gatewayInfo.ip,
                mac: parsedData.gatewayInfo.mac
            }
        });
        
        // Keep the detailed logging for compatibility with existing log processing tools
        // This maintains backwards compatibility with monitoring dashboards and alerting
        // that may depend on the specific logProcessingSuccess format
        logger.logProcessingSuccess(deviceParsingResult.successCount, {
            version: parsedData.gatewayInfo.version,
            messageId: parsedData.gatewayInfo.messageId,
            ip: parsedData.gatewayInfo.ip,
            mac: parsedData.gatewayInfo.mac
        });
        
        // Return 204 No Content as specified in the technical specification
        // This indicates successful processing without response body, which is
        // appropriate for webhook-style endpoints where the client doesn't need data back
        res.status(204).send();
        
    } catch (error) {
        // =================================================================
        // SECTION 8: GLOBAL ERROR HANDLING
        // =================================================================
        // Catch any unexpected errors not handled by specific sections above
        // This provides a safety net for runtime errors, memory issues, etc.
        // All errors are logged with full context for debugging
        logger.logProcessingError('request processing', error);
        res.status(500).json({ 
            error: 'Internal server error' 
        });
    }
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        version: require('../package.json').version 
    });
});

/**
 * Global error handler
 */
app.use((error, req, res, next) => {
    logger.error('Unhandled error', { 
        error: error.message, 
        stack: error.stack,
        url: req.url,
        method: req.method
    });
    res.status(500).json({ 
        error: 'Internal server error' 
    });
});

/**
 * Handle 404 for all other routes (must be last)
 */
app.use((req, res) => {
    logger.warn(`404 - Endpoint not found: ${req.method} ${req.path}`, { 
        sourceIP: req.ip || req.connection.remoteAddress 
    });
    res.status(404).json({ 
        error: 'Endpoint not found' 
    });
});

// Store timer reference for cleanup
let discoveryTimer = null;

// Initialize MQTT client connection
async function initializeApplication() {
    try {
        logger.info('Initializing MQTT client connection...');
        await mqttClient.initializeMqttClient();
        logger.info('MQTT client connected successfully');
        
        // Publish Home Assistant discovery messages if enabled
        if (config.homeAssistant.enabled) {
            logger.info('Home Assistant integration is enabled. Publishing discovery messages...');
            try {
                const publishedCount = await haDiscovery.publishDiscoveryMessages(mqttClient);
                logger.info(`Published Home Assistant discovery messages for ${publishedCount} devices`);
            } catch (haError) {
                logger.error('Failed to publish Home Assistant discovery messages', {
                    error: haError.message
                });
            }
            
            // Set up periodic discovery message publishing (every minute)
            // This ensures any newly configured devices get discovery messages
            discoveryTimer = setInterval(async () => {
                try {
                    logger.info('Publishing periodic Home Assistant discovery messages...');
                    const publishedCount = await haDiscovery.publishDiscoveryMessages(mqttClient);
                    logger.info(`Published Home Assistant discovery messages for ${publishedCount} devices`);
                } catch (haError) {
                    logger.error('Failed to publish periodic Home Assistant discovery messages', {
                        error: haError.message
                    });
                }
            }, 60000); // 60 seconds
        } else {
            logger.info('Home Assistant integration is disabled');
        }

        // Initialize the scheduled publisher
        scheduledPublisher = new ScheduledPublisher(mqttClient, publishDeviceData, publishGatewayStatus);

        // Start scheduled publishing if enabled
        scheduledPublisher.initialize();
    } catch (error) {
        logger.error('Failed to initialize MQTT client', {
            error: error.message,
            brokerUrl: config.mqtt.brokerUrl
        });
        logger.warn('Application will continue without MQTT connectivity');
        logger.warn('MQTT publishing will fail until connection is established');
    }
}

// Shutdown function to clean up resources
async function shutdown() {
    logger.info('Shutting down application...');
    
    // Clear the discovery timer
    if (discoveryTimer) {
        clearInterval(discoveryTimer);
        discoveryTimer = null;
        logger.info('Cleared discovery timer');
    }

    // Clear the scheduled publisher
    if (scheduledPublisher) {
        scheduledPublisher.shutdown();
        scheduledPublisher = null;
    }
    
    // Disconnect MQTT client
    try {
        await mqttClient.disconnect();
        logger.info('MQTT client disconnected');
    } catch (error) {
        logger.error('Error disconnecting MQTT client', { error: error.message });
    }
    
    logger.info('Application shutdown complete');
}

// Start the HTTP server
app.listen(config.server.port, config.server.host, async () => {
    logger.logStartup(config.server.port);
    logger.info(`POST endpoint available at: http://${config.server.host}:${config.server.port}/tokendata`);
    logger.info(`Health check available at: http://${config.server.host}:${config.server.port}/health`);
    
    // Initialize MQTT connection after server starts
    await initializeApplication();
});

// Handle graceful shutdown on process signals
process.on('SIGINT', async () => {
    logger.info('Received SIGINT, initiating graceful shutdown...');
    await shutdown();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, initiating graceful shutdown...');
    await shutdown();
    process.exit(0);
});

// Export for testing
module.exports = { 
    app,
    initializeApplication,
    shutdown
};

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

const app = express();

// Middleware to parse raw request bodies for MessagePack
// Handle requests with no Content-Type header by using a custom type function
app.use('/tokendata', express.raw({ 
    type: () => true, // Accept all requests regardless of Content-Type
    limit: '10mb' // Set reasonable limit for BLE data
}));

/**
 * POST /tokendata - Main endpoint for receiving BLE gateway data
 * Always expects MessagePack format (hardware doesn't send Content-Type headers)
 */
app.post('/tokendata', async (req, res) => {
    try {
        const sourceIP = req.ip || req.connection.remoteAddress;
        
        // Debug: Log raw request details
        logger.debug('Raw request debug info', {
            hasBody: !!req.body,
            bodyType: typeof req.body,
            bodyConstructor: req.body?.constructor?.name,
            bodyLength: req.body?.length,
            isBuffer: Buffer.isBuffer(req.body),
            rawBodySize: req.body ? req.body.length : 'undefined',
            headers: req.headers
        });
        
        // Log incoming request
        logger.logRequest('POST', '/tokendata', 'MessagePack (assumed)', sourceIP, req.body?.length || 0);
        
        // Validate request body exists
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
        
        // Task 5: Implement request body decoding (MessagePack only)
        let decodedData;
        
        try {
            logger.debug('Decoding MessagePack data...');
            decodedData = msgpack.decode(req.body);
            logger.debug('MessagePack data decoded successfully');
            
            // Log decoded data structure for verification (without full content for large payloads)
            const dataKeys = Object.keys(decodedData || {});
            logger.debug('Decoded data keys', { keys: dataKeys });
            
            const deviceCount = decodedData.devices && Array.isArray(decodedData.devices) ? decodedData.devices.length : 0;
            if (deviceCount > 0) {
                logger.info(`Found ${deviceCount} devices in payload`);
            }
            
            // Log top-level gateway information if present
            const gatewayInfo = {
                version: decodedData.v,
                messageId: decodedData.mid,
                ip: decodedData.ip,
                mac: decodedData.mac
            };
            logger.debug('Gateway info', gatewayInfo);
            
        } catch (decodeError) {
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
        
        // Task 7: Parse top-level gateway data structure
        const parsedData = gatewayParser.parseGatewayData(decodedData);
        const validation = gatewayParser.validateGatewayData(parsedData.gatewayInfo);
        
        // Log validation warnings
        if (validation.warnings.length > 0) {
            logger.warn('Gateway data validation warnings', { warnings: validation.warnings });
        }
        
        // Log errors and reject if data is invalid
        if (!validation.isValid) {
            logger.error('Gateway data validation failed', { errors: validation.errors });
            return res.status(400).json({ 
                error: 'Invalid gateway data',
                details: validation.errors
            });
        }
        
        // Log gateway information and device count
        const formattedGatewayInfo = gatewayParser.formatGatewayInfo(parsedData.gatewayInfo);
        logger.info('Gateway data parsed successfully', {
            gateway: formattedGatewayInfo,
            deviceCount: parsedData.deviceCount
        });
        
        // Task 8: Parse raw BLE device data from 'devices' array
        const deviceParsingResult = deviceParser.parseDevices(parsedData.devices);
        
        // Log device parsing results
        if (deviceParsingResult.errorCount > 0) {
            logger.warn('Some devices failed to parse', {
                totalDevices: deviceParsingResult.totalCount,
                successfulDevices: deviceParsingResult.successCount,
                failedDevices: deviceParsingResult.errorCount,
                errors: deviceParsingResult.errors
            });
        }
        
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
         // Log device parsing summary (only if there are issues or at debug level)
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
        if (deviceParsingResult.devices.length > 0) {
            const deviceStats = deviceParser.getDeviceStatistics(deviceParsingResult.devices);
            logger.debug('Device statistics', deviceStats);
        }
        
        // Task 9: Transform parsed device data to JSON payload
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
            
            // Log transformation results
            if (jsonTransformResult.errorCount > 0) {
                logger.warn('Some devices failed JSON transformation', {
                    totalDevices: jsonTransformResult.totalCount,
                    successfulTransformations: jsonTransformResult.successCount,
                    failedTransformations: jsonTransformResult.errorCount,
                    errors: jsonTransformResult.errors
                });
            }
            
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
             // Log JSON transformation summary (only if there are issues or at debug level)
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
            if (jsonTransformResult.payloads.length > 0) {
                const jsonStats = jsonTransformer.getJsonStatistics(jsonTransformResult.payloads);
                logger.debug('JSON payload statistics', jsonStats);
            }
            
            // Task 11: Implement MQTT publishing
            if (jsonTransformResult.payloads.length > 0) {
                try {
                    logger.debug('Publishing device data to MQTT broker', {
                        payloadCount: jsonTransformResult.payloads.length,
                        firstDeviceMac: jsonTransformResult.payloads[0]?.mac_address,
                        gatewayInfo: {
                            mac: gatewayMetadata.mac,
                            ip: gatewayMetadata.ip
                        }
                    });
                    
                    // Publish all JSON payloads to MQTT
                    const mqttResults = await mqttClient.publishMultipleDeviceData(jsonTransformResult.payloads);
                    
                    // Log MQTT publishing results - only errors at INFO level
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
                        // Note: We don't return an error response here as the data was processed successfully
                        // MQTT publishing failures are logged but don't affect the HTTP response
                    } else {
                        // Success logging moved to debug level
                        logger.debug('MQTT publishing completed successfully', {
                            totalPayloads: mqttResults.totalCount,
                            successfulPublications: mqttResults.successCount,
                            failedPublications: mqttResults.errorCount
                        });
                    }
                    
                } catch (mqttError) {
                    logger.error('MQTT publishing failed with exception', {
                        error: mqttError.message,
                        payloadCount: jsonTransformResult.payloads.length
                    });
                    // Note: We don't return an error response here as the data was processed successfully
                    // MQTT publishing failures are logged but don't affect the HTTP response
                }
            } else {
                logger.info('No JSON payloads to publish to MQTT');
            }
        } else {
            logger.info('No devices to transform - skipping JSON transformation');
        }
        
        // Task 12: Publish gateway status information to MQTT
        try {
            logger.debug('Publishing gateway status to MQTT broker', {
                gatewayInfo: {
                    version: parsedData.gatewayInfo.version,
                    messageId: parsedData.gatewayInfo.messageId,
                    ip: parsedData.gatewayInfo.ip,
                    mac: parsedData.gatewayInfo.mac
                }
            });
            
            await mqttClient.publishGatewayData(parsedData.gatewayInfo);
            logger.debug('Gateway status published to MQTT successfully');
            
        } catch (gatewayMqttError) {
            logger.error('Gateway MQTT publishing failed', {
                error: gatewayMqttError.message,
                gatewayMac: parsedData.gatewayInfo.mac
            });
            // Note: We don't return an error response here as the data was processed successfully
            // Gateway MQTT publishing failures are logged but don't affect the HTTP response
        }
        
        // Log that we processed the data successfully with consolidated summary
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
        
        // Keep the detailed logging for compatibility with existing log processing
        logger.logProcessingSuccess(deviceParsingResult.successCount, {
            version: parsedData.gatewayInfo.version,
            messageId: parsedData.gatewayInfo.messageId,
            ip: parsedData.gatewayInfo.ip,
            mac: parsedData.gatewayInfo.mac
        });
        
        // Return 204 No Content as specified in the technical spec
        res.status(204).send();
        
    } catch (error) {
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
                    const publishedCount = await haDiscovery.publishDiscoveryMessages(mqttClient);
                    if (publishedCount > 0) {
                        logger.info(`Published Home Assistant discovery messages for ${publishedCount} new devices`);
                    }
                } catch (haError) {
                    logger.error('Failed to publish periodic Home Assistant discovery messages', {
                        error: haError.message
                    });
                }
            }, 60000); // 60 seconds
        } else {
            logger.info('Home Assistant integration is disabled');
        }
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
    initializeApplication,
    shutdown
};

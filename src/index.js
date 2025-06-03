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

const app = express();

// Middleware to parse raw request bodies for MessagePack and JSON
app.use('/tokendata', express.raw({ 
    type: ['application/msgpack', 'application/json'],
    limit: '10mb' // Set reasonable limit for BLE data
}));

/**
 * POST /tokendata - Main endpoint for receiving BLE gateway data
 * Accepts both application/msgpack and application/json content types
 */
app.post('/tokendata', (req, res) => {
    try {
        const contentType = req.get('Content-Type');
        const sourceIP = req.ip || req.connection.remoteAddress;
        
        // Log incoming request
        logger.logRequest('POST', '/tokendata', contentType, sourceIP, req.body?.length || 0);
        
        // Validate Content-Type
        if (!contentType || (!contentType.includes('application/msgpack') && !contentType.includes('application/json'))) {
            logger.warn(`Invalid Content-Type: ${contentType}`, { sourceIP });
            return res.status(400).json({ 
                error: 'Content-Type must be application/msgpack or application/json' 
            });
        }
        
        // Validate request body exists
        if (!req.body || req.body.length === 0) {
            logger.warn('Empty request body received', { sourceIP });
            return res.status(400).json({ 
                error: 'Request body is required' 
            });
        }
        
        logger.debug(`Processing ${req.body.length} bytes of data`);
        
        // Task 5: Implement request body decoding
        let decodedData;
        
        try {
            if (contentType.includes('application/msgpack')) {
                logger.debug('Decoding MessagePack data...');
                decodedData = msgpack.decode(req.body);
                logger.debug('MessagePack data decoded successfully');
            } else if (contentType.includes('application/json')) {
                logger.debug('Parsing JSON data...');
                decodedData = JSON.parse(req.body.toString());
                logger.debug('JSON data parsed successfully');
            }
            
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
            logger.logProcessingError('request body decoding', decodeError, { 
                contentType, 
                sourceIP, 
                bodyLength: req.body.length 
            });
            return res.status(400).json({
                error: 'Invalid request body format',
                details: decodeError.message
            });
        }
        
        logger.logProcessingStart('parsing gateway data', { 
            contentType,
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
        
        // Log successful device parsing
        logger.info('Device parsing completed', {
            totalDevices: deviceParsingResult.totalCount,
            successfulDevices: deviceParsingResult.successCount,
            failedDevices: deviceParsingResult.errorCount
        });
        
        // Get device statistics for logging
        if (deviceParsingResult.devices.length > 0) {
            const deviceStats = deviceParser.getDeviceStatistics(deviceParsingResult.devices);
            logger.debug('Device statistics', deviceStats);
        }
        
        // TODO: Implement JSON transformation (Task 9)
        // TODO: Implement MQTT publishing (Task 11)
        
        // For now, just log that we processed the data successfully
        logger.logProcessingSuccess('complete data processing', {
            gatewayDeviceCount: parsedData.deviceCount,
            parsedDeviceCount: deviceParsingResult.successCount,
            gatewayMac: parsedData.gatewayInfo.mac
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

// Start the HTTP server
app.listen(config.server.port, () => {
    logger.logStartup(config.server.port);
    logger.info(`POST endpoint available at: http://localhost:${config.server.port}/tokendata`);
    logger.info(`Health check available at: http://localhost:${config.server.port}/health`);
});

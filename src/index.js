/**
 * BLE Gateway Data Processor
 * Main entry point for the application
 */

const express = require('express');
const msgpack = require('msgpack5')();
const { config, logConfigStatus } = require('./config');

const app = express();

// Basic startup logging
console.log('BLE Gateway Data Processor starting...');
logConfigStatus();

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
        console.log(`Received request from ${sourceIP} with Content-Type: ${contentType}`);
        
        // Validate Content-Type
        if (!contentType || (!contentType.includes('application/msgpack') && !contentType.includes('application/json'))) {
            console.warn(`Invalid Content-Type: ${contentType}`);
            return res.status(400).json({ 
                error: 'Content-Type must be application/msgpack or application/json' 
            });
        }
        
        // Validate request body exists
        if (!req.body || req.body.length === 0) {
            console.warn('Empty request body received');
            return res.status(400).json({ 
                error: 'Request body is required' 
            });
        }
        
        console.log(`Processing ${req.body.length} bytes of data`);
        
        // TODO: Implement request body decoding (Task 4)
        // TODO: Implement gateway data parsing (Task 6)
        // TODO: Implement BLE device parsing (Task 7)
        // TODO: Implement JSON transformation (Task 8)
        // TODO: Implement MQTT publishing (Task 10)
        
        // For now, just log that we received the data and return success
        console.log('Data received successfully (processing not yet implemented)');
        
        // Return 204 No Content as specified in the technical spec
        res.status(204).send();
        
    } catch (error) {
        console.error('Error processing request:', error);
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
    console.error('Unhandled error:', error);
    res.status(500).json({ 
        error: 'Internal server error' 
    });
});

/**
 * Handle 404 for all other routes (must be last)
 */
app.use((req, res) => {
    res.status(404).json({ 
        error: 'Endpoint not found' 
    });
});

// Start the HTTP server
app.listen(config.server.port, () => {
    console.log(`BLE Gateway Data Processor listening on port ${config.server.port}`);
    console.log(`POST endpoint available at: http://localhost:${config.server.port}/tokendata`);
    console.log(`Health check available at: http://localhost:${config.server.port}/health`);
});

/**
 * BLE Gateway Data Processor
 * Main entry point for the application
 */

// Load environment variables
require('dotenv').config();

const express = require('express');
const msgpack = require('msgpack5')();

const app = express();

// Configuration from environment variables
const SERVER_PORT = process.env.SERVER_PORT || 8000;

// Basic startup logging
console.log('BLE Gateway Data Processor starting...');
console.log(`Server will listen on port: ${SERVER_PORT}`);

// TODO: Implement HTTP ingestion endpoint (Task 3)
// TODO: Implement configuration management (Task 2)
// TODO: Implement logging framework (Task 5)
// TODO: Implement data processing layer (Tasks 4, 6, 7, 8)
// TODO: Implement MQTT client (Tasks 9, 10)

// Start the HTTP server
app.listen(SERVER_PORT, () => {
    console.log(`BLE Gateway Data Processor listening on port ${SERVER_PORT}`);
});

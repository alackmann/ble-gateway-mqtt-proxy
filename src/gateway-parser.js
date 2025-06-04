/**
 * Gateway Data Parser Module
 * Parses top-level gateway information from decoded BLE gateway data
 */

const logger = require('./logger');

/**
 * Parse top-level gateway data structure
 * @param {Object} decodedData - Decoded gateway data from MessagePack/JSON
 * @returns {Object} Parsed gateway information and devices array
 */
function parseGatewayData(decodedData) {
    logger.debug('Parsing gateway data structure', { keys: Object.keys(decodedData || {}) });
    
    // Validate input
    if (!decodedData || typeof decodedData !== 'object') {
        throw new Error('Invalid gateway data: must be an object');
    }

    // Extract top-level gateway information
    const gatewayInfo = {
        version: decodedData.v,
        messageId: decodedData.mid,
        time: decodedData.time,
        ip: decodedData.ip,
        mac: decodedData.mac,
        rssi: decodedData.rssi, // WiFi RSSI (optional, from v1.5.0)
        iccid: decodedData.iccid  // 4G module ICCID (optional, from v1.5.3)
    };

    // Validate devices array
    if (!decodedData.devices) {
        logger.warn('No devices array found in gateway data');
        return {
            gatewayInfo,
            devices: [],
            deviceCount: 0
        };
    }

    if (!Array.isArray(decodedData.devices)) {
        throw new Error('Invalid devices data: must be an array');
    }

    const deviceCount = decodedData.devices.length;
    logger.debug(`Found ${deviceCount} devices in gateway data`);

    // Log gateway information for debugging
    logger.debug('Extracted gateway information', {
        version: gatewayInfo.version,
        messageId: gatewayInfo.messageId,
        ip: gatewayInfo.ip,
        mac: gatewayInfo.mac,
        deviceCount
    });

    // Validate required gateway fields
    const missingFields = [];
    if (!gatewayInfo.version) missingFields.push('version (v)');
    if (gatewayInfo.messageId === undefined) missingFields.push('messageId (mid)');
    
    if (missingFields.length > 0) {
        logger.warn('Missing required gateway fields', { missingFields });
    }

    return {
        gatewayInfo,
        devices: decodedData.devices,
        deviceCount
    };
}

/**
 * Validate gateway data structure
 * @param {Object} gatewayInfo - Parsed gateway information
 * @returns {Object} Validation result with warnings
 */
function validateGatewayData(gatewayInfo) {
    const warnings = [];
    const errors = [];

    // Check required fields
    if (!gatewayInfo.version) {
        errors.push('Missing firmware version (v)');
    }

    if (gatewayInfo.messageId === undefined || gatewayInfo.messageId === null) {
        errors.push('Missing message ID (mid)');
    }

    // Check optional but expected fields
    if (!gatewayInfo.ip) {
        warnings.push('Missing gateway IP address');
    }

    if (!gatewayInfo.mac) {
        warnings.push('Missing gateway MAC address');
    }

    // Validate data types
    if (gatewayInfo.version && typeof gatewayInfo.version !== 'string') {
        warnings.push('Version should be a string');
    }

    if (gatewayInfo.messageId !== undefined && typeof gatewayInfo.messageId !== 'number') {
        warnings.push('Message ID should be a number');
    }

    if (gatewayInfo.time !== undefined && typeof gatewayInfo.time !== 'number') {
        warnings.push('Time should be a number');
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Format gateway information for logging and MQTT publishing
 * @param {Object} gatewayInfo - Parsed gateway information
 * @returns {Object} Formatted gateway information
 */
function formatGatewayInfo(gatewayInfo) {
    // Only include non-null, non-undefined values
    const formatted = {};

    if (gatewayInfo.version) formatted.version = gatewayInfo.version;
    if (gatewayInfo.messageId !== undefined && gatewayInfo.messageId !== null) formatted.messageId = gatewayInfo.messageId;
    if (gatewayInfo.time !== undefined && gatewayInfo.time !== null) formatted.time = gatewayInfo.time;
    if (gatewayInfo.ip) formatted.ip = gatewayInfo.ip;
    if (gatewayInfo.mac) formatted.mac = gatewayInfo.mac;
    if (gatewayInfo.rssi !== undefined && gatewayInfo.rssi !== null) formatted.rssi = gatewayInfo.rssi;
    if (gatewayInfo.iccid !== undefined && gatewayInfo.iccid !== null) formatted.iccid = gatewayInfo.iccid;

    return formatted;
}

/**
 * Extract gateway metadata for device messages
 * Returns only the essential gateway information needed for device messages
 * @param {Object} gatewayInfo - Parsed gateway information
 * @returns {Object} Gateway metadata for device messages
 */
function getGatewayMetadata(gatewayInfo) {
    const metadata = {};

    // Only include gateway MAC and IP if available (as per FR-003.3)
    if (gatewayInfo.mac) {
        metadata.gateway_mac = gatewayInfo.mac;
    }

    if (gatewayInfo.ip) {
        metadata.gateway_ip = gatewayInfo.ip;
    }

    return metadata;
}

module.exports = {
    parseGatewayData,
    validateGatewayData,
    formatGatewayInfo,
    getGatewayMetadata
};
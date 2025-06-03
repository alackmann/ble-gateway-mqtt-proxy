/**
 * JSON Transformer Module
 * Transforms parsed BLE device data into JSON payload format as per FR-003.3
 */

const logger = require('./logger');

/**
 * Transform a single parsed device into the final JSON payload format
 * @param {Object} parsedDevice - Parsed device data from device-parser
 * @param {Object} options - Optional fields for transformation
 * @param {string} options.gatewayMac - MAC address of the reporting gateway
 * @param {string} options.gatewayIp - IP address of the reporting gateway
 * @param {Date|string} options.timestamp - Custom timestamp (defaults to current time)
 * @returns {Object} JSON payload according to FR-003.3
 */
function transformDeviceToJson(parsedDevice, options = {}) {
    logger.debug('Transforming device to JSON payload', { 
        deviceMac: parsedDevice?.mac_address,
        hasGatewayMac: !!options.gatewayMac,
        hasGatewayIp: !!options.gatewayIp
    });

    try {
        // Validate input device data
        if (!parsedDevice || typeof parsedDevice !== 'object') {
            throw new Error('Parsed device data must be an object');
        }

        // Validate required fields are present
        const requiredFields = ['mac_address', 'rssi', 'advertising_type_code', 'advertising_type_description', 'advertisement_data_hex'];
        for (const field of requiredFields) {
            if (parsedDevice[field] === undefined || parsedDevice[field] === null) {
                throw new Error(`Missing required field: ${field}`);
            }
        }

        // Generate ISO 8601 timestamp
        const timestamp = options.timestamp ? 
            (options.timestamp instanceof Date ? options.timestamp : new Date(options.timestamp)) : 
            new Date();
        const lastSeenTimestamp = timestamp.toISOString();

        // Construct the JSON payload according to FR-003.3
        const jsonPayload = {
            mac_address: parsedDevice.mac_address,
            rssi: parsedDevice.rssi,
            advertising_type_code: parsedDevice.advertising_type_code,
            advertising_type_description: parsedDevice.advertising_type_description,
            advertisement_data_hex: parsedDevice.advertisement_data_hex,
            last_seen_timestamp: lastSeenTimestamp
        };

        // Add optional gateway fields if available
        if (options.gatewayMac && typeof options.gatewayMac === 'string') {
            jsonPayload.gateway_mac = options.gatewayMac;
        }

        if (options.gatewayIp && typeof options.gatewayIp === 'string') {
            jsonPayload.gateway_ip = options.gatewayIp;
        }

        logger.debug('Successfully transformed device to JSON', {
            deviceMac: jsonPayload.mac_address,
            timestamp: lastSeenTimestamp,
            hasGateway: !!(jsonPayload.gateway_mac || jsonPayload.gateway_ip)
        });

        return jsonPayload;
    } catch (error) {
        const errorMsg = `Failed to transform device to JSON: ${error.message}`;
        logger.error(errorMsg, { 
            deviceMac: parsedDevice?.mac_address,
            error: error.message 
        });
        throw new Error(errorMsg);
    }
}

/**
 * Transform multiple parsed devices into JSON payloads
 * @param {Array} parsedDevices - Array of parsed device data from device-parser
 * @param {Object} options - Optional fields for transformation
 * @param {string} options.gatewayMac - MAC address of the reporting gateway
 * @param {string} options.gatewayIp - IP address of the reporting gateway
 * @param {Date|string} options.timestamp - Custom timestamp (defaults to current time)
 * @returns {Object} Transformation results with successful payloads and errors
 */
function transformDevicesToJson(parsedDevices, options = {}) {
    if (!parsedDevices || !Array.isArray(parsedDevices)) {
        throw new Error('Invalid parsed devices data: must be an array');
    }
    
    logger.debug('Starting JSON transformation for multiple devices', { 
        deviceCount: parsedDevices.length,
        hasGatewayMac: !!options.gatewayMac,
        hasGatewayIp: !!options.gatewayIp
    });

    const results = {
        payloads: [],
        errors: [],
        totalCount: parsedDevices.length,
        successCount: 0,
        errorCount: 0
    };

    // Process each device
    for (let i = 0; i < parsedDevices.length; i++) {
        const device = parsedDevices[i];
        
        try {
            const jsonPayload = transformDeviceToJson(device, options);
            results.payloads.push(jsonPayload);
            results.successCount++;
        } catch (error) {
            const errorInfo = {
                deviceIndex: i,
                deviceMac: device?.mac_address || 'unknown',
                error: error.message
            };
            results.errors.push(errorInfo);
            results.errorCount++;
            
            logger.warn(`Failed to transform device ${i} to JSON`, errorInfo);
        }
    }

    logger.info('JSON transformation completed', {
        totalDevices: results.totalCount,
        successfulTransformations: results.successCount,
        failedTransformations: results.errorCount
    });

    return results;
}

/**
 * Validate a JSON payload according to FR-003.3 requirements
 * @param {Object} jsonPayload - JSON payload to validate
 * @returns {Object} Validation result with isValid flag, errors, and warnings
 */
function validateJsonPayload(jsonPayload) {
    const validation = {
        isValid: true,
        errors: [],
        warnings: []
    };

    try {
        // Check if payload is an object
        if (!jsonPayload || typeof jsonPayload !== 'object') {
            validation.errors.push('JSON payload must be an object');
            validation.isValid = false;
            return validation;
        }

        // Validate required fields
        const requiredFields = {
            mac_address: 'string',
            rssi: 'number',
            advertising_type_code: 'number',
            advertising_type_description: 'string',
            advertisement_data_hex: 'string',
            last_seen_timestamp: 'string'
        };

        for (const [field, expectedType] of Object.entries(requiredFields)) {
            if (jsonPayload[field] === undefined || jsonPayload[field] === null) {
                validation.errors.push(`Missing required field: ${field}`);
                validation.isValid = false;
            } else if (typeof jsonPayload[field] !== expectedType) {
                validation.errors.push(`Field ${field} must be of type ${expectedType}, got ${typeof jsonPayload[field]}`);
                validation.isValid = false;
            }
        }

        // Validate MAC address format (XX:XX:XX:XX:XX:XX)
        if (jsonPayload.mac_address && typeof jsonPayload.mac_address === 'string') {
            const macRegex = /^[0-9A-F]{2}:[0-9A-F]{2}:[0-9A-F]{2}:[0-9A-F]{2}:[0-9A-F]{2}:[0-9A-F]{2}$/;
            if (!macRegex.test(jsonPayload.mac_address)) {
                validation.errors.push('MAC address must be in format XX:XX:XX:XX:XX:XX with uppercase hex digits');
                validation.isValid = false;
            }
        }

        // Validate RSSI range (typically between -120 and 0)
        if (typeof jsonPayload.rssi === 'number') {
            if (jsonPayload.rssi > 0 || jsonPayload.rssi < -120) {
                validation.warnings.push(`RSSI value ${jsonPayload.rssi} is outside typical range (-120 to 0)`);
            }
        }

        // Validate advertising type code (0-4 as per FR-003.3)
        if (typeof jsonPayload.advertising_type_code === 'number') {
            if (jsonPayload.advertising_type_code < 0 || jsonPayload.advertising_type_code > 4) {
                validation.warnings.push(`Advertising type code ${jsonPayload.advertising_type_code} is outside defined range (0-4)`);
            }
        }

        // Validate hex string format
        if (jsonPayload.advertisement_data_hex && typeof jsonPayload.advertisement_data_hex === 'string') {
            const hexRegex = /^[0-9A-F]*$/;
            if (!hexRegex.test(jsonPayload.advertisement_data_hex)) {
                validation.errors.push('Advertisement data hex must contain only uppercase hex digits (0-9, A-F)');
                validation.isValid = false;
            }
        }

        // Validate ISO 8601 timestamp format
        if (jsonPayload.last_seen_timestamp && typeof jsonPayload.last_seen_timestamp === 'string') {
            try {
                const parsedDate = new Date(jsonPayload.last_seen_timestamp);
                if (isNaN(parsedDate.getTime())) {
                    validation.errors.push('Invalid ISO 8601 timestamp format');
                    validation.isValid = false;
                } else if (parsedDate.toISOString() !== jsonPayload.last_seen_timestamp) {
                    validation.warnings.push('Timestamp is not in standard ISO 8601 format');
                }
            } catch (error) {
                validation.errors.push('Invalid timestamp format');
                validation.isValid = false;
            }
        }

        // Validate optional gateway fields
        if (jsonPayload.gateway_mac !== undefined) {
            if (typeof jsonPayload.gateway_mac !== 'string') {
                validation.errors.push('Gateway MAC must be a string');
                validation.isValid = false;
            } else {
                const macRegex = /^[0-9A-F]{2}:[0-9A-F]{2}:[0-9A-F]{2}:[0-9A-F]{2}:[0-9A-F]{2}:[0-9A-F]{2}$/;
                if (!macRegex.test(jsonPayload.gateway_mac)) {
                    validation.errors.push('Gateway MAC address must be in format XX:XX:XX:XX:XX:XX with uppercase hex digits');
                    validation.isValid = false;
                }
            }
        }

        if (jsonPayload.gateway_ip !== undefined) {
            if (typeof jsonPayload.gateway_ip !== 'string') {
                validation.errors.push('Gateway IP must be a string');
                validation.isValid = false;
            }
            // Note: We could add IP address format validation here if needed
        }

    } catch (error) {
        validation.errors.push(`Validation error: ${error.message}`);
        validation.isValid = false;
    }

    return validation;
}

/**
 * Get statistics about JSON payloads
 * @param {Array} jsonPayloads - Array of JSON payloads
 * @returns {Object} Statistics about the payloads
 */
function getJsonStatistics(jsonPayloads) {
    if (!Array.isArray(jsonPayloads) || jsonPayloads.length === 0) {
        return {
            totalCount: 0,
            rssiRange: { min: null, max: null, average: null },
            advertisingTypes: {},
            timestampRange: { earliest: null, latest: null },
            gatewayInfo: { withMac: 0, withIp: 0, withBoth: 0 }
        };
    }

    const stats = {
        totalCount: jsonPayloads.length,
        rssiRange: { min: Infinity, max: -Infinity, sum: 0, count: 0 },
        advertisingTypes: {},
        timestampRange: { earliest: null, latest: null },
        gatewayInfo: { withMac: 0, withIp: 0, withBoth: 0 }
    };

    for (const payload of jsonPayloads) {
        // RSSI statistics
        if (typeof payload.rssi === 'number') {
            stats.rssiRange.min = Math.min(stats.rssiRange.min, payload.rssi);
            stats.rssiRange.max = Math.max(stats.rssiRange.max, payload.rssi);
            stats.rssiRange.sum += payload.rssi;
            stats.rssiRange.count++;
        }

        // Advertising type counts
        if (typeof payload.advertising_type_code === 'number') {
            const typeKey = `${payload.advertising_type_code}: ${payload.advertising_type_description || 'Unknown'}`;
            stats.advertisingTypes[typeKey] = (stats.advertisingTypes[typeKey] || 0) + 1;
        }

        // Timestamp range
        if (payload.last_seen_timestamp) {
            const timestamp = new Date(payload.last_seen_timestamp);
            if (!isNaN(timestamp.getTime())) {
                if (!stats.timestampRange.earliest || timestamp < stats.timestampRange.earliest) {
                    stats.timestampRange.earliest = timestamp;
                }
                if (!stats.timestampRange.latest || timestamp > stats.timestampRange.latest) {
                    stats.timestampRange.latest = timestamp;
                }
            }
        }

        // Gateway information presence
        const hasMac = !!payload.gateway_mac;
        const hasIp = !!payload.gateway_ip;
        
        if (hasMac) stats.gatewayInfo.withMac++;
        if (hasIp) stats.gatewayInfo.withIp++;
        if (hasMac && hasIp) stats.gatewayInfo.withBoth++;
    }

    // Calculate RSSI average
    if (stats.rssiRange.min !== Infinity && stats.rssiRange.count > 0) {
        stats.rssiRange.average = Math.round(stats.rssiRange.sum / stats.rssiRange.count * 100) / 100;
        delete stats.rssiRange.sum;
        delete stats.rssiRange.count;
    } else {
        stats.rssiRange = { min: null, max: null, average: null };
    }

    // Convert timestamp objects to ISO strings for logging
    if (stats.timestampRange.earliest) {
        stats.timestampRange.earliest = stats.timestampRange.earliest.toISOString();
    }
    if (stats.timestampRange.latest) {
        stats.timestampRange.latest = stats.timestampRange.latest.toISOString();
    }

    return stats;
}

module.exports = {
    transformDeviceToJson,
    transformDevicesToJson,
    validateJsonPayload,
    getJsonStatistics
};

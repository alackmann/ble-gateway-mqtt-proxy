/**
 * BLE Device Parser Module
 * Parses raw BLE advertising data from the devices array
 */

const logger = require('./logger');

/**
 * Advertising type code descriptions as per FR-003.3 and FRD Section 4.2.3
 */
const ADVERTISING_TYPE_DESCRIPTIONS = {
    0: 'Connectable undirected advertisement',
    1: 'Connectable directed advertisement',
    2: 'Scannable undirected advertisement',
    3: 'Non-Connectable undirected advertisement',
    4: 'Scan Response'
};

/**
 * Parse a single BLE device from raw advertising data
 * @param {Buffer} deviceData - Raw advertising data buffer
 * @param {number} deviceIndex - Index of device for error reporting
 * @returns {Object} Parsed device data
 */
function parseDevice(deviceData, deviceIndex = 0) {
    logger.debug(`Parsing device ${deviceIndex}`, { 
        dataLength: deviceData ? deviceData.length : 0,
        dataType: typeof deviceData
    });

    try {
        // Validate input
        if (!Buffer.isBuffer(deviceData)) {
            throw new Error(`Device data must be a Buffer`);
        }

        // Minimum required length: 1 byte (type) + 6 bytes (MAC) + 1 byte (RSSI) = 8 bytes
        if (deviceData.length < 8) {
            throw new Error(`Device data must be at least 8 bytes (advertising type + MAC + RSSI)`);
        }

        // Extract fields according to FRD Section 4.2.1 byte structure
        const advertisingTypeCode = deviceData.readUInt8(0);    // Byte 1
        const macAddressBuffer = deviceData.slice(1, 7);        // Bytes 2-7 (6 bytes)
        const rssiRaw = deviceData.readUInt8(7);                // Byte 8
        const advertisementDataBuffer = deviceData.slice(8);    // Bytes 9+

        // Format MAC address as colon-separated hex string (MSB first)
        const macAddress = Array.from(macAddressBuffer)
            .map(byte => byte.toString(16).padStart(2, '0').toUpperCase())
            .join(':');

        // Calculate RSSI by subtracting 256 from byte value (as per FRD Section 4.2.1)
        const rssi = rssiRaw - 256;

        // Convert advertisement data to hexadecimal string
        const advertisementDataHex = advertisementDataBuffer.toString('hex').toUpperCase();

        // Get advertising type description
        const advertisingTypeDescription = ADVERTISING_TYPE_DESCRIPTIONS[advertisingTypeCode] || 
                                         `Unknown advertising type (${advertisingTypeCode})`;

        const parsedDevice = {
            advertising_type_code: advertisingTypeCode,
            advertising_type_description: advertisingTypeDescription,
            mac_address: macAddress,
            rssi: rssi,
            advertisement_data_hex: advertisementDataHex
        };

        logger.debug(`Successfully parsed device ${deviceIndex}`, {
            mac: macAddress,
            rssi: rssi,
            advertisingType: advertisingTypeCode,
            dataLength: advertisementDataBuffer.length
        });

        return parsedDevice;
    } catch (error) {
        const errorMsg = `Failed to parse device ${deviceIndex}: ${error.message}`;
        logger.error(errorMsg, { 
            deviceDataLength: deviceData.length,
            error: error.message 
        });
        throw new Error(errorMsg);
    }
}

/**
 * Parse all devices from the devices array
 * @param {Array} devicesArray - Array of raw device data buffers
 * @returns {Object} Parsing results with successful devices and errors
 */
function parseDevices(devicesArray) {
    if (!devicesArray || !Array.isArray(devicesArray)) {
        throw new Error('Invalid devices data: must be an array');
    }
    
    logger.debug('Starting device parsing', { deviceCount: devicesArray.length });

    const results = {
        devices: [],
        errors: [],
        totalCount: devicesArray.length,
        successCount: 0,
        errorCount: 0
    };

    devicesArray.forEach((deviceData, index) => {
        try {
            const parsedDevice = parseDevice(deviceData, index);
            results.devices.push(parsedDevice);
            results.successCount++;
        } catch (error) {
            const errorInfo = {
                index: index,
                error: error.message,
                deviceDataLength: deviceData ? deviceData.length : 0
            };
            results.errors.push(errorInfo);
            results.errorCount++;
            
            // Log individual device parsing errors as warnings
            logger.warn(`Device parsing error at index ${index}`, errorInfo);
        }
    });

    logger.info(`Device parsing completed`, {
        total: results.totalCount,
        successful: results.successCount,
        errors: results.errorCount
    });

    return results;
}

/**
 * Validate a parsed device object
 * @param {Object} parsedDevice - Parsed device data
 * @returns {Object} Validation result
 */
function validateParsedDevice(parsedDevice) {
    const errors = [];
    const warnings = [];

    // Check required fields
    if (typeof parsedDevice.advertising_type_code !== 'number') {
        errors.push('Missing or invalid advertising_type_code');
    }

    if (!parsedDevice.mac_address || typeof parsedDevice.mac_address !== 'string') {
        errors.push('Missing or invalid mac_address');
    } else {
        // Validate MAC address format (XX:XX:XX:XX:XX:XX)
        const macPattern = /^[0-9A-F]{2}:[0-9A-F]{2}:[0-9A-F]{2}:[0-9A-F]{2}:[0-9A-F]{2}:[0-9A-F]{2}$/i;
        if (!macPattern.test(parsedDevice.mac_address)) {
            errors.push('Invalid MAC address format');
        }
    }

    if (typeof parsedDevice.rssi !== 'number') {
        errors.push('Missing or invalid RSSI');
    } else {
        // RSSI should be negative (typical range: -100 to -30 dBm)
        if (parsedDevice.rssi > 0) {
            warnings.push('RSSI value is positive, which is unusual');
        }
        if (parsedDevice.rssi < -100 || parsedDevice.rssi > -30) {
            warnings.push(`Unusual RSSI value: ${parsedDevice.rssi} (typical range: -30 to -100)`);
        }
    }

    if (!parsedDevice.advertising_type_description || typeof parsedDevice.advertising_type_description !== 'string') {
        errors.push('Missing or invalid advertising_type_description');
    }

    if (typeof parsedDevice.advertisement_data_hex !== 'string') {
        errors.push('Missing or invalid advertisement_data_hex');
    } else {
        // Validate hex string format
        const hexPattern = /^[0-9A-F]*$/i;
        if (!hexPattern.test(parsedDevice.advertisement_data_hex)) {
            errors.push('Invalid advertisement_data_hex format (must be valid hexadecimal)');
        }
        if (parsedDevice.advertisement_data_hex.length % 2 !== 0) {
            errors.push('Invalid advertisement_data_hex format (must have even number of characters)');
        }
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Get statistics about parsed devices
 * @param {Array} parsedDevices - Array of parsed device objects
 * @returns {Object} Device statistics
 */
function getDeviceStatistics(parsedDevices) {
    if (!Array.isArray(parsedDevices)) {
        return {
            totalDevices: 0,
            advertisingTypes: {},
            rssiRange: { min: 0, max: 0 },
            averageRSSI: 0,
            macAddresses: new Set(),
            advertisementDataSizes: [],
            averageDataLength: 0,
            uniqueDevices: 0
        };
    }

    const stats = {
        totalDevices: parsedDevices.length,
        advertisingTypes: {},
        rssiRange: { min: 0, max: 0 },
        averageRSSI: 0,
        macAddresses: new Set(),
        advertisementDataSizes: [],
        averageDataLength: 0
    };

    if (parsedDevices.length === 0) {
        stats.uniqueDevices = 0;
        return stats;
    }

    let rssiSum = 0;

    parsedDevices.forEach(device => {
        // Count advertising types (use just the number as key)
        const typeKey = device.advertising_type_code;
        stats.advertisingTypes[typeKey] = (stats.advertisingTypes[typeKey] || 0) + 1;

        // Track RSSI range
        if (stats.rssiRange.min === 0 || device.rssi < stats.rssiRange.min) {
            stats.rssiRange.min = device.rssi;
        }
        if (stats.rssiRange.max === 0 || device.rssi > stats.rssiRange.max) {
            stats.rssiRange.max = device.rssi;
        }
        rssiSum += device.rssi;

        // Track unique MAC addresses
        if (device.mac_address) {
            stats.macAddresses.add(device.mac_address);
        }

        // Track advertisement data sizes
        const dataLength = device.advertisement_data_hex ? device.advertisement_data_hex.length / 2 : 0;
        stats.advertisementDataSizes.push(dataLength);
    });

    // Calculate averages
    stats.averageRSSI = rssiSum / parsedDevices.length;
    stats.averageDataLength = stats.advertisementDataSizes.reduce((sum, size) => sum + size, 0) / stats.advertisementDataSizes.length;

    // Calculate average RSSI
    stats.rssiRange.average = Math.round((rssiSum / parsedDevices.length) * 100) / 100;

    // Convert Set to count for serialization
    stats.uniqueDevices = stats.macAddresses.size;
    delete stats.macAddresses; // Remove Set for clean JSON serialization

    return stats;
}

module.exports = {
    parseDevice,
    parseDevices,
    validateParsedDevice,
    getDeviceStatistics,
    ADVERTISING_TYPE_DESCRIPTIONS
};

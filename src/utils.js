/**
 * Utility functions for the BLE Gateway MQTT Proxy
 */

/**
 * Formats a MAC address without colons to a colon-separated uppercase format
 * Example: "123b6a1b85ef" -> "12:3B:6A:1B:85:EF"
 * 
 * @param {string} macWithoutColons - MAC address without colons (12 hex characters)
 * @returns {string} MAC address with colons in uppercase format
 * @throws {Error} If the MAC address format is invalid
 */
function formatMac(macWithoutColons) {
    if (!macWithoutColons || typeof macWithoutColons !== 'string') {
        throw new Error('MAC address must be a non-empty string');
    }
    
    // Normalize: trim, remove any existing colons, convert to lowercase
    const normalizedMac = macWithoutColons.trim().replace(/:/g, '').toLowerCase();
    
    // Validate the MAC has exactly 12 hex characters
    if (!/^[0-9a-f]{12}$/.test(normalizedMac)) {
        throw new Error(`Invalid MAC address format: ${macWithoutColons}. Expected 12 hex characters.`);
    }
    
    // Insert colons after every 2 characters and convert to uppercase
    return normalizedMac.match(/.{1,2}/g).join(':').toUpperCase();
}

/**
 * Normalizes a MAC address by removing colons and converting to lowercase
 * Example: "12:3B:6A:1B:85:EF" -> "123b6a1b85ef"
 * 
 * @param {string} macAddress - MAC address with or without colons
 * @returns {string} MAC address without colons in lowercase format
 * @throws {Error} If the MAC address format is invalid
 */
function normalizeMac(macAddress) {
    if (!macAddress || typeof macAddress !== 'string') {
        throw new Error('MAC address must be a non-empty string');
    }
    
    // Remove colons and convert to lowercase
    const normalizedMac = macAddress.trim().replace(/:/g, '').toLowerCase();
    
    // Validate the MAC has exactly 12 hex characters
    if (!/^[0-9a-f]{12}$/.test(normalizedMac)) {
        throw new Error(`Invalid MAC address format: ${macAddress}. Expected 12 hex characters with or without colons.`);
    }
    
    return normalizedMac;
}

/**
 * Converts a string into a URL-friendly slug
 * Example: "Car Token #1" -> "car_token_1"
 * 
 * @param {string} text - Text to convert to a slug
 * @returns {string} URL-friendly slug
 */
function slugify(text) {
    if (!text || typeof text !== 'string') {
        return '';
    }
    
    return text
        .toString()
        .toLowerCase()
        .trim()
        // Replace spaces, dots, and underscores with underscores
        .replace(/[\s.]+/g, '_')
        // Replace special characters with their equivalent or remove
        .replace(/[&\/\\#,+()$~%.'":*?<>{}]/g, '')
        // Replace multiple underscores with a single one
        .replace(/_+/g, '_')
        // Remove underscores from start and end
        .replace(/^_+|_+$/g, '');
}

module.exports = {
    formatMac,
    normalizeMac,
    slugify
};

/**
 * Scheduled Publishing Module
 * Manages device state aggregation and scheduled/event-driven MQTT publishing
 */

const logger = require('./logger');
const { config } = require('./config');
const { normalizeMac } = require('./utils');

class ScheduledPublisher {
    constructor(mqttClient, publishDeviceDataCallback, publishGatewayStatusCallback) {
        this.mqttClient = mqttClient;
        this.publishDeviceDataCallback = publishDeviceDataCallback;
        this.publishGatewayStatusCallback = publishGatewayStatusCallback;
        
        // State management
        this.deviceCache = new Map(); // MAC -> { data: device_payload, ttl: timestamp }
        this.seenMacsSinceLastPublish = new Set();
        this.publishTimeout = null;
        this.lastGatewayMetadata = null;
        this.lastGatewayInfo = null;
        
        // Configuration for device absence detection and cache management
        this.deviceCacheRetentionMs = (config.mqtt.deviceCacheRetentionSeconds || 300) * 1000;
        
        // Bind methods to maintain context
        this.handleIncomingData = this.handleIncomingData.bind(this);
        this.scheduleNextPublish = this.scheduleNextPublish.bind(this);
        this.performScheduledPublish = this.performScheduledPublish.bind(this);
        this.cleanupExpiredDevices = this.cleanupExpiredDevices.bind(this);
    }

    /**
     * Handles incoming device data from gateway
     * @param {Array<Object>} devicePayloads - Array of device JSON payloads
     * @param {Object} gatewayMetadata - Gateway metadata for logging
     * @param {Object} gatewayInfo - Gateway info for publishing
     * @returns {Promise<boolean>} True if immediate publish was triggered, false otherwise
     */
    async handleIncomingData(devicePayloads, gatewayMetadata, gatewayInfo) {
        if (config.mqtt.publishIntervalSeconds === 0) {
            // Interval publishing is disabled, publish immediately
            logger.debug('Publish interval is disabled. Publishing immediately.');
            await this.publishDeviceDataCallback(devicePayloads, gatewayMetadata, gatewayInfo);
            return true;
        }

        const now = Date.now();

        // Update device cache with latest data and TTL for each device
        const currentMacs = new Set();
        const newTrackedDevices = []; // Track new HA devices being added to cache
        
        for (const payload of devicePayloads) {
            const normalizedMac = normalizeMac(payload.mac_address);
            const ttl = now + this.deviceCacheRetentionMs;
            
            const existingEntry = this.deviceCache.get(normalizedMac);
            const isNewToCache = !existingEntry || existingEntry.ttl < now; // Consider expired devices as "new"
            
            // Update or add device to cache
            this.deviceCache.set(normalizedMac, {
                data: payload,
                ttl: ttl
            });
            currentMacs.add(normalizedMac);
            
            // Check if this is a new HA device being added to cache (or returning after expiry)
            if (isNewToCache && config.homeAssistant.devices.has(normalizedMac)) {
                newTrackedDevices.push(normalizedMac);
                logger.debug(`New tracked device ${normalizedMac} added to cache - will trigger immediate publish`);
            }
        }

        logger.debug(`Updated device cache with ${devicePayloads.length} devices. Cache now contains ${this.deviceCache.size} total devices.`, {
            currentPayloadCount: devicePayloads.length,
            totalCachedDevices: this.deviceCache.size,
            newMacsInPayload: currentMacs.size
        });

        // Cache gateway information
        this.lastGatewayMetadata = gatewayMetadata;
        this.lastGatewayInfo = gatewayInfo;

        // Check for new tracked devices being added to cache
        if (newTrackedDevices.length > 0) {
            logger.info('New tracked BLE devices detected, triggering immediate publication.', { 
                newMacs: newTrackedDevices 
            });
            
            // Publish immediately with all cached device data
            const allDevicePayloads = Array.from(this.deviceCache.values()).map(entry => entry.data);
            await this.publishDeviceDataCallback(allDevicePayloads, gatewayMetadata, gatewayInfo);
            
            // Reset interval tracking
            this.seenMacsSinceLastPublish.clear();
            this.deviceCache.forEach((_, normalizedMac) => {
                this.seenMacsSinceLastPublish.add(normalizedMac);
            });
            
            // Reset the scheduled publish timer
            this.scheduleNextPublish();
            return true;
        } else {
            logger.debug('No new tracked devices detected. Caching data and waiting for next scheduled publish.');
            // Add any MACs from this payload to the set for the current interval
            currentMacs.forEach(normalizedMac => this.seenMacsSinceLastPublish.add(normalizedMac));
            return false;
        }
    }

    /**
     * Cleans up expired devices from cache based on TTL
     * @param {number} now - Current timestamp
     * @returns {Object} Stats about cleanup operation
     */
    cleanupExpiredDevices(now) {
        const expiredDevices = [];
        
        for (const [normalizedMac, cacheEntry] of this.deviceCache.entries()) {
            if (cacheEntry.ttl < now) {
                expiredDevices.push(normalizedMac);
            }
        }
        
        for (const normalizedMac of expiredDevices) {
            this.deviceCache.delete(normalizedMac);
            this.seenMacsSinceLastPublish.delete(normalizedMac);
        }
        
        return {
            expiredCount: expiredDevices.length,
            remainingCount: this.deviceCache.size,
            expiredMacs: expiredDevices
        };
    }

    /**
     * Sets a timer for the next scheduled publication
     */
    scheduleNextPublish() {
        // Clear any existing timer to ensure we don't have multiple running
        if (this.publishTimeout) {
            clearTimeout(this.publishTimeout);
        }

        const interval = config.mqtt.publishIntervalSeconds * 1000;
        if (interval === 0) {
            return; // Do not schedule if the interval is zero
        }

        this.publishTimeout = setTimeout(this.performScheduledPublish, interval);
        logger.debug(`Next scheduled publish in ${config.mqtt.publishIntervalSeconds} seconds.`);
    }

    /**
     * Performs the scheduled publication
     */
    async performScheduledPublish() {
        logger.info(`Scheduled publish triggered after ${config.mqtt.publishIntervalSeconds} seconds.`);
        
        const now = Date.now();
        
        // Clean up expired devices before publishing
        const cleanupStats = this.cleanupExpiredDevices(now);
        if (cleanupStats.expiredCount > 0) {
            logger.info(`Cleaned up ${cleanupStats.expiredCount} expired devices from cache. ${cleanupStats.remainingCount} devices remain.`, {
                expiredCount: cleanupStats.expiredCount,
                remainingCount: cleanupStats.remainingCount,
                retentionSeconds: this.deviceCacheRetentionMs / 1000
            });
        }
        
        logger.debug(`Before scheduled publish: Cache contains ${this.deviceCache.size} devices, seen ${this.seenMacsSinceLastPublish.size} MACs since last publish.`);

        if (this.deviceCache.size > 0) {
            // Publish all cached device data
            const allDevicePayloads = Array.from(this.deviceCache.values()).map(entry => entry.data);
            logger.info(`Publishing ${allDevicePayloads.length} cached devices from ${this.deviceCache.size} cache entries.`);
            
            await this.publishDeviceDataCallback(allDevicePayloads, this.lastGatewayMetadata, this.lastGatewayInfo);

            // DON'T clear the device cache - keep devices for retention period
            // Only clear the interval tracking
            this.seenMacsSinceLastPublish.clear();
            
            logger.info(`Scheduled publish completed for ${allDevicePayloads.length} devices. Interval tracking reset, cache retained.`);
        } else {
            logger.info('Scheduled publish: No device data in cache to publish.');
            // Still publish gateway status if available
            if (this.lastGatewayInfo) {
                await this.publishGatewayStatusCallback(this.lastGatewayInfo);
            }
        }

        // Schedule the next run
        this.scheduleNextPublish();
    }

    /**
     * Initializes scheduled publishing if interval is configured
     */
    initialize() {
        if (config.mqtt.publishIntervalSeconds > 0) {
            logger.info(`Initializing scheduled MQTT publishing every ${config.mqtt.publishIntervalSeconds} seconds.`);
            this.scheduleNextPublish();
        }
    }

    /**
     * Shuts down the scheduled publisher, clearing timers
     */
    shutdown() {
        if (this.publishTimeout) {
            clearTimeout(this.publishTimeout);
            this.publishTimeout = null;
            logger.info('Cleared scheduled publish timer');
        }
        
        // Clear state
        this.deviceCache.clear();
        this.seenMacsSinceLastPublish.clear();
        this.lastGatewayMetadata = null;
        this.lastGatewayInfo = null;
    }

    /**
     * Gets the current state for testing purposes
     * @returns {Object} Current state of the publisher
     */
    getState() {
        return {
            deviceCacheSize: this.deviceCache.size,
            seenMacsCount: this.seenMacsSinceLastPublish.size,
            hasScheduledPublish: this.publishTimeout !== null,
            deviceMacs: Array.from(this.deviceCache.keys()),
            seenMacs: Array.from(this.seenMacsSinceLastPublish),
            deviceCacheRetentionMs: this.deviceCacheRetentionMs
        };
    }

    /**
     * Clears the device cache - primarily for testing
     */
    clearCache() {
        this.deviceCache.clear();
        this.seenMacsSinceLastPublish.clear();
        this.lastGatewayMetadata = null;
        this.lastGatewayInfo = null;
    }
}

module.exports = ScheduledPublisher;

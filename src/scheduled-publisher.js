/**
 * Scheduled Publishing Module
 * Manages device state aggregation and scheduled/event-driven MQTT publishing
 */

const logger = require('./logger');
const { config } = require('./config');

class ScheduledPublisher {
    constructor(mqttClient, publishDeviceDataCallback, publishGatewayStatusCallback) {
        this.mqttClient = mqttClient;
        this.publishDeviceDataCallback = publishDeviceDataCallback;
        this.publishGatewayStatusCallback = publishGatewayStatusCallback;
        
        // State management
        this.deviceCache = new Map(); // MAC -> latest device data
        this.seenMacsSinceLastPublish = new Set();
        this.publishTimeout = null;
        this.lastGatewayMetadata = null;
        this.lastGatewayInfo = null;
        
        // Bind methods to maintain context
        this.handleIncomingData = this.handleIncomingData.bind(this);
        this.scheduleNextPublish = this.scheduleNextPublish.bind(this);
        this.performScheduledPublish = this.performScheduledPublish.bind(this);
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

        // Update device cache with latest data for each device
        const currentMacs = new Set();
        for (const payload of devicePayloads) {
            const mac = payload.mac_address.toLowerCase();
            this.deviceCache.set(mac, payload);
            currentMacs.add(mac);
        }

        logger.debug(`Updated device cache with ${devicePayloads.length} devices. Cache now contains ${this.deviceCache.size} total devices.`, {
            currentPayloadCount: devicePayloads.length,
            totalCachedDevices: this.deviceCache.size,
            newMacsInPayload: currentMacs.size
        });

        // Cache gateway information
        this.lastGatewayMetadata = gatewayMetadata;
        this.lastGatewayInfo = gatewayInfo;

        // Check for new tracked devices
        const newTrackedDevices = this.identifyNewTrackedDevices(currentMacs);

        if (newTrackedDevices.length > 0) {
            logger.info('New tracked BLE devices detected, triggering immediate publication.', { 
                newMacs: newTrackedDevices 
            });
            
            // Publish immediately with all cached device data
            const allDevicePayloads = Array.from(this.deviceCache.values());
            await this.publishDeviceDataCallback(allDevicePayloads, gatewayMetadata, gatewayInfo);
            
            // Reset interval tracking
            this.seenMacsSinceLastPublish.clear();
            this.deviceCache.forEach((_, mac) => {
                this.seenMacsSinceLastPublish.add(mac);
            });
            
            // Reset the scheduled publish timer
            this.scheduleNextPublish();
            return true;
        } else {
            logger.debug('No new tracked devices detected. Caching data and waiting for next scheduled publish.');
            // Add any MACs from this payload to the set for the current interval
            currentMacs.forEach(mac => this.seenMacsSinceLastPublish.add(mac));
            return false;
        }
    }

    /**
     * Identifies new tracked devices that haven't been seen in the current interval
     * @param {Set<string>} currentMacs - Set of MAC addresses from current payload
     * @returns {Array<string>} Array of MAC addresses for new tracked devices
     */
    identifyNewTrackedDevices(currentMacs) {
        const trackedDeviceMacs = new Set(config.homeAssistant.devices.keys());
        const newTrackedDevices = [];

        if (trackedDeviceMacs.size === 0) {
            // No tracked devices configured
            return newTrackedDevices;
        }

        for (const mac of currentMacs) {
            if (trackedDeviceMacs.has(mac) && !this.seenMacsSinceLastPublish.has(mac)) {
                newTrackedDevices.push(mac);
            }
        }

        return newTrackedDevices;
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
        
        logger.debug(`Before scheduled publish: Cache contains ${this.deviceCache.size} devices, seen ${this.seenMacsSinceLastPublish.size} MACs since last publish.`);

        if (this.deviceCache.size > 0) {
            // Publish all cached device data
            const allDevicePayloads = Array.from(this.deviceCache.values());
            logger.info(`Publishing ${allDevicePayloads.length} cached devices from ${this.deviceCache.size} cache entries.`);
            
            await this.publishDeviceDataCallback(allDevicePayloads, this.lastGatewayMetadata, this.lastGatewayInfo);

            // Clear the set of seen MACs for the new interval (AFTER successful publish)
            this.seenMacsSinceLastPublish.clear();
            
            // Update seen MACs for the new interval
            this.deviceCache.forEach((_, mac) => {
                this.seenMacsSinceLastPublish.add(mac);
            });
            
            logger.info(`Scheduled publish completed for ${allDevicePayloads.length} devices.`);
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
            seenMacs: Array.from(this.seenMacsSinceLastPublish)
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

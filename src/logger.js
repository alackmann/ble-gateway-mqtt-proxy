/**
 * Logging Module
 * Basic logging framework with configurable log levels
 */

// Log levels with numeric priorities (lower = higher priority)
const LOG_LEVELS = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3
};

// Get current log level from configuration
const getCurrentLogLevel = () => {
    try {
        // Lazy load config to avoid circular dependency
        const { config } = require('./config');
        const level = config.logging.level.toUpperCase();
        return LOG_LEVELS[level] !== undefined ? LOG_LEVELS[level] : LOG_LEVELS.INFO;
    } catch (error) {
        // Fallback to INFO level if config is not available
        return LOG_LEVELS.INFO;
    }
};

/**
 * Format timestamp for log messages
 */
function formatTimestamp() {
    return new Date().toISOString();
}

/**
 * Format log message with timestamp and level
 */
function formatMessage(level, message, data = null) {
    const timestamp = formatTimestamp();
    let formattedMessage = `[${timestamp}] ${level}: ${message}`;
    
    if (data) {
        if (typeof data === 'object') {
            formattedMessage += ` ${JSON.stringify(data)}`;
        } else {
            formattedMessage += ` ${data}`;
        }
    }
    
    return formattedMessage;
}

/**
 * Log at ERROR level
 */
function error(message, data = null) {
    if (getCurrentLogLevel() >= LOG_LEVELS.ERROR) {
        console.error(formatMessage('ERROR', message, data));
    }
}

/**
 * Log at WARN level
 */
function warn(message, data = null) {
    if (getCurrentLogLevel() >= LOG_LEVELS.WARN) {
        console.warn(formatMessage('WARN', message, data));
    }
}

/**
 * Log at INFO level
 */
function info(message, data = null) {
    if (getCurrentLogLevel() >= LOG_LEVELS.INFO) {
        console.log(formatMessage('INFO', message, data));
    }
}

/**
 * Log at DEBUG level
 */
function debug(message, data = null) {
    if (getCurrentLogLevel() >= LOG_LEVELS.DEBUG) {
        console.log(formatMessage('DEBUG', message, data));
    }
}

/**
 * Log application startup information
 */
function logStartup(port) {
    info(`BLE Gateway Data Processor starting on port ${port}`);
    try {
        // Lazy load config to avoid circular dependency
        const { config } = require('./config');
        info(`Log level set to: ${config.logging.level}`);
        info(`MQTT broker: ${config.mqtt.brokerUrl}`);
        info(`MQTT topic prefix: ${config.mqtt.topicPrefix}`);
    } catch (error) {
        info('Configuration details not available during startup');
    }
}

/**
 * Log incoming HTTP request details
 */
function logRequest(method, path, contentType, sourceIP, bodySize) {
    info(`Request: ${method} ${path}`, {
        contentType,
        sourceIP,
        bodySize: `${bodySize} bytes`
    });
}

/**
 * Log successful data processing
 */
function logProcessingSuccess(deviceCount, gatewayInfo = {}) {
    info(`Successfully processed ${deviceCount} devices`, {
        gateway: {
            version: gatewayInfo.version,
            messageId: gatewayInfo.messageId,
            ip: gatewayInfo.ip,
            mac: gatewayInfo.mac
        }
    });
}

/**
 * Log data processing errors
 */
function logProcessingError(operation, err, context = {}) {
    error(`Error during ${operation}: ${err.message}`, {
        operation,
        context,
        stack: err.stack
    });
}

/**
 * Log MQTT connection events
 */
function logMqttConnection(event, details = {}) {
    switch (event) {
        case 'connect':
            info('MQTT client connected successfully', details);
            break;
        case 'error':
            error('MQTT connection error', details);
            break;
        case 'close':
            warn('MQTT connection closed', details);
            break;
        case 'reconnect':
            info('MQTT client reconnecting', details);
            break;
        default:
            debug(`MQTT event: ${event}`, details);
    }
}

/**
 * Log MQTT publishing events
 */
function logMqttPublish(topic, success, err = null, messageId = null) {
    if (success) {
        debug(`Published to MQTT topic: ${topic}`, { messageId });
    } else {
        error(`Failed to publish to MQTT topic: ${topic}`, { 
            error: err?.message,
            messageId 
        });
    }
}

module.exports = {
    error,
    warn,
    info,
    debug,
    logStartup,
    logRequest,
    logProcessingSuccess,
    logProcessingError,
    logMqttConnection,
    logMqttPublish,
    LOG_LEVELS,
    getCurrentLogLevel
};

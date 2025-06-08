# Home Automation Integration Guide

## Overview

This document outlines the complete Home Automation integration for the BLE Gateway Data Processor, including automatic device discovery for both BLE devices and the gateway itself. This integration uses the Home Assistant MQTT Auto Discovery protocol, which is also compatible with OpenHAB and other home automation systems that support this standardized MQTT topic structure.

The integration provides automatic discovery and monitoring of:
- **BLE Devices**: User-defined devices with RSSI and presence tracking
- **Gateway Status**: Comprehensive gateway health and status monitoring

## Implementation Details

### BLE Device Integration

When `HA_ENABLED=true`, each configured BLE device automatically appears in your home automation system with:

#### Device Sensors
- **RSSI Sensor**: Signal strength in dBm with `signal_strength` device class
- **Last Seen Sensor**: Timestamp of last detection with `timestamp` device class
- **Availability**: Sensors marked unavailable if no updates received for 5 minutes

#### MQTT Topics
- **Discovery**: `homeassistant/sensor/{device_slug}_{sensor_type}/config`
- **State**: `blegateway/state/{mac_address}` (standardized format)

#### Device Information
Each BLE device includes manufacturer and model information for proper categorization:
- **Manufacturer**: April Brother  
- **Model**: BLE Gateway v4 Token
- **Identifiers**: Unique device ID based on MAC address

### Gateway Device Integration

The BLE Gateway itself is represented as a comprehensive monitoring device with multiple sensors:

#### Gateway Sensors
- **Version**: The firmware version of the gateway
- **IP Address**: The current IP address of the gateway
- **MAC Address**: The hardware MAC address of the gateway
- **Message ID**: The message ID from the gateway
- **Gateway Time**: The internal time of the gateway
- **Last Ping**: The timestamp when the gateway last sent data

#### Gateway Device Information
- **Manufacturer**: April Brother
- **Model**: BLE Gateway V4
- **Identifiers**: Unique gateway ID based on MAC address

### MQTT Topic Structure

The integration uses a standardized topic structure compatible with Home Assistant, OpenHAB, and other MQTT-based home automation systems:

#### Discovery Topics
- **BLE Devices**: `homeassistant/sensor/{device_slug}_{sensor_type}/config`
- **Gateway**: `homeassistant/sensor/gateway_{sensor_type}/config`

#### State Topics
- **BLE Devices**: `blegateway/state/{mac_address}`
- **Gateway**: `blegateway/gateway/state`

This structure aligns with home automation best practices and ensures compatibility across different systems.

## Configuration

Home Automation integration is controlled by several environment variables that enable device filtering, discovery, and customization:

### Core Integration Settings

- **`HA_ENABLED`**: (Boolean, default `false`) Master switch to enable Home Assistant/OpenHAB integration
- **`HA_DISCOVERY_TOPIC_PREFIX`**: (String, default `homeassistant`) Root topic for discovery messages
- **`HA_GATEWAY_NAME`**: (String, default `April Brother BLE Gateway`) Display name for the gateway device

### BLE Device Configuration

Define which BLE devices (iBeacons or Eddystone token [such as these](https://store.aprbrother.com/product/aprilbeacon-eek-n)) should be discovered in Home automation platforms and their presence and distance information provided as sensors. This filtering is offered here in preference to automatically including every device. Usually you would only want specific beacons/tokens to be imported.

To setup which devices to create auto-discovery topics for, include these ENV vars when starting the docker service:

- **`HA_BLE_DEVICE_X`**: (String format: `mac_address,friendly_name`) Configure individual BLE devices

#### Example Configuration

```bash
# Enable Home Automation integration
HA_ENABLED=true
HA_DISCOVERY_TOPIC_PREFIX=homeassistant

# Define BLE devices for monitoring
HA_BLE_DEVICE_1=123b6a1b85ef,Car Token
HA_BLE_DEVICE_2=456c7d2c96f0,Bike Sensor
HA_BLE_DEVICE_3=789abc123def,Keychain Tracker

# Customize gateway name
HA_GATEWAY_NAME=Living Room BLE Gateway
```

### Device Filtering Behavior

When Home Automation integration is enabled:

1. **Selective Discovery**: Only devices defined in `HA_BLE_DEVICE_X` variables receive discovery messages
2. **Universal State Publishing**: All detected BLE devices publish state data (using standardized topic structure)
3. **Gateway Auto-Discovery**: Gateway status is always included when `HA_ENABLED=true`

This approach allows monitoring of all BLE traffic while providing rich integration only for devices you care about.

### Publishing Behavior

The integration follows a two-phase publishing approach:

#### 1. Discovery Phase (Application Startup)
When `HA_ENABLED=true`, discovery messages are published for:
- All configured BLE devices (from `HA_BLE_DEVICE_X` variables)
- Gateway sensors (automatically included)
- Messages are published with `retain: true` for persistence

#### 2. State Publishing (Ongoing)
Real-time data is continuously published:
- **BLE Device States**: Published whenever devices are detected (all devices, not just configured ones)
- **Gateway State**: Published with each gateway data update
- **All state messages**: Published with `retain: false` to prevent stale data

#### Message Retention Strategy
- **Discovery Messages**: Always retained (`retain: true`) so new home automation instances can discover devices
- **State Messages**: Never retained (`retain: false`) to ensure fresh data and proper sensor availability tracking

## Home Automation System Compatibility

### Home Assistant
- **Full Support**: Complete MQTT Auto Discovery integration
- **Device Management**: Devices appear automatically in the Devices & Services section
- **Dashboard Integration**: Sensors can be added to dashboards and automations
- **Naming**: Uses friendly names from configuration for intuitive identification

### OpenHAB
- **MQTT Auto Discovery**: Compatible with OpenHAB's Home Assistant MQTT discovery binding
- **Thing Discovery**: BLE devices and gateway appear as discoverable Things with Channels for RSSI and Last Seen date/time
- **Item Creation**: Manually create Items to connect to the Channels you require
- **Channel Support**: RSSI, timestamp, and gateway status channels

### Other Systems
Any MQTT-based home automation system supporting the Home Assistant discovery protocol can integrate with this gateway, including:
- **Node-RED**: Via MQTT discovery nodes
- **Domoticz**: With MQTT Auto Discovery plugin
- **Custom Systems**: Using the standardized MQTT topic structure

Use an desktop app like [MQTT Explorer](https://mqtt-explorer.com/) to see the topics and messages from your gateway.

# Technical Specification Document: Home Assistant MQTT Auto Discovery Integration

## 1. Introduction

### 1.1 Purpose
This document specifies the technical design for integrating Home Assistant's MQTT Auto Discovery feature into the existing BLE Gateway Data Processor Node.js application. It details the necessary changes to MQTT message structures, configuration methods, and application logic to allow BLE tokens to be automatically discovered and represented as sensors within Home Assistant.

### 1.2 Scope
This specification covers:
*   The format and topics for Home Assistant MQTT Discovery `config` messages.
*   The format and topics for ongoing BLE device state messages.
*   Methods for configuring which BLE devices are discovered and their friendly names via indexed environment variables.
*   **A breaking change** to the existing state topic publishing mechanism, replacing it with the Home Assistant compatible approach when `HA_ENABLED` is true.

This document builds upon the existing Functional Requirements Document (FRD) and Technical Specification Document (TSD) for the BLE Gateway Data Processor.

### 1.3 Definitions and Acronyms
*   **HA:** Home Assistant
*   **MQTT AD:** MQTT Auto Discovery
*   **FRD:** Functional Requirements Document
*   **TSD:** Technical Specification Document

## 2. Home Assistant MQTT Discovery Integration Overview

The existing Node.js application currently publishes a consolidated JSON string for each detected BLE device to a topic like `blebeacons/device/<MAC>`. To leverage Home Assistant's MQTT Auto Discovery, this strategy will be enhanced when `HA_ENABLED` is true:

1.  **Discovery Messages (`config`):** For each *defined* BLE token, the Node.js app will publish a "config" message to a specific HA discovery topic (e.g., `homeassistant/sensor/<device_slug>_rssi/config`). These messages define the sensor entities (e.g., RSSI, Last Seen) and associate them with a Home Assistant "device". These messages **MUST be retained** on the MQTT broker so HA can discover them even if it restarts. These are typically published once during application startup or when a new device is first registered.

2.  **State Messages:** The actual real-time data (RSSI, last seen timestamp) will be published to a dedicated "state" topic (e.g., `blegateway/state/<MAC>`). These messages **MUST NOT be retained**. The discovery config messages will tell Home Assistant to read its state from this topic. This format replaces the previous `blegateway/dev/<MAC>` format

This approach creates a clear separation between device definition/discovery and real-time state updates, aligning with Home Assistant's recommended best practices.

## 3. Configuration via Environment Variables

To provide flexibility and allow dynamic configuration for the Dockerized application, the list of desired BLE devices and their friendly names for Home Assistant will be passed via a series of indexed environment variables.

*   **`HA_ENABLED`**: (Boolean, default `false`) If set to `true`, the application will enable Home Assistant MQTT Auto Discovery topics. If `false`, it will only publishthe device state topics using the `MQTT_TOPIC_PREFIX` and appending `/state/`
*   **`HA_BLE_DEVICE_<INDEX>`**: (String) These environment variables will define each BLE token to be tracked. `<INDEX>` will be a positive integer (e.g., `HA_BLE_DEVICE_1`, `HA_BLE_DEVICE_2`). Each variable's value will be a comma-separated string containing the **MAC address (without colons)** and the **friendly name**, in that order.

    **Example `HA_BLE_DEVICE_1` value:**
    ```
    123b6a1b85ef,Car Token
    ```
    **Example `HA_BLE_DEVICE_2` value:**
    ```
    123b6a1b841f,Andre Bike Token
    ```
    *   The application will iterate through these variables (e.g., from `HA_BLE_DEVICE_1` upwards) until a variable is not found, or a maximum reasonable limit is reached.
    *   **MAC:** The MAC address of the BLE token *without colons* (e.g., `123b6a1b85ef`). This will be used for internal matching and `unique_id` generation.
    *   **Name:** A user-friendly name for the token (e.g., `Car Token`). This will be used in Home Assistant's UI.

*   **`HA_DISCOVERY_TOPIC_PREFIX`**: (String, default `homeassistant`) The root topic for HA discovery. If not set, default to `homeassistant`.

## 4. MQTT Message Structure for Home Assistant

### 4.1 Discovery Config Messages

These messages define `sensor` entities in Home Assistant. Two sensors will be defined for each device: RSSI and Last Seen Timestamp.

*   **Common Device Object for Discovery:**
    All sensors related to a single physical BLE token will share a common `device` object in their config payload. This links them together under one logical device in Home Assistant.
    ```json
    {
      "identifiers": ["ble_token_<MAC_WITHOUT_COLONS>"],
      "name": "<FRIENDLY_DEVICE_NAME>",
      "model": "April Brother BLE Gateway v4 Token",
      "manufacturer": "April Brother"
    }
    ```
    *   `identifiers`: A unique ID for the device (e.g., `ble_token_123b6a1b85ef`).
    *   `name`: The display name for the device (e.g., `Car Token`).

*   **RSSI Sensor Config:**
    *   **Topic:** `<HA_DISCOVERY_TOPIC_PREFIX>/sensor/<device_slug>_rssi/config`
        *   Example: `homeassistant/sensor/car_token_rssi/config`
    *   **Payload (JSON):**
        ```json
        {
          "name": "<FRIENDLY_DEVICE_NAME> RSSI",
          "unique_id": "ble_token_<MAC_WITHOUT_COLONS>_rssi",
          "state_topic": "<HA_STATE_TOPIC_PREFIX>/<MAC_WITH_COLONS>",
          "value_template": "{{ value_json.rssi | default(0) }}",
          "unit_of_measurement": "dBm",
          "device_class": "signal_strength",
          "expire_after": 300, // Marks sensor unavailable if no updates in 5 minutes
          "device": { /* common device object */ }
        }
        ```

*   **Last Seen Timestamp Sensor Config:**
    *   **Topic:** `<HA_DISCOVERY_TOPIC_PREFIX>/sensor/<device_slug>_last_seen/config`
        *   Example: `homeassistant/sensor/car_token_last_seen/config`
    *   **Payload (JSON):**
        ```json
        {
          "name": "<FRIENDLY_DEVICE_NAME> Last Seen",
          "unique_id": "ble_token_<MAC_WITHOUT_COLONS>_last_seen",
          "state_topic": "<HA_STATE_TOPIC_PREFIX>/<MAC_WITH_COLONS>",
          "value_template": "{{ value_json.last_seen_timestamp }}",
          "device_class": "timestamp",
          "expire_after": 300, // Marks sensor unavailable if no updates in 5 minutes
            "device": { /* common device object */ }
        }
        ```
*   **Publishing Flags:** All discovery config messages **MUST be published with `retain: true`**.

### 4.2 State Messages

These messages provide the real-time sensor data.

*   **Topic:** `<MQTT_TOPIC_PREFIX>/state/<MAC_WITH_COLONS>`
    *   Example: `blegateway/state/12:3B:6A:1B:85:EF`
*   **Payload (JSON):** The existing full JSON payload generated by the Node.js application, containing `rssi`, `last_seen_timestamp`, etc.
    ```json
    {
      "mac_address":"12:3B:6A:1B:85:EF",
      "rssi":-80,
      "advertising_type_code":0,
      "advertising_type_description":"Connectable undirected advertisement",
      "advertisement_data_hex":"1107...",
      "last_seen_timestamp":"2025-06-04T12:38:16.324Z"
    }
    ```
*   **Publishing Flags:** State messages **MUST be published with `retain: false`**.

## 5. Node.js Application Logic Changes

### 5.1 Configuration Loading and Parsing
*   Upon application startup, read `HA_ENABLED`, `HA_DISCOVERY_TOPIC_PREFIX`, and `MQTT_TOPIC_PREFIX`.
*   If `HA_ENABLED` is `true`, dynamically build the `haDeviceMap` (e.g., `Map<string, {name: string}>` keyed by colon-less MAC) by iterating through environment variables prefixed with `HA_BLE_DEVICE_`.
    *   Iterate a counter (e.g., `i` from 1). For each `HA_BLE_DEVICE_`*`i`*:
        *   Retrieve the value.
        *   Split the value by `,` to get `mac` (no colons) and `name`. Trim whitespace.
        *   Store in `haDeviceMap`: `haDeviceMap.set(mac, { name: name })`.
        *   Implement robust error handling for malformed `mac,name` strings (e.g., not enough parts, invalid MAC format).
    *   Stop iteration when an `HA_BLE_DEVICE_`*`i`* variable is not found.

### 5.2 Helper Functions
*   **`formatMac(macWithoutColons)`:** Converts a MAC address string without colons (e.g., `123b6a1b85ef`) to a colon-separated, uppercase format (e.g., `12:3B:6A:1B:85:EF`).
*   **`slugify(text)`:** Converts a string into a URL-friendly slug (lowercase, spaces to underscores, remove special characters).

### 5.3 Home Assistant Discovery Publisher
*   **Trigger:** This logic will run once every minute during application runtime, but *after* the MQTT client successfully connects.
*   **Process:**
    1.  Iterate through the `haDeviceMap`.
    2.  For each `[macNoColons, { name }]` entry:
        *   Derive `mac_with_colons` using `formatMac(macNoColons)`.
        *   Derive `device_slug` using `slugify(name)`.
        *   Construct the common `device` object for HA discovery.
        *   Construct the `config` payload for the RSSI sensor.
        *   Construct the `config` payload for the Last Seen sensor.
        *   Publish both config messages to their respective discovery topics with `retain: true` and keep track of devices we have published config data for.
        *   Log successful discovery message publications.
        *   On subsequent runs, ONLY publish config messages for new devices. eg. a device that was in the hasDeviceMap BUT was not detected during earlier runs.
*   **Error Handling:** Log any errors during config message creation or publishing.

### 5.4 BLE Device Filtering and State Publisher (Breaking Change)
*   **Logic Integration:** Within the existing data processing loop that iterates through the `devices` array from the April Brother Gateway:
    1.  After parsing a BLE device's raw data and extracting its `mac_address` (which will be colon-separated):
    2.  **State Message Publishing (All Devices):**
        *   Normalize the `mac_address` to its colon-less format (e.g., `12:3B:6A:1B:85:EF` to `123b6a1b85ef`).
        *   For **every** detected BLE device, publish the existing full JSON payload to the new state topic format: `<MQTT_TOPIC_PREFIX>/state/<normalised_mac_address>` with `retain: false`.
        *   This replaces the previous topic format `<MQTT_TOPIC_PREFIX>/device/<mac_address>` and is now the standard state publishing format regardless of Home Assistant configuration.
        *   Log the state update.
    3.  **Home Assistant Discovery Config Publishing (Filtered Devices):**
        *   If `HA_ENABLED` is `true`:
            *   Normalize the `mac_address` to its colon-less format (e.g., `12:3B:6A:1B:85:EF` to `123b6a1b85ef`).
            *   Check if this colon-less MAC exists as a key in the `haDeviceMap`.
                *   If it exists, this device is configured for Home Assistant discovery. The discovery config messages will have already been published during application startup.
                *   If it does *not* exist in `haDeviceMap`, this device will not have Home Assistant discovery config messages published (but will still have state messages published as per step 2).
        *   If `HA_ENABLED` is `false`:
            *   No Home Assistant discovery config messages will be published for any devices.

**Note:** This change means that all BLE devices will use the new `/state/` topic format, ensuring consistency and Home Assistant compatibility. Only devices explicitly configured via `HA_BLE_DEVICE_X` environment variables will have discovery config messages published when `HA_ENABLED` is true.

## 6. Gateway Discovery Integration

### 6.1 Overview

The BLE Gateway itself is automatically represented as a device in Home Assistant with multiple sensors when Home Assistant integration is enabled (`HA_ENABLED=true`). This provides comprehensive monitoring of the gateway's status and health.

### 6.2 Gateway Device Sensors

The gateway appears in Home Assistant with the following sensors:

- **Version**: The firmware version of the gateway
- **IP Address**: The current IP address of the gateway  
- **MAC Address**: The hardware MAC address of the gateway
- **Message ID**: The message ID from the gateway
- **Gateway Time**: The internal time of the gateway
- **Last Ping**: The timestamp when the gateway last sent data

### 6.3 MQTT Topic Structure

Gateway status data is published to a dedicated state topic that follows the same pattern as BLE devices:

- **Gateway State Topic**: `blegateway/gateway/state`
- **Discovery Topics**: `homeassistant/sensor/gateway_<sensor_type>/config`

This aligns with the structure used for BLE devices and follows Home Assistant best practices.

### 6.4 Configuration

Gateway discovery is automatically included when Home Assistant integration is enabled. You can customize the gateway's display name:

- **`HA_GATEWAY_NAME`**: (String, default `April Brother BLE Gateway`) The friendly name for the gateway device in Home Assistant

Example configuration:
```bash
HA_ENABLED=true
HA_GATEWAY_NAME=My BLE Gateway
```

### 6.5 Publishing Behavior

1. **Discovery Messages**: Published automatically when the application starts with `HA_ENABLED=true`
2. **State Updates**: Published whenever the gateway sends status data
3. **Retention**: Gateway state messages use `retain: false`, discovery messages use `retain: true`

### 6.6 Benefits

- **Unified Dashboard**: View all gateway and BLE device information together
- **Automatic Updates**: Sensor values update in real-time
- **Health Monitoring**: Monitor gateway connectivity and status
- **Consistent Structure**: Uses the same MQTT patterns as BLE devices

## 7. Development Task List

This task list outlines the steps to implement Home Assistant MQTT Auto Discovery, building upon the existing application and test framework.

1.  **Task: Update Configuration Module for HA Specifics (Env Var Parsing)**
    *   **Description:** Enhance the configuration loading logic to read the new environment variables: `HA_ENABLED`, `HA_DISCOVERY_TOPIC_PREFIX`. Crucially, implement the logic to iterate through `HA_BLE_DEVICE_1`, `HA_BLE_DEVICE_2`, etc., parse each `mac,name` string, and populate an internal `haDeviceMap`. Add error handling for malformed `mac,name` strings.

2.  **Task: Implement MAC Formatting and Slugify Helper Functions**
    *   **Description:** Create utility functions `formatMac(macWithoutColons)` and `slugify(text)` as described in TSD Section 5.2. Add unit tests for these helper functions using Mocha/Chai to ensure correct string manipulation.

3.  **Task: Develop Home Assistant Discovery Publisher Logic**
    *   **Description:** Implement the `publishDiscoveryMessages` function (or similar) that iterates through the `haDeviceMap` and constructs the Home Assistant `config` payloads for both RSSI and Last Seen sensors. This function should publish these messages with `retain: true` on MQTT client connection. Implement robust error handling and logging for this process.

4.  **Task: Integrate Discovery Publisher into Application Startup**
    *   **Description:** Modify the main application entry point to call the `publishDiscoveryMessages` function *after* the MQTT client successfully connects and `HA_ENABLED` is true.

5.  **Task: Implement Breaking Change for State Topic Publishing**
    *   **Description:** Refactor the main data processing loop (where devices are iterated and published) to use the new state topic format for all devices:
        *   For **every** detected BLE device, publish the full JSON payload to `<MQTT_TOPIC_PREFIX>/state/<mac_address_with_colons>` with `retain: false`.
        *   This replaces the previous topic format `<MQTT_TOPIC_PREFIX>/device/<mac_address>` and applies to all devices regardless of Home Assistant configuration.
        *   Remove the old device topic publishing logic entirely.

6.  **Task: Write Unit/Integration Tests for HA Integration**
    *   **Description:**
        *   **Configuration Parsing Tests:** Write tests for the new env var parsing logic (Task 1) to ensure `haDeviceMap` is correctly populated from various `HA_BLE_DEVICE_` inputs, including valid, missing, and malformed ones.
        *   **Discovery Publisher Tests:** Mock the MQTT client and verify that `publishDiscoveryMessages` sends the correct `config` payloads to the right topics with `retain: true` for all devices in `haDeviceMap` when `HA_ENABLED` is true, and no config messages when `HA_ENABLED` is false.
        *   **State Publisher Tests:** Mock the MQTT client and verify that the data processing loop (Task 5) publishes state updates to the new `<MQTT_TOPIC_PREFIX>/state/<mac_address>` topics with `retain: false` for **all** detected devices, regardless of `HA_ENABLED` setting or `haDeviceMap` configuration.

7.  **Task: Update Dockerfile for New ENV Vars (Documentation Only)**
    *   **Description:** No code changes to the Dockerfile, but update documentation on how to pass the `HA_ENABLED`, `HA_DISCOVERY_TOPIC_PREFIX`, and `HA_BLE_DEVICE_X` environment variables when running the Docker container.

8.  **Task: End-to-End Testing with Home Assistant**
    *   **Description:** Deploy the updated Node.js application (via Docker) and connect it to a test MQTT broker and a Home Assistant instance. Verify that:
        *   All BLE devices publish state messages to the new `/state/` topic format.
        *   When `HA_ENABLED` is true, Home Assistant automatically discovers only the configured BLE tokens as devices with RSSI and Last Seen sensors.
        *   Sensor values update correctly in Home Assistant as BLE tokens are detected.
        *   Device status (availability) reflects `expire_after` correctly.
        *   When `HA_ENABLED` is false, no discovery config messages are published, but state messages continue for all devices.
        *   No retained messages appear on the state topics.
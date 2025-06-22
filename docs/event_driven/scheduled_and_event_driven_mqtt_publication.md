# Scheduled and Event-Driven MQTT Publication

## 1. Introduction

### 1.1 Purpose

This document specifies a new feature to control the frequency of MQTT publications from the BLE Gateway Data Processor. The goal is to reduce MQTT traffic and the load on downstream systems like Home Assistant, while maintaining responsiveness to new devices appearing in the BLE gateway's range.

### 1.2 Problem Statement

Currently, the application publishes data for every BLE device detected in every payload received from the gateway. While the gateway's scanning frequency can be adjusted, setting it to a very low value (e.g., every 2 seconds) can generate significant MQTT traffic. Conversely, a high value (e.g., 10 seconds) introduces latency in detecting new or returning devices.

### 1.3 Proposed Solution

This feature introduces a hybrid approach:

- A configurable publishing interval (`MQTT_PUBLISH_INTERVAL_SECONDS`) sets a maximum delay between publications.
- The system will publish **immediately** if a new, previously unseen BLE device MAC address is detected within the current interval.
- If no new devices are seen, the latest received data is published for all seen devices when the interval timer expires.

This ensures that the system is highly responsive to new devices while avoiding constant updates for devices that are already known to be present.

## 2. Functional Requirements

### FR-007: Configurable Publishing Interval

- **FR-007.1:** The application MUST support a new environment variable, `MQTT_PUBLISH_INTERVAL_SECONDS`.
- **FR-007.2:** This variable defines the time in seconds for the scheduled publishing interval.
- **FR-007.3:** If this variable is not set or is set to `0`, the application MUST maintain its original behavior of publishing all data as it is received.

### FR-008: Event-Driven Publishing for New Devices

- **FR-008.1:** The application MUST keep track of the unique BLE device MAC addresses it has seen and published within the current publishing interval.
- **FR-008.2:** When new data is received from the gateway, if it contains a BLE device with a MAC address that has *not* been seen in the current interval, the application MUST immediately publish the data for all devices in the current payload.
- **FR-008.3:** An immediate publication (as per FR-008.2) MUST reset the publishing interval timer. The set of "seen" MAC addresses for the interval is cleared after publishing.

### FR-009: Scheduled Publishing

- **FR-009.1:** The application MUST cache the most recent data payload received from the gateway.
- **FR-009.2:** If the publishing interval timer expires without any immediate publications having occurred, the application MUST publish the most recently cached data payload.
- **FR-009.3:** After a scheduled publication, the timer MUST be reset, and the set of "seen" MAC addresses for the new interval is cleared.

## 3. Important Considerations

### 3.1. Home Assistant Discovery Messages

The `MQTT_PUBLISH_INTERVAL_SECONDS` setting **only** affects the publication of BLE device state updates (e.g., RSSI, timestamp). It does **not** affect the publication of Home Assistant discovery `config` messages. The discovery messages will continue to be published at their own fixed interval (typically 60 seconds) to ensure Home Assistant entities are created and updated correctly.

## 4. Technical Design

The implementation will involve the following components:

- **Configuration:** The `src/config.js` module will be updated to read and parse the `MQTT_PUBLISH_INTERVAL_SECONDS` environment variable.
- **Main Logic (`src/index.js`):**
  - A variable, `lastReceivedData`, will store the latest full data payload from the gateway.
  - A `Set`, `seenMacsSinceLastPublish`, will store the MAC addresses of all unique devices seen in the current interval.
  - A `setTimeout` instance, `publishTimeout`, will manage the scheduled publication.
  - The core request handling logic will be modified:
    1. On receiving data, store it in `lastReceivedData`.
    2. Extract all MAC addresses from the payload.
    3. Check if any of these MACs are new compared to `seenMacsSinceLastPublish`.
    4. **If a new MAC is found:**
        - Publish the `lastReceivedData` immediately.
        - Clear `publishTimeout`.
        - Reset the timer by calling a `scheduleNextPublish()` function.
        - Update `seenMacsSinceLastPublish` with all MACs from the just-published payload.
    5. **If no new MACs are found:**
        - Add the MACs from the current payload to `seenMacsSinceLastPublish`.
        - Do not publish immediately; wait for the timer to fire.
- **`scheduleNextPublish()` function:**
  - This function will be responsible for setting the `publishTimeout`.
  - The timeout's callback will publish the `lastReceivedData`, clear `seenMacsSinceLastPublish`, and then call `scheduleNextPublish()` again to set up the next cycle.

## 5. Implementation Task List

1.  **Task: Create Documentation**
    - **Description:** Create a new markdown file `docs/event_driven/scheduled_and_event_driven_mqtt_publication.md` to document the new feature, its requirements, and the implementation plan.
    - **Status:** Completed.

2.  **Task: Update Configuration**
    - **Description:** Modify `src/config.js` to add support for the `MQTT_PUBLISH_INTERVAL_SECONDS` environment variable. Ensure it defaults to `0` if not provided.

3.  **Task: Implement Core Throttling Logic**
    - **Description:** Update `src/index.js` to implement the caching, MAC address tracking, and conditional publishing logic described in the Technical Design section. This will involve managing a timer and the set of seen MAC addresses.

4.  **Task: Update README**
    - **Description:** Add documentation for the new `MQTT_PUBLISH_INTERVAL_SECONDS` environment variable to the main `README.md` file.

5.  **Task: Add Unit/Integration Tests**
    - **Description:** Create new tests in the `test/` directory to validate the new functionality.
    - **Test Cases:**
        - Verify that with the interval set, publishing only happens once per interval if no new devices appear.
        - Verify that an immediate publication occurs when a new device MAC is detected.
        - Verify that after an immediate publication, the timer is correctly reset.
        - Verify that if the interval is `0` or not set, the old behavior is preserved.

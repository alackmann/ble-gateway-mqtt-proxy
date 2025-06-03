# Functional Requirements Document: BLE Gateway Data Processor

## 1. Introduction

### 1.1 Purpose
This document outlines the functional requirements for a Node.js application designed to receive data from an April Brother BLE Gateway V4. The application will process this data, extract information about detected BLE devices, and publish it to an MQTT broker.

### 1.2 Scope

#### In Scope:
*   HTTP endpoint creation to receive data from the BLE Gateway.
*   Decoding of MessagePack and JSON formatted data.
*   Parsing of gateway and BLE device advertising data.
*   Transformation of individual BLE device data into a structured JSON format.
*   Publishing of structured JSON data to configurable MQTT topics.
*   Application containerization using Docker.
*   Configuration management via environment variables, with support for `.env` files for local development.

#### Out of Scope:
*   The April Brother BLE Gateway V4 hardware and its internal firmware/configuration (beyond the data it sends).
*   The MQTT broker itself (it's assumed to be an existing, accessible service).
*   User interface for configuration or monitoring (beyond logs).
*   Persistent storage of received data (beyond in-memory processing for a single request).
*   Advanced data filtering or analytics within this application (filtering is expected to be handled by the gateway or downstream consumers).

### 1.3 Target Audience
Software developers, system administrators, and project stakeholders.

### 1.4 Definitions and Acronyms
*   **BLE:** Bluetooth Low Energy
*   **FRD:** Functional Requirements Document
*   **HTTP:** Hypertext Transfer Protocol
*   **JSON:** JavaScript Object Notation
*   **MAC:** Media Access Control (address)
*   **MQTT:** Message Queuing Telemetry Transport
*   **RSSI:** Received Signal Strength Indicator
*   **ENV:** Environment Variable

## 2. Overall Description

The system will consist of a Node.js application running inside a Docker container. This application will expose an HTTP endpoint. The April Brother BLE Gateway V4 will be configured to send BLE scan data to this endpoint. Upon receiving data, the application will decode it, process the information for each detected BLE device, enrich it with a timestamp, and then publish a structured JSON message for each device to a specific MQTT topic.

## 3. Functional Requirements

### FR-001: HTTP Data Ingestion
*   **FR-001.1:** The application MUST expose an HTTP POST endpoint.
*   **FR-001.2:** The default listening port for the HTTP server SHALL be configurable (e.g., `8000`).
*   **FR-001.3:** The application MUST accept requests with `Content-Type: application/msgpack`.
*   **FR-001.4:** The application MUST accept requests with `Content-Type: application/json`.
*   **FR-001.5:** Upon successful processing of a request (data decoded and sent to MQTT), the application SHOULD respond with an HTTP `200 OK` (or `204 No Content`) status.
*   **FR-001.6:** In case of an error processing the request (e.g., malformed data), the application SHOULD respond with an appropriate HTTP error code (e.g., `400 Bad Request`, `500 Internal Server Error`) and log the error.

### FR-002: Incoming Data Processing
*   **FR-002.1:** If the `Content-Type` is `application/msgpack`, the application MUST decode the request body using a MessagePack library.
*   **FR-002.2:** The application MUST correctly interpret the decoded data structure as defined in Section 4 (Data Formats).

### FR-003: BLE Device Data Extraction and Transformation
*   **FR-003.1:** The application MUST iterate through the `devices` array present in the incoming decoded data.
*   **FR-003.2:** For each element in the `devices` array, the application MUST parse the raw advertising data to extract:
    *   Advertising Type Code (byte 1)
    *   BLE Device MAC Address (bytes 2-7)
    *   RSSI (byte 8, adjusted by subtracting 256)
    *   Raw Advertisement Data (bytes 9 onwards)
*   **FR-003.3:** For each processed BLE device, the application MUST construct a JSON object containing:
    *   `mac_address`: (String) The 6-byte MAC address of the BLE device, formatted as a colon-separated hex string (e.g., "12:3B:6A:1A:64:CF").
    *   `rssi`: (Integer) The calculated RSSI value.
    *   `advertising_type_code`: (Integer) The raw advertising type code.
    *   `advertising_type_description`: (String) The textual description of the advertising type (see Section 4.2.3).
    *   `advertisement_data_hex`: (String) The raw advertisement data payload as a hexadecimal string.
    *   `last_seen_timestamp`: (String) The current server date and time in ISO 8601 format (e.g., "2023-10-27T10:30:00.123Z") when the data was processed.
    *   `gateway_mac`: (String, Optional) The MAC address of the gateway that reported this device, if available in the root of the incoming data.
    *   `gateway_ip`: (String, Optional) The IP address of the gateway, if available.

### FR-004: MQTT Publishing
*   **FR-004.1:** The application MUST publish the JSON object (defined in FR-003.3) for each detected BLE device to an MQTT broker.
*   **FR-004.2:** The MQTT broker connection details (hostname, port, username, password - if any) MUST be configurable.
*   **FR-004.3:** The MQTT topic prefix MUST be configurable.
*   **FR-004.4:** The MQTT topic for each device message MUST be constructed as: `<MQTT_TOPIC_PREFIX><DEVICE_MAC_ADDRESS>`. The `<DEVICE_MAC_ADDRESS>` should be the colon-separated hex string from FR-003.3 (e.g., `/blebeacons/device/12:3B:6A:1A:64:CF`).

### FR-005: Configuration
*   **FR-005.1:** All application configuration parameters MUST be suppliable via environment variables.
*   **FR-005.2:** For local development, the application SHOULD support reading these environment variables from a `.env` file in the project root.
*   **FR-005.3:** Configurable parameters MUST include:
    *   `SERVER_PORT`: Port for the HTTP server (e.g., `8000`).
    *   `MQTT_BROKER_URL`: URL of the MQTT broker (e.g., `mqtt://localhost:1883`).
    *   `MQTT_USERNAME`: (Optional) Username for MQTT broker authentication.
    *   `MQTT_PASSWORD`: (Optional) Password for MQTT broker authentication.
    *   `MQTT_TOPIC_PREFIX`: Prefix for MQTT topics (e.g., `/blegateways/aprilbrother/device/`).

### FR-006: Logging
*   **FR-006.1:** The application MUST log startup information, including the port it's listening on.
*   **FR-006.2:** The application SHOULD log basic information about received requests (e.g., source IP, content type).
*   **FR-006.3:** The application SHOULD log the number of devices processed from each incoming message.
*   **FR-006.4:** The application MUST log any errors encountered during data processing or MQTT publishing.

## 4. Data Formats

### 4.1 Incoming Gateway Data (MessagePack/JSON)
The data received from the gateway is in MessagePack v5 format. When decoded from the gateway's POST request it contains a dictionary/object.

#### 4.1.1 Top-Level Keys:
*   `v`: (String) Firmware version of the gateway.
*   `mid`: (Integer/String) Message ID.
*   `time`: (Integer/String) Boot time of the gateway (format may vary, often seconds since boot).
*   `ip`: (String) The IP address of the gateway.
*   `mac`: (String) The MAC address of the gateway.
*   `rssi`: (Integer, Optional) The RSSI of the WiFi connection for the gateway. Appears when using WiFi connection from firmware v1.5.0.
*   `iccid`: (String, Optional) The ICCID of the 4G module. Appears when using 4G connection from firmware v1.5.3.
*   `devices`: (Array) An array of BLE advertising data strings/buffers that the gateway collected. Each element is a raw data frame for a single BLE device advertisement.

### 4.2 `devices` Array Element Data Format (Raw BLE Advertising Data)
Each element within the `devices` array is a sequence of bytes representing a BLE advertisement.

#### 4.2.1 Byte Structure:
| Bytes      | Description                                      | Example (from docs) |
| :--------- | :----------------------------------------------- | :------------------ |
| Byte 1     | Advertising Type Code (see Section 4.2.3)        | `00`                |
| Bytes 2-7  | MAC Address for BLE device (6 bytes)             | `12 3b 6a 1a 64 cf` |
| Byte 8     | RSSI (integer, actual value = byte value - 256)  | `aa` (0xAA - 256 = -86 dBm) |
| Bytes 9+   | Raw Advertisement Data                           | `02 01 ... c5`      |

#### 4.2.2 Example `devices` element (Hex Data):
```
02C8FD1949A530CE0201061AFF4C000215EB6D469624BE4663B15230D46B0E9CC9000D002AC0
```

Breakdown:
*   `02`: Advertising Type Code (Scannable undirected advertisement)
*   `C8FD1949A530`: MAC address
*   `CE`: RSSI (0xCE - 256 = 206 - 256 = -50 dBm)
*   `0201061AFF4C000215EB6D469624BE4663B15230D46B0E9CC9000D002AC0`: Raw Advertising Data

#### 4.2.3 Advertising Type Codes:
| Code | Description                             |
| :--- | :-------------------------------------- |
| `0`  | Connectable undirected advertisement    |
| `1`  | Connectable directed advertisement      |
| `2`  | Scannable undirected advertisement      |
| `3`  | Non-Connectable undirected advertisement|
| `4`  | Scan Response                           |

### 4.3 Outgoing MQTT Message Payload (JSON)
For each BLE device detected, the application will publish a JSON message with the following structure:
```
{
  "mac_address": "12:3B:6A:1A:64:CF",
  "rssi": -86,
  "advertising_type_code": 0,
  "advertising_type_description": "Connectable undirected advertisement",
  "advertisement_data_hex": "0201061AFF4C000215B5B182C7EAB14988AA99B5C1517008D90001CF64C5",
  "last_seen_timestamp": "2023-10-27T12:34:56.789Z",
  "gateway_mac": "AA:BB:CC:DD:EE:FF",
  "gateway_ip": "192.168.1.100"
}
```

## 5. Non-Functional Requirements

*   **NFR-001: Technology Stack:** The application MUST be developed using Node.js and leverage modern JavaScript/TypeScript practices.
*   **NFR-002: Deployment:** The application MUST be deployable as a Docker container.
*   **NFR-003: Performance:** The application should efficiently process incoming data bursts from the gateway without significant delay in publishing to MQTT.
*   **NFR-004: Reliability:** The application should handle common network issues gracefully (e.g., temporary MQTT broker unavailability should throw errors and drop incoming data. It is acceptable to miss data).
*   **NFR-005: Maintainability:** Code should be well-structured, commented where necessary, and follow common Node.js best practices to facilitate future maintenance and enhancements.

## 6. Assumptions and Dependencies

*   The April Brother BLE Gateway V4 is correctly configured to send data to this application's HTTP endpoint.
*   The format of the data sent by the gateway matches the documentation provided.
*   An MQTT broker is accessible to the application with the necessary credentials.
*   Network connectivity exists between the gateway, this application, and the MQTT broker.
*   The gateway's `Advertising filter` configuration (e.g., "Allow All", "iBeacon Only") will determine the types of BLE advertisements received by this application. This application does not implement further filtering logic based on these gateway settings but processes whatever data it receives.






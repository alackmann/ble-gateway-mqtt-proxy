# Technical Specification Document: BLE Gateway Data Processor

## 1. Introduction

### 1.1 Purpose
This document provides the technical specifications for the BLE Gateway Data Processor application. It details the system architecture, component design, data structures, APIs, and deployment considerations necessary for engineers to build the solution outlined in the Functional Requirements Document (FRD).

### 1.2 Scope
This specification covers the design and implementation details of the Node.js application responsible for:
*   Receiving data from an April Brother BLE Gateway V4 via HTTP.
*   Decoding MessagePack or JSON payloads.
*   Parsing gateway and BLE advertising data.
*   Transforming extracted BLE device information into a defined JSON format.
*   Publishing this JSON data to an MQTT broker.
*   Configuration via environment variables.
*   Containerization using Docker.

Reference the Functional Requirements Document for a complete list of functional and non-functional requirements.

### 1.3 Definitions and Acronyms
Refer to the FRD for definitions and acronyms. Additional technical terms will be defined inline.

## 2. System Architecture

The system follows a simple data pipeline architecture:

April Brother BLE Gateway V4 --(HTTP POST)--> [ BLE Gateway Data Processor (Node.js Application) ] --(MQTT Publish)--> MQTT Broker
|
+-- Configuration (ENV Vars / .env)
+-- Docker Container



**Workflow:**
1.  The April Brother BLE Gateway V4 scans for BLE advertisements and periodically sends this data as an HTTP POST request to the BLE Gateway Data Processor.
2.  The Data Processor receives the request, determines the content type (MessagePack) and decodes the payload.
3.  It parses the gateway-level information (firmware version, MAC, IP, etc.).
4.  It iterates through the `devices` array, parsing each raw BLE advertisement to extract device MAC, RSSI, advertising type, and raw advertisement data.
5.  For each processed BLE device, it constructs a JSON message including a `last_seen_timestamp` and optional gateway information.
6.  This JSON message is then published to a specific MQTT topic, derived from a configurable prefix and the BLE device's MAC address.
7.  The application runs within a Docker container and is configured via environment variables.

## 3. Component Design

The application will be built using Node.js and will consist of several key modules/components:

### 3.1 HTTP Ingestion Layer
*   **Technology:** Express.js framework.
*   **Endpoint:** `POST /tokendata`
*   **Request Handling:**
    *   Middleware: `express.raw({ type: ['application/msgpack'] })` will be used to receive the body as a Buffer, regardless of its original encoding.
    *   Content-Type Detection: `req.get('Content-Type')` will be used to determine how to decode the body.
*   **Response Handling:**
    *   Success: HTTP `204 No Content` (as no body needs to be returned, `200 OK` is also acceptable).
    *   Client Error (e.g., malformed data, unsupported content type): HTTP `400 Bad Request`.
    *   Server Error: HTTP `500 Internal Server Error`.
*   **Primary Responsibilities:**
    *   Listen for incoming HTTP POST requests.
    *   Pass the raw request body and content type to the Data Processing Layer.
    *   Send appropriate HTTP responses.

### 3.2 Data Processing Layer

#### 3.2.1 Payload Decoder
*   **Input:** Raw request body (Buffer) and `Content-Type` string.
*   **Technology:**
    *   MessagePack: `msgpack5` library (or equivalent). `msgpack.decode(body)`
*   **Output:** JavaScript object representing the decoded gateway data.
*   **Error Handling:** Catches decoding errors and signals them for appropriate HTTP error response.

#### 3.2.2 Gateway Data Parser
*   **Input:** Decoded JavaScript object from the Payload Decoder.
*   **Logic:**
    *   Extracts top-level gateway information: `v`, `mid`, `time`, `ip`, `mac`, `rssi` (gateway WiFi), `iccid`.
    *   Validates the presence and basic type of the `devices` array.
*   **Output:** Gateway metadata and the `devices` array for further processing.

#### 3.2.3 BLE Device Data Parser
*   **Input:** A single element from the `devices` array (which is a raw advertising data frame, likely a Buffer if decoded from MessagePack, or a hex string if directly from JSON that was pre-converted). If it's a hex string, it must first be converted to a Buffer.
*   **Logic:**
    *   The raw data frame will be treated as a Buffer.
    *   **Advertising Type Code:** `buffer.readUInt8(0)` (Byte 1).
    *   **BLE Device MAC Address:** `buffer.slice(1, 7)`. This 6-byte buffer will be converted to a colon-separated hexadecimal string (e.g., "12:3B:6A:1A:64:CF"). Ensure Most Significant Byte (MSB) first ordering for the string representation.
    *   **RSSI:** `buffer.readInt8(7)`. The documentation states "minus 256 for real value". This implies the value is an unsigned byte that needs conversion. For `aa` (0xAA = 170), `170 - 256 = -86`. So, `buffer.readUInt8(7) - 256`.
    *   **Raw Advertisement Data:** `buffer.slice(8)`. This will be converted to a hexadecimal string.
*   **Output:** A JavaScript object containing `advertising_type_code`, `mac_address` (string), `rssi` (integer), and `advertisement_data_hex` (string) for a single BLE device.

#### 3.2.4 Output JSON Formatter
*   **Input:** Parsed BLE device data (from 3.2.3) and gateway metadata (MAC, IP from 3.2.2).
*   **Logic:**
    *   Constructs the final JSON payload as specified in FRD Section 4.3.
    *   `advertising_type_description`: Look up description based on `advertising_type_code` using a predefined map (see FRD 4.2.3).
    *   `last_seen_timestamp`: `new Date().toISOString()`.
    *   Includes `gateway_mac` and `gateway_ip` if available.
*   **Output:** The final JavaScript object to be serialized and sent to MQTT.

### 3.3 MQTT Publishing Layer
*   **Technology:** `mqtt.js` library.
*   **Connection Management:**
    *   Establishes a connection to the MQTT broker using `MQTT_BROKER_URL`, `MQTT_USERNAME`, and `MQTT_PASSWORD` from configuration.
    *   Handles connection events (`connect`, `error`, `close`, `reconnect`) with appropriate logging.
*   **Message Publishing:**
    *   Topic Construction: `<MQTT_TOPIC_PREFIX><DEVICE_MAC_ADDRESS>`. The `<DEVICE_MAC_ADDRESS>` will be the colon-separated hex string.
    *   Payload: `JSON.stringify()` the output object from the Output JSON Formatter (3.2.4).
    *   QoS Level: Configurable, default to 1 (At Least Once). 
    *   Retain Flag: Configurable, default to false.
*   **Error Handling:** Logs errors during publishing. Retry mechanisms are not required.

### 3.4 Configuration Module
*   **Technology:** `dotenv` library for loading `.env` files during local development.
*   **Logic:**
    *   Reads configuration values from environment variables.
    *   If `NODE_ENV` is not 'production' (or similar), it will attempt to load variables from a `.env` file in the project root.
    *   Environment variables will always override values from `.env`.
*   **Exposed Variables (examples, see FRD for full list):**
    *   `SERVER_PORT`
    *   `MQTT_BROKER_URL`
    *   `MQTT_USERNAME`
    *   `MQTT_PASSWORD`
    *   `MQTT_TOPIC_PREFIX`
    *   `LOG_LEVEL` (e.g., 'info', 'debug', 'warn', 'error' - good practice for logging module)
*   **Access:** Provides a clean way to access configuration values throughout the application (e.g., a global config object or getter functions).

### 3.5 Logging Module
*   **Technology:** Standard `console.log`/`error`/`warn` initially.
*   **Log Levels:** Implement basic log levels (INFO, WARN, ERROR, DEBUG if configured).
*   **Key Log Points:**
    *   Application startup (listening port, MQTT broker connected).
    *   Incoming HTTP request (method, path, content-type, source IP).
    *   Payload decoding success/failure.
    *   Number of BLE devices processed per request.
    *   MQTT publishing success/failure (topic, part of payload for identification).
    *   All errors encountered.

## 4. Data Structures (Internal & External)

### 4.1 Incoming Gateway Data (Post-Decoding)
JavaScript object equivalent to the structure defined in FRD Section 4.1.
Example keys: `v`, `mid`, `time`, `ip`, `mac`, `devices` (array of Buffers or hex strings).

### 4.2 Intermediate Parsed BLE Device Data
A JavaScript object before final MQTT formatting:
```
{
  advertising_type_code: 0, // Integer
  mac_address_buffer: <Buffer ...>, // Raw 6-byte MAC
  mac_address_string: "12:3B:6A:1A:64:CF", // Formatted MAC
  rssi: -86, // Integer
  advertisement_data_buffer: <Buffer ...>, // Raw adv data
  advertisement_data_hex: "020106..." // Hex string of adv data
}
```

### 4.3 Outgoing MQTT Message Payload (JSON)
As defined in FRD Section 4.3.
```json
{
  "mac_address": "12:3B:6A:1A:64:CF",
  "rssi": -86,
  "advertising_type_code": 0,
  "advertising_type_description": "Connectable undirected advertisement",
  "advertisement_data_hex": "0201061AFF4C000215B5B182C7EAB14988AA99B5C1517008D90001CF64C5",
  "last_seen_timestamp": "2023-10-27T12:34:56.789Z",
  "gateway_mac": "AA:BB:CC:DD:EE:FF", // Optional
  "gateway_ip": "192.168.1.100"       // Optional
}
```
## 5. API Specification (HTTP Endpoint)

*   **Method:** `POST`
*   **Path:** `/tokendata`
*   **Request Headers:**
    *   `Content-Type`: MUST be `application/msgpack`.
*   **Request Body:**
    *   If `application/msgpack`: Binary MessagePack data.
    *   Structure as defined in FRD Section 4.1.
*   **Success Responses:**
    *   `204 No Content`: Successfully received, decoded, and queued data for MQTT publishing.
*   **Error Responses:**
    *   `400 Bad Request`:
        *   Missing or invalid `Content-Type` header.
        *   Failed to decode/parse the request body (malformed MessagePack/JSON).
        *   Essential data missing in payload (e.g., no `devices` array).
        *   Body: Optional JSON with error details: `{"error": "description"}`.
    *   `500 Internal Server Error`:
        *   Unexpected server-side error during processing or MQTT publishing.
        *   Body: Optional JSON with error details: `{"error": "description"}`.

## 6. Deployment

### 6.1 Docker
*   A `Dockerfile` will be created to build the application image.
*   **Base Image:** A suitable official Node.js image (e.g., `node:22-alpine`).
*   **Dockerfile Steps:**
    1.  Set `WORKDIR`.
    2.  Copy `package.json` and `package-lock.json`.
    3.  Run `npm install --production`.
    4.  Copy application source code.
    5.  `EXPOSE <SERVER_PORT>` (using the default or configured port).
    6.  Ensure ENVVARS are exposed to container code
    7.  Set `CMD` to run the application (e.g., `["node", "src/index.js"]`).
*   **Configuration:** All configuration (FRD 5.3) will be passed to the Docker container via environment variables at runtime, either via docker run or docker-compose (`docker run -e VAR=value ...`).

## 7. Error Handling Strategy

*   **HTTP Layer:** Use Express.js error handling middleware. Centralized error handler to format error responses and log them.
*   **Data Processing:** Use `try...catch` blocks for decoding and parsing operations. Errors should propagate up to be handled by the HTTP layer for client responses.
*   **MQTT Layer:** The `mqtt.js` client has error events. These should be logged. For publishing errors, log the error and the message that failed. Retries are out of scope for the initial build.
*   **Logging:** All significant errors will be logged with context (e.g., relevant data snippet, operation being performed).

## 8. Security Considerations

*   **Input Validation:** Basic validation of incoming payload structure (e.g., checking for the `devices` array).
*   **Dependencies:** Regularly update dependencies to patch known vulnerabilities (`npm audit`).
*   **HTTPS:** This endpoint will server HTTP only. Any HTTPS requirements will be handled by a reverse proxy (e.g., Nginx, Traefik) in front of the Node.js application and is out of scope for this application.
*   **MQTT Security:** Use TLS for MQTT connection if the broker supports it and credentials (`MQTT_USERNAME`, `MQTT_PASSWORD`) are sensitive. 

## 9. Libraries and Technologies

*   **Runtime:** Node.js (22.x)
*   **HTTP Framework:** Express.js
*   **MessagePack Library:** `msgpack5` (or other suitable, well-maintained library)
*   **MQTT Client:** `mqtt` (mqtt.js)
*   **Environment Variables:** `dotenv` (for local development)
*   **Containerization:** Docker


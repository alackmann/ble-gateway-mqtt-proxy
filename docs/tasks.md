# BLE Gateway Data Processor: Engineering Task List

This task list outlines the development steps for the BLE Gateway Data Processor, based on the provided Functional Requirements Document (FRD). Engineers should refer to the FRD for detailed specifications. Tasks are ordered with foundational work first.

1.  **Task: Setup Node.js Project Structure and Dependencies**
    *   **Description:** Initialize a new Node.js project (e.g., using `npm init`). Install essential dependencies: Express.js for the HTTP server, a MessagePack library (e.g., `msgpack5`), an MQTT client library (e.g., `mqtt`), and a library for managing environment variables (e.g., `dotenv`). Set up basic project structure (e.g., `src` folder, entry point file).

2.  **Task: Implement Configuration Management**
    *   **Description:** Develop the mechanism to read all required configuration parameters (HTTP port, MQTT broker URL, credentials, topic prefix) from environment variables. Implement support for a `.env` file for easy local development, ensuring environment variables take precedence.

3.  **Task: Develop Basic HTTP Ingestion Endpoint**
    *   **Description:** Create an Express.js HTTP server that listens on the configured port. Implement a POST endpoint at the root (`/`) capable of receiving raw request bodies for `application/msgpack` and `application/json` content types as specified in FR-001.

4.  **Task: Implement Request Body Decoding**
    *   **Description:** Within the HTTP endpoint, add logic to check the `Content-Type` header. Decode `application/msgpack` bodies using the chosen library and parse `application/json` bodies. Initially, log the decoded data to verify successful ingestion (FR-002).

5.  **Task: Setup Basic Logging Framework**
    *   **Description:** Integrate a simple logging mechanism (e.g., `console.log` initially, or a lightweight logging library). Implement basic logs for server startup, received requests (type, source), and any immediate errors during decoding (FR-006).

6.  **Task: Parse Top-Level Gateway Data Structure**
    *   **Description:** After successful decoding, parse the top-level keys from the gateway's message (`v`, `mid`, `time`, `ip`, `mac`, `devices`, etc.) as defined in FRD Section 4.1. Make gateway `mac` and `ip` available for inclusion in device messages later.

7.  **Task: Parse Raw BLE Device Data from 'devices' Array**
    *   **Description:** Implement the logic to iterate through the `devices` array from the gateway message. For each raw device data string/buffer, accurately parse out the advertising type code, device MAC address, RSSI (with adjustment), and the raw advertisement data payload, according to the byte structure in FRD Section 4.2.

8.  **Task: Transform Parsed Device Data to JSON Payload**
    *   **Description:** For each successfully parsed BLE device, construct the JSON output object as specified in FR-003.3 and FRD Section 4.3. This includes formatting the MAC address, calculating the advertising type description, converting advertisement data to hex, and adding the `last_seen_timestamp` and optional gateway details.

9.  **Task: Implement MQTT Client Connection**
    *   **Description:** Integrate the MQTT client library. Implement logic to connect to the MQTT broker using the configured URL, username, and password. Handle connection events (connect, error, close) with appropriate logging.

10. **Task: Implement MQTT Publishing Logic**
    *   **Description:** For each generated JSON device payload, publish it to the MQTT broker. Dynamically construct the MQTT topic using the configured `MQTT_TOPIC_PREFIX` and the device's MAC address, as per FR-004.4. Log successful publications or any errors.

11. **Task: Create Dockerfile and Dockerize Application**
    *   **Description:** Write a `Dockerfile` to build a container image for the Node.js application. Ensure the Dockerfile correctly installs dependencies, copies application code, exposes the necessary port, and sets up the entry point. Verify that configuration can be passed via environment variables to the Docker container (NFR-002, FR-005).

12. **Task: Implement Robust Error Handling and HTTP Responses**
    *   **Description:** Refine error handling throughout the application. Ensure the HTTP endpoint returns appropriate status codes (e.g., `200 OK`/`204 No Content` for success, `400 Bad Request` for malformed input, `500 Internal Server Error` for processing issues) as per FR-001.5 and FR-001.6.

13. **Task: Enhance Application Logging (Comprehensive)**
    *   **Description:** Expand logging to provide more detailed operational insights. This includes logging the number of devices processed from each incoming message, details of MQTT publishing successes/failures, and any other significant events or errors (FR-006). Consider log levels if using a more advanced logger.

14. **Task: Testing and Validation**
    *   **Description:** Thoroughly test the application. This includes sending sample MessagePack and JSON data, verifying the structure and content of MQTT messages, testing configuration via `.env` and direct ENV VARs, and checking Docker container functionality.

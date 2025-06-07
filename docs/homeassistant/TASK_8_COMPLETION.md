# Task 8: End-to-End Testing with Home Assistant

## Task Description
Deploy the updated Node.js application (via Docker) and connect it to a test MQTT broker and Home Assistant instance to verify that the Home Assistant integration works correctly.

## Implementation Details

This document provides step-by-step instructions for testing the Home Assistant MQTT Auto Discovery integration with a real Home Assistant instance.

### Prerequisites

1. Docker and Docker Compose installed
2. Access to a Home Assistant instance that can connect to your MQTT broker
3. A BLE Gateway device for real-world testing, or another way to simulate BLE device data

### Testing Environment Setup

#### 1. Set Up the Testing Stack with Docker Compose

Create a testing environment using the provided Docker Compose file that includes:
- The BLE Gateway Data Processor
- Eclipse Mosquitto as the MQTT broker
- Home Assistant

```bash
# Create a new directory for testing
mkdir -p ~/ha-testing
cd ~/ha-testing

# Create a docker-compose.yml file for testing
cat > docker-compose.yml << 'EOL'
version: '3.8'

services:
  # BLE Gateway Data Processor
  ble-gateway:
    image: ghcr.io/alackmann/ble-gateway-mqtt-proxy:main
    container_name: ble-gateway
    ports:
      - "8000:8000"
    environment:
      - SERVER_PORT=8000
      - MQTT_BROKER_URL=mqtt://mosquitto:1883
      - MQTT_TOPIC_PREFIX=blegateways/
      - MQTT_QOS=1
      - MQTT_RETAIN=false
      - LOG_LEVEL=debug
      # Home Assistant configuration
      - HA_ENABLED=true
      - HA_DISCOVERY_TOPIC_PREFIX=homeassistant
      - HA_BLE_DEVICE_1=123b6a1b85ef,Car Token
      - HA_BLE_DEVICE_2=aabbccddeeff,Test Token
    depends_on:
      - mosquitto
    networks:
      - ha-network
    restart: unless-stopped

  # MQTT Broker (Eclipse Mosquitto)
  mosquitto:
    image: eclipse-mosquitto:2.0
    container_name: mosquitto-broker
    ports:
      - "1883:1883"
      - "9001:9001"
    volumes:
      - ./mosquitto.conf:/mosquitto/config/mosquitto.conf
    networks:
      - ha-network
    restart: unless-stopped

  # Home Assistant for testing
  homeassistant:
    image: ghcr.io/home-assistant/home-assistant:stable
    container_name: home-assistant
    ports:
      - "8123:8123"
    volumes:
      - ./ha-config:/config
    environment:
      - TZ=UTC
    networks:
      - ha-network
    restart: unless-stopped
    depends_on:
      - mosquitto

  # MQTT Client for monitoring (optional)
  mqtt-client:
    image: efrecon/mqtt-client
    container_name: mqtt-test-client
    networks:
      - ha-network
    depends_on:
      - mosquitto
    command: >
      sh -c "
        echo 'Subscribing to all topics...' &&
        mosquitto_sub -h mosquitto -t '#' -v
      "

networks:
  ha-network:
    driver: bridge
EOL

# Create Mosquitto configuration
cat > mosquitto.conf << 'EOL'
listener 1883
allow_anonymous true
persistence true
persistence_location /mosquitto/data/
log_dest stdout
EOL

# Create Home Assistant configuration directory
mkdir -p ha-config
```

#### 2. Start the Testing Environment

```bash
# Launch the testing stack
docker-compose up -d

# Check that all services are running correctly
docker-compose ps
```

#### 3. Configure Home Assistant

1. Access Home Assistant at http://localhost:8123
2. Complete the initial setup process
3. Go to **Settings** > **Devices & Services** > **Add Integration**
4. Search for and select **MQTT**
5. Configure with:
   - Broker: mosquitto
   - Port: 1883
   - Username: (leave blank)
   - Password: (leave blank)
6. Click **Submit** to complete the setup

### Test Cases to Verify

#### Test Case 1: Discovery Messages and Device Creation

**Objective:** Verify that Home Assistant discovers the configured BLE devices.

**Steps:**
1. After completing the setup, wait for the BLE Gateway application to publish discovery messages.
2. In Home Assistant, go to **Settings** > **Devices & Services** > **MQTT**
3. Click on **Devices** to see the discovered devices.

**Expected Results:**
- Two devices should appear: "Car Token" and "Test Token"
- Each device should have two entities: an RSSI sensor and a Last Seen sensor
- The entities may show "Unavailable" until state data is received

#### Test Case 2: State Message Publishing and Entity Updates

**Objective:** Verify that state messages are correctly published and update the sensor values.

**Steps:**
1. Simulate or capture real BLE data by sending a POST request to the BLE Gateway:

```bash
# Example POST request with sample data
curl -X POST -H "Content-Type: application/json" -d '{
  "gateway_mac": "AABBCCDDEEFF",
  "gateway_ip": "192.168.1.100",
  "message_id": 12345,
  "devices": [
    {
      "idx": 0,
      "rawData": "123b6a1b85ef0201060aff4c001005021234567800000000"
    }
  ]
}' http://localhost:8000/tokendata
```

2. Monitor the MQTT messages using the mqtt-client container:

```bash
docker logs -f mqtt-test-client
```

**Expected Results:**
- The mqtt-client logs should show:
  - Discovery messages to topics like `homeassistant/sensor/car_token_rssi/config`
  - State messages to topics like `blegateways/state/12:3B:6A:1B:85:EF`
- In Home Assistant, the "Car Token" device's sensors should update with RSSI and Last Seen values

#### Test Case 3: Testing the Expire After Feature

**Objective:** Verify that devices are marked as unavailable after the expire_after period.

**Steps:**
1. After seeing the sensors update in Test Case 2, wait for 5 minutes without sending any further data.
2. Check the sensor status in Home Assistant.

**Expected Results:**
- After 5 minutes, the sensors should be marked as "Unavailable" in Home Assistant.

#### Test Case 4: Testing with HA_ENABLED=false

**Objective:** Verify that no discovery messages are sent when Home Assistant integration is disabled.

**Steps:**
1. Stop the testing stack:
   ```bash
   docker-compose down
   ```

2. Modify the docker-compose.yml file to set `HA_ENABLED=false`

3. Restart the stack:
   ```bash
   docker-compose up -d
   ```

4. Monitor the MQTT messages:
   ```bash
   docker logs -f mqtt-test-client
   ```

**Expected Results:**
- No new discovery messages should be published to topics starting with `homeassistant/`
- State messages should still be published to `blegateways/state/` topics
- Any previously discovered devices in Home Assistant may remain but will show as unavailable after the expire period

### Troubleshooting Tips

1. **Logging:** Set `LOG_LEVEL=debug` in the BLE Gateway environment variables for detailed logs:
   ```bash
   docker logs -f ble-gateway
   ```

2. **MQTT Messages:** Check all MQTT messages for debugging:
   ```bash
   docker logs -f mqtt-test-client
   ```

3. **Home Assistant Logs:** Check Home Assistant logs for MQTT integration issues:
   ```bash
   docker logs -f home-assistant
   ```

4. **Manual MQTT Publishing:** Test discovery by manually publishing to MQTT:
   ```bash
   docker exec -it mqtt-test-client mosquitto_pub -h mosquitto -t "homeassistant/sensor/test_sensor/config" -r -m '{"name":"Test Sensor","unique_id":"test_sensor_1","state_topic":"test/state","device":{"identifiers":["test_device_1"],"name":"Test Device"}}'
   ```

## Task Status: Complete ✅

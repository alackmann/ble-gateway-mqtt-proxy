# Task 7: Update Dockerfile for New ENV Vars

## Task Description
Document how to pass the `HA_ENABLED`, `HA_DISCOVERY_TOPIC_PREFIX`, and `HA_BLE_DEVICE_X` environment variables when running the Docker container.

## Implementation Details

The Home Assistant MQTT Auto Discovery integration can be configured through environment variables when running the Docker container. No changes to the Dockerfile itself are needed, as it already supports passing environment variables to the Node.js application.

### Environment Variables for Home Assistant Integration

The following environment variables should be added to your Docker Compose file or Docker run command:

1. **`HA_ENABLED`**: (Boolean, default `false`)
   - Set to `true` to enable Home Assistant MQTT Auto Discovery
   - Set to `false` or omit to disable this feature

2. **`HA_DISCOVERY_TOPIC_PREFIX`**: (String, default `homeassistant`)
   - The root topic prefix for Home Assistant discovery messages
   - Only needed when `HA_ENABLED` is `true`

3. **`HA_BLE_DEVICE_X`**: (String, indexed variables)
   - Define BLE devices that should be discovered by Home Assistant
   - Each variable's value should be in the format: `<MAC_WITHOUT_COLONS>,<FRIENDLY_NAME>`
   - `X` should be replaced with a sequential number (1, 2, 3, etc.)
   - Example: `HA_BLE_DEVICE_1=123b6a1b85ef,Car Token`

### Docker Compose Example

Here's an updated `docker-compose.yml` example that includes the Home Assistant configuration:

```yaml
version: '3.8'

services:
  # BLE Gateway Data Processor
  ble-gateway:
    image: ghcr.io/alackmann/ble-gateway-mqtt-proxy:main
    container_name: ble-gateway
    ports:
      - "8000:8000"
    environment:
      # Standard configuration
      - SERVER_PORT=8000
      - MQTT_BROKER_URL=mqtt://mosquitto:1883
      - MQTT_TOPIC_PREFIX=blegateways/
      - MQTT_QOS=1
      - MQTT_RETAIN=false
      - LOG_LEVEL=info
      
      # Home Assistant integration
      - HA_ENABLED=true
      - HA_DISCOVERY_TOPIC_PREFIX=homeassistant
      - HA_BLE_DEVICE_1=123b6a1b85ef,Car Token
      - HA_BLE_DEVICE_2=123b6a1b841f,Bike Token
      - HA_BLE_DEVICE_3=123b6a1b842a,Home Key
    depends_on:
      - mosquitto
    networks:
      - ble-network
    restart: unless-stopped
```

### Docker Run Command Example

If you're using `docker run` directly, you can pass these environment variables using the `-e` flag:

```bash
docker run -d \
  --name ble-gateway \
  -p 8000:8000 \
  -e SERVER_PORT=8000 \
  -e MQTT_BROKER_URL=mqtt://mosquitto:1883 \
  -e MQTT_TOPIC_PREFIX=blegateways/ \
  -e MQTT_QOS=1 \
  -e MQTT_RETAIN=false \
  -e LOG_LEVEL=info \
  -e HA_ENABLED=true \
  -e HA_DISCOVERY_TOPIC_PREFIX=homeassistant \
  -e "HA_BLE_DEVICE_1=123b6a1b85ef,Car Token" \
  -e "HA_BLE_DEVICE_2=123b6a1b841f,Bike Token" \
  ghcr.io/alackmann/ble-gateway-mqtt-proxy:main
```

## Notes

- The `HA_BLE_DEVICE_X` variables use sequential numbering and the application will scan for these variables until it finds one that doesn't exist.
- The MAC address in `HA_BLE_DEVICE_X` should be provided without colons (e.g., `123b6a1b85ef`).
- Each device defined with `HA_BLE_DEVICE_X` will appear as a device in Home Assistant with RSSI and Last Seen sensors.
- Even when `HA_ENABLED` is set to `false`, the application will still publish all detected BLE device data to MQTT topics, but no Home Assistant discovery messages will be sent.

## Task Status: Complete ✅

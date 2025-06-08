# BLE Gateway Data Processor

[![Build and Publish Docker Image](https://github.com/alackmann/ble-gateway-mqtt-proxy/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/alackmann/ble-gateway-mqtt-proxy/actions/workflows/docker-publish.yml)
[![CI - Test and Build](https://github.com/alackmann/ble-gateway-mqtt-proxy/actions/workflows/ci.yml/badge.svg)](https://github.com/alackmann/ble-gateway-mqtt-proxy/actions/workflows/ci.yml)

A Node.js application that receives MessagePack-encoded data from an [April Brother](https://www.aprbrother.com/en/) BLE Gateway V4, processes BLE device advertising data, and publishes structured JSON messages to an MQTT broker for integration into home automation systems (eg. Home Assistant, OpenHAB). Can be used in conjunction with BLE tokens to implement Presence detection via BT advertisements.

## Features

- ✅ **BLE Gateway Integration**: Receives MessagePack data from April Brother BLE Gateway V4
- ✅ **MQTT Publishing**: Publishes structured JSON messages to MQTT broker
- ✅ **Home Assistant Ready**: MQTT Auto Discovery for both BLE devices and gateway status
- ✅ **Production Ready**: Comprehensive logging, testing, and Docker support
- ✅ **Easy Deployment**: Environment-based configuration with Docker images

## Quick Start

### Using Docker (Recommended)

```bash
# Pull and run the latest image
docker run -d \
  --name ble-gateway-processor \
  -p 8000:8000 \
  -e MQTT_BROKER_URL=mqtt://your-broker:1883 \
  -e HA_ENABLED=true \
  ghcr.io/alackmann/ble-gateway-mqtt-proxy:latest
```

### Using Node.js

1. **Install and Configure**
   ```bash
   npm install
   cp .env.example .env
   # Edit .env with your settings
   ```

2. **Run the Application**
   ```bash
   npm start
   ```

## Configuration

### Essential Settings

- `MQTT_BROKER_URL`: Your MQTT broker connection URL
- `MQTT_TOPIC_PREFIX`: Topic prefix for published messages (default: `blegateway`)
- `SERVER_PORT`: HTTP server port (default: 8000)
- `LOG_LEVEL`: Logging level (debug, info, warn, error)

### Home Assistant Integration

- `HA_ENABLED`: Enable Home Assistant MQTT Auto Discovery (default: false)
- `HA_DISCOVERY_TOPIC_PREFIX`: Discovery topic prefix (default: homeassistant)
- `HA_BLE_DEVICE_X`: Define BLE devices as `mac_address,friendly_name` (e.g. `123b6a1b85ef,Car Token`)
- `HA_GATEWAY_NAME`: Gateway display name in Home Assistant (default: April Brother BLE Gateway)

Example configuration:
```bash
HA_ENABLED=true
HA_BLE_DEVICE_1=123b6a1b85ef,Car Token
HA_BLE_DEVICE_2=456c7d2c96f0,Bike Sensor
HA_GATEWAY_NAME=My BLE Gateway
```

When enabled, both your BLE devices and the gateway itself appear automatically in Home Assistant with RSSI, last seen, and gateway status sensors.

## API

### POST /tokendata
Accepts MessagePack-encoded BLE device data from the gateway.

- **Content-Type**: Any (MessagePack auto-detected)
- **Response**: 204 No Content on success

### GET /health
Health check endpoint returning system status.

## MQTT Output

Published messages follow this structure:
```json
{
  "mac": "12:34:56:78:90:AB",
  "rssi": -45,
  "timestamp": "2024-01-15T10:30:00.000Z",
  "advertising_type": "Connectable undirected",
  "advertisement_data_hex": "020106..."
}
```

**Topics:**
- Device data: `blegateway/state/{mac_address}`
- Gateway status: `blegateway/gateway/state`

## Documentation

### For Users
- **[Home Automation Integration](docs/homeassistant/home_automation_integration.md)** - Auto-discovery of sensors for Home Assistant & OpenHAB

### For Developers
- **[Release Process](docs/RELEASE_WORKFLOW.md)** - How to create releases

### Development Specs
I write a number of documents to outline the system requirements before coding.
- **[Functional Requirements](docs/functional.md)** - What the system does
- **[Technical Specifications](docs/technical.md)** - How the system works
- **[Task list](docs/tasks.md)** - What order to build things in
- **[Home Assistant Spec](docs/homeassistant/home_assistant.md)** - Refactor to use HA topic format

## Development

**Run tests:**
```bash
npm test
```
See [Test documentation](test/README.md) for more.

**Create a release:**
```bash
npm run prepare-release  # Creates version bump PR
npm run release          # Tags and publishes release
```

See [Release Process Documentation](docs/RELEASE_WORKFLOW.md) for detailed workflow.

## Production Deployment

### Docker Compose

```yaml
version: '3.8'
services:
  ble-gateway-processor:
    image: ghcr.io/alackmann/ble-gateway-mqtt-proxy:latest
    ports:
      - "8000:8000"
    environment:
      MQTT_BROKER_URL: mqtt://mosquitto:1883
      HA_ENABLED: true
      HA_BLE_DEVICE_1: 123b6a1b85ef,Car Token
    restart: unless-stopped
```

### Version Pinning

For production, pin to specific versions:
```bash
# Exact version
ghcr.io/alackmann/ble-gateway-mqtt-proxy:1.2.3

# Latest patch in minor version
ghcr.io/alackmann/ble-gateway-mqtt-proxy:1.2

# Latest minor in major version  
ghcr.io/alackmann/ble-gateway-mqtt-proxy:1
```

## Status

✅ **Production Ready** - Successfully processing real hardware data from BLE Gateway V4


## A note from a human

Hey there, I created this project to solve a small problem I had moving BLE device data from the April Brother Gateway to OpenHAB home automation. I could have hacked something up quickly (and have something old that does just that) but it was a good opportunity to get my 'vibe-coding' on.

This whole repo and codebase took 3-4 hours of actual work to complete. All the code and docs are 100% written by AI. The code is a mixture of Claude 3.7 & 4, using Github Copilot Agent. I created the docs content first by dumping some specs and bullet points into Google Gemini. After some small tweaks, in VSCode I stepped through the task list building out the app.

I'm impressed. Yes this is a fairly simply API. It only really has two endpoints and doesn't do any significantly complex work on the incoming data, other than formatting and sending to an MQTT endpoint. Claude is fairly verbose and wrote a LOT of code - certainly much more than I would have done. But it has 100s of unit tests and integration tests, it's neat and clean code and I only had to intervene a handful of times. It SURE does love to write documentation though - so much text. Ease up bro!

Overall this was an interesting personal glimpse into what's possible with the current AI tools. I'm already thinking more about what else I can build.

-Andre
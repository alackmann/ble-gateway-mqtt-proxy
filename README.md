# BLE Gateway Data Processor

[![Build and Publish Docker Image](https://github.com/alackmann/ble-gateway-mqtt-proxy/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/alackmann/ble-gateway-mqtt-proxy/actions/workflows/docker-publish.yml)
[![CI - Test and Build](https://github.com/alackmann/ble-gateway-mqtt-proxy/actions/workflows/ci.yml/badge.svg)](https://github.com/alackmann/ble-gateway-mqtt-proxy/actions/workflows/ci.yml)

A Node.js application that receives MessagePack-encoded data from an April Brother BLE Gateway V4, processes BLE device advertising data, and publishes structured JSON messages to an MQTT broker.

## Features

- ✅ Receives MessagePack data from BLE Gateway (no Content-Type headers required)
- ✅ Processes advertising data from multiple BLE devices
- ✅ Publishes device data to MQTT broker with structured JSON format
- ✅ Home Assistant MQTT Auto Discovery integration
- ✅ Comprehensive logging with configurable levels
- ✅ Environment-based configuration
- ✅ Full test suite with 196 passing tests

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your MQTT broker settings
   ```

3. **Run the Application**
   ```bash
   npm start
   ```

4. **Send test data** (optional)
   ```bash
   npm test
   ```

## Configuration

Key environment variables:

- `MQTT_BROKER_URL`: MQTT broker connection URL
- `MQTT_TOPIC_PREFIX`: Topic prefix for published messages
- `SERVER_PORT`: HTTP server port (default: 8000)
- `SERVER_HOST`: Server bind address (default: 0.0.0.0 - all interfaces)
- `LOG_LEVEL`: Logging level (debug, info, warn, error)

### Home Assistant Integration

Enable Home Assistant MQTT Auto Discovery with these variables:

- `HA_ENABLED`: Set to `true` to enable Home Assistant integration
- `HA_DISCOVERY_TOPIC_PREFIX`: Topic prefix for discovery messages (default: `homeassistant`)
- `HA_GATEWAY_NAME`: Name for the gateway in Home Assistant (default: `April Brother BLE Gateway`)
- `HA_BLE_DEVICE_X`: Define BLE devices for auto-discovery, where X is a sequential number (1, 2, 3...)
  - Format: `<MAC_WITHOUT_COLONS>,<FRIENDLY_NAME>`
  - Example: `HA_BLE_DEVICE_1=123b6a1b85ef,Car Token`

When `HA_ENABLED` is `true`, both BLE devices and the gateway itself will be automatically discovered in Home Assistant.

See `.env.example` for complete configuration options.

## API Endpoints

### POST /tokendata
Accepts MessagePack-encoded BLE device data from the gateway.

**Request:**
- Body: Binary MessagePack data
- Content-Type: Not required (accepts any content type)

**Response:**
- 200: Data processed successfully
- 400: Invalid data format
- 500: Processing error

## MQTT Output

Published messages follow this structure:
```json
{
  "mac": "12:34:56:78:90:AB",
  "rssi": -45,
  "timestamp": "2024-01-15T10:30:00.000Z",
  "data": {
    // Parsed advertising data
  }
}
```

## Documentation

- [`docs/functional.md`](docs/functional.md) - Functional requirements
- [`docs/technical.md`](docs/technical.md) - Technical specifications
- [`docs/homeassistant/home_assistant.md](docs/homeassistant/home_assistant.md) - Home Assistant support spec

## Development

**Run tests:**
```bash
npm test
```

**Development with auto-reload:**
```bash
npm run dev
```

**Create a new release:**
```bash
# Step 1: Prepare release (creates version bump PR)
npm run prepare-release

# Step 2: After merging PR, create release tag
npm run release
```

The release workflow uses a two-step process to eliminate race conditions:
1. `prepare-release` creates a version bump PR for review
2. `release` tags the merged version and triggers automated CI/CD

This ensures clean version management and enables team collaboration on releases. The workflow:
- Validates branch state and runs tests
- Creates semantic versioned tags (patch/minor/major)
- Triggers automated Docker building and publishing
- Creates GitHub releases with proper versioning

See [`docs/RELEASE_WORKFLOW.md`](docs/RELEASE_WORKFLOW.md) for detailed workflow documentation and [`docs/CICD_RELEASE_PROCESS.md`](docs/CICD_RELEASE_PROCESS.md) for CI/CD information.

## Status

✅ **Production Ready** - Successfully processing real hardware data from BLE Gateway V4


## A note from a human

Hey there, I created this project to solve a small problem I had moving BLE device data from the April Brother Gateway to OpenHAB home automation. I could have hacked something up quickly (and have something old that does just that) but it was a good opportunity to get my 'vibe-coding' on.

This whole repo and codebase took 3-4 hours of actual work to complete. All the code and docs are 100% written by AI. The code is a mixture of Claude 3.7 & 4, using Github Copilot Agent. I created the docs content first by dumping some specs and bullet points into Google Gemini. After some small tweaks, in VSCode I stepped through the task list building out the app.

I'm impressed. Yes this is a fairly simply API. It only really has two endpoints and doesn't do any significantly complex work on the incoming data, other than formatting and sending to an MQTT endpoint. Claude is fairly verbose and wrote a LOT of code - certainly much more than I would have done. But it has 100s of unit tests and integration tests, it's neat and clean code and I only had to intervene a handful of times. 

Overall this was an interesting personal glimpse into what's possible with the current AI tools. I'm already thinking more about what else I can build.

-Andre
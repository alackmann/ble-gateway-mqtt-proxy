# BLE Gateway Data Processor

[![Build and Publish Docker Image](https://github.com/alackmann/ble-gateway-mqtt-proxy/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/alackmann/ble-gateway-mqtt-proxy/actions/workflows/docker-publish.yml)
[![CI - Test and Build](https://github.com/alackmann/ble-gateway-mqtt-proxy/actions/workflows/ci.yml/badge.svg)](https://github.com/alackmann/ble-gateway-mqtt-proxy/actions/workflows/ci.yml)

A Node.js application that receives MessagePack-encoded data from an April Brother BLE Gateway V4, processes BLE device advertising data, and publishes structured JSON messages to an MQTT broker.

## Features

- ✅ Receives MessagePack data from BLE Gateway (no Content-Type headers required)
- ✅ Processes advertising data from multiple BLE devices
- ✅ Publishes device data to MQTT broker with structured JSON format
- ✅ Comprehensive logging with configurable levels
- ✅ Environment-based configuration
- ✅ Full test suite with 167 passing tests

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
- `PORT`: HTTP server port (default: 3000)
- `LOG_LEVEL`: Logging level (debug, info, warn, error)

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

## Development

**Run tests:**
```bash
npm test
```

**Development with auto-reload:**
```bash
npm run dev
```

## Status

✅ **Production Ready** - Successfully processing real hardware data from BLE Gateway V4


## A note from a human

Hey there, I created this project to solve a small problem I had moving BLE device data from the April Brother Gateway to OpenHAB home automation. I could have hacked something up quickly (and have something old that does just that) but it was a good opportunity to get my 'vibe-coding' on.

This whole repo and codebase took 3-4 hours of actual work to complete. All the code and docs are 100% written by AI. The code is a mixture of Claude 3.7 & 4, using Github Copilot Agent. I created the docs content first by dumping some specs and bullet points into Google Gemini. After some small tweaks, in VSCode I stepped through the task list building out the app.

I'm impressed. Yes this is a fairly simply API. It only really has two endpoints and doesn't do any significantly complex work on the incoming data, other than formatting and sending to an MQTT endpoint. Claude is fairly verbose and wrote a LOT of code - certainly much more than I would have done. But it has 100s of unit tests and integration tests, it's neat and clean code and I only had to intervene a handful of times. 

Overall this was an interesting personal glimpse into what's possible with the current AI tools. I'm already thinking more about what else I can build.

-Andre
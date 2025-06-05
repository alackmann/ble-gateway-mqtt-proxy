# BLE Gateway Data Processor

[![Build and Publish Docker Image](https://github.com/USER/REPO/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/USER/REPO/actions/workflows/docker-publish.yml)
[![CI - Test and Build](https://github.com/USER/REPO/actions/workflows/ci.yml/badge.svg)](https://github.com/USER/REPO/actions/workflows/ci.yml)

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

# BLE Gateway Data Processor

A Node.js application that receives data from an April Brother BLE Gateway V4, processes BLE device advertising data, and publishes structured JSON messages to an MQTT broker.

## Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment Variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start the Application**
   ```bash
   npm start
   ```

## Project Structure

```
├── docs/                   # Documentation
│   ├── functional.md       # Functional Requirements Document
│   ├── technical.md        # Technical Specification Document
│   └── tasks.md           # Engineering Task List
├── src/                   # Application source code
│   └── index.js          # Main entry point
├── package.json          # Node.js project configuration
├── .env.example         # Example environment configuration
└── README.md           # This file
```

## Dependencies

- **express**: HTTP server framework
- **msgpack5**: MessagePack encoding/decoding library
- **mqtt**: MQTT client library
- **dotenv**: Environment variable management

## Development Status

This project is currently in development. See `docs/tasks.md` for the current task list and progress.

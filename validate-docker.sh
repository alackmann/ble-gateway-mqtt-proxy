#!/bin/bash
# Docker validation script for Task 13
# Tests the Docker setup without requiring Docker to be running

echo "🐳 Docker Configuration Validation for Task 13"
echo "=============================================="

# Check if required files exist
echo "📋 Checking required Docker files..."

if [ -f "Dockerfile" ]; then
    echo "✅ Dockerfile exists"
else
    echo "❌ Dockerfile missing"
    exit 1
fi

if [ -f ".dockerignore" ]; then
    echo "✅ .dockerignore exists"
else
    echo "❌ .dockerignore missing"
    exit 1
fi

if [ -f "docker-compose.yml" ]; then
    echo "✅ docker-compose.yml exists"
else
    echo "❌ docker-compose.yml missing"
    exit 1
fi

# Validate Dockerfile structure
echo ""
echo "🔍 Validating Dockerfile structure..."

if grep -q "FROM node:.*alpine AS builder" Dockerfile; then
    echo "✅ Multi-stage build detected"
else
    echo "❌ Multi-stage build not found"
fi

if grep -q "npm test" Dockerfile; then
    echo "✅ Tests run during build"
else
    echo "❌ Tests not run during build"
fi

if grep -q "USER nodejs" Dockerfile; then
    echo "✅ Non-root user configured"
else
    echo "❌ Non-root user not configured"
fi

if grep -q "HEALTHCHECK" Dockerfile; then
    echo "✅ Health check configured"
else
    echo "❌ Health check not configured"
fi

if grep -q "EXPOSE 8000" Dockerfile; then
    echo "✅ Port 8000 exposed"
else
    echo "❌ Port not properly exposed"
fi

# Validate .dockerignore
echo ""
echo "🔍 Validating .dockerignore..."

if grep -q "node_modules" .dockerignore; then
    echo "✅ node_modules excluded"
else
    echo "❌ node_modules not excluded"
fi

if grep -q "\.git" .dockerignore; then
    echo "✅ Git files excluded"
else
    echo "❌ Git files not excluded"
fi

if grep -q "\.env" .dockerignore; then
    echo "✅ Environment files excluded"
else
    echo "❌ Environment files not excluded"
fi

# Check application structure
echo ""
echo "🔍 Validating application structure..."

if [ -d "src" ]; then
    echo "✅ src directory exists"
else
    echo "❌ src directory missing"
fi

if [ -f "src/index.js" ]; then
    echo "✅ Main entry point exists"
else
    echo "❌ Main entry point missing"
fi

if [ -f "package.json" ]; then
    echo "✅ package.json exists"
else
    echo "❌ package.json missing"
fi

# Check if health endpoint exists
echo ""
echo "🔍 Validating health endpoint..."

if grep -q "/health" src/index.js; then
    echo "✅ Health endpoint implemented"
else
    echo "❌ Health endpoint not found"
fi

# Environment variable configuration
echo ""
echo "🔍 Validating environment configuration..."

if grep -q "process\.env" src/config.js; then
    echo "✅ Environment variable configuration found"
else
    echo "❌ Environment variable configuration not found"
fi

echo ""
echo "🎉 Docker validation complete!"
echo ""
echo "To build and run the container:"
echo "1. docker build -t ble-gateway-processor ."
echo "2. docker run -p 8000:8000 -e MQTT_BROKER_URL=mqtt://broker:1883 ble-gateway-processor"
echo ""
echo "Or use docker-compose:"
echo "docker-compose up -d"

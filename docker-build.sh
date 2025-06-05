#!/bin/bash

# BLE Gateway Data Processor - Docker Build and Deploy Script
# This script builds and optionally deploys the BLE Gateway application

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME="ble-gateway-processor"
IMAGE_TAG="latest"
CONTAINER_NAME="ble-gateway-app"

print_usage() {
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo "  build       Build the Docker image"
    echo "  run         Run the container (standalone)"
    echo "  compose     Start with docker-compose (includes MQTT broker)"
    echo "  test        Run tests in container"
    echo "  clean       Clean up containers and images"
    echo "  logs        Show container logs"
    echo ""
    echo "Options:"
    echo "  --tag TAG   Specify image tag (default: latest)"
    echo "  --port PORT Specify host port (default: 8000)"
    echo "  --help      Show this help message"
}

check_docker() {
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}Error: Docker is not installed or not in PATH${NC}"
        echo "Please install Docker and try again."
        exit 1
    fi
}

build_image() {
    echo -e "${BLUE}Building Docker image: ${IMAGE_NAME}:${IMAGE_TAG}${NC}"
    
    # Build the image
    docker build -t "${IMAGE_NAME}:${IMAGE_TAG}" .
    
    echo -e "${GREEN}✅ Docker image built successfully${NC}"
    
    # Show image info
    echo -e "${BLUE}Image information:${NC}"
    docker images "${IMAGE_NAME}:${IMAGE_TAG}"
}

run_container() {
    local port=${1:-8000}
    
    echo -e "${BLUE}Running container: ${CONTAINER_NAME}${NC}"
    
    # Stop existing container if running
    if docker ps -q -f name="${CONTAINER_NAME}" | grep -q .; then
        echo -e "${YELLOW}Stopping existing container...${NC}"
        docker stop "${CONTAINER_NAME}"
        docker rm "${CONTAINER_NAME}"
    fi
    
    # Run new container
    docker run -d \
        --name "${CONTAINER_NAME}" \
        -p "${port}:8000" \
        -e MQTT_BROKER_URL="mqtt://host.docker.internal:1883" \
        -e LOG_LEVEL="info" \
        "${IMAGE_NAME}:${IMAGE_TAG}"
    
    echo -e "${GREEN}✅ Container started successfully${NC}"
    echo -e "${BLUE}Application available at: http://localhost:${port}${NC}"
    echo -e "${BLUE}Health check: http://localhost:${port}/health${NC}"
}

start_compose() {
    echo -e "${BLUE}Starting services with docker-compose...${NC}"
    
    if [ ! -f "docker-compose.yml" ]; then
        echo -e "${RED}Error: docker-compose.yml not found${NC}"
        exit 1
    fi
    
    # Build and start services
    docker-compose up -d --build
    
    echo -e "${GREEN}✅ Services started successfully${NC}"
    echo -e "${BLUE}Application: http://localhost:8000${NC}"
    echo -e "${BLUE}MQTT Broker: localhost:1883${NC}"
    echo -e "${BLUE}MQTT WebSocket: localhost:9001${NC}"
    
    echo -e "${YELLOW}To monitor MQTT messages, run:${NC}"
    echo "docker-compose --profile testing up mqtt-client"
}

run_tests() {
    echo -e "${BLUE}Running tests in container...${NC}"
    
    # Build test image
    docker build --target builder -t "${IMAGE_NAME}:test" .
    
    # Run tests
    docker run --rm "${IMAGE_NAME}:test" npm test
    
    echo -e "${GREEN}✅ Tests completed${NC}"
}

show_logs() {
    if docker ps -q -f name="${CONTAINER_NAME}" | grep -q .; then
        echo -e "${BLUE}Showing logs for ${CONTAINER_NAME}:${NC}"
        docker logs -f "${CONTAINER_NAME}"
    elif docker-compose ps | grep -q "ble-gateway"; then
        echo -e "${BLUE}Showing docker-compose logs:${NC}"
        docker-compose logs -f ble-gateway
    else
        echo -e "${YELLOW}No running containers found${NC}"
    fi
}

clean_up() {
    echo -e "${BLUE}Cleaning up containers and images...${NC}"
    
    # Stop and remove containers
    if docker ps -aq -f name="${CONTAINER_NAME}" | grep -q .; then
        docker stop "${CONTAINER_NAME}" 2>/dev/null || true
        docker rm "${CONTAINER_NAME}" 2>/dev/null || true
    fi
    
    # Stop docker-compose services
    if [ -f "docker-compose.yml" ]; then
        docker-compose down 2>/dev/null || true
    fi
    
    # Remove images
    docker rmi "${IMAGE_NAME}:${IMAGE_TAG}" 2>/dev/null || true
    docker rmi "${IMAGE_NAME}:test" 2>/dev/null || true
    
    # Clean up dangling images
    docker image prune -f
    
    echo -e "${GREEN}✅ Cleanup completed${NC}"
}

# Parse arguments
COMMAND=""
PORT="8000"
TAG="latest"

while [[ $# -gt 0 ]]; do
    case $1 in
        build|run|compose|test|clean|logs)
            COMMAND="$1"
            shift
            ;;
        --tag)
            TAG="$2"
            IMAGE_TAG="$TAG"
            shift 2
            ;;
        --port)
            PORT="$2"
            shift 2
            ;;
        --help)
            print_usage
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            print_usage
            exit 1
            ;;
    esac
done

# Check if Docker is available
check_docker

# Execute command
case $COMMAND in
    build)
        build_image
        ;;
    run)
        build_image
        run_container "$PORT"
        ;;
    compose)
        start_compose
        ;;
    test)
        run_tests
        ;;
    logs)
        show_logs
        ;;
    clean)
        clean_up
        ;;
    "")
        echo -e "${RED}No command specified${NC}"
        print_usage
        exit 1
        ;;
    *)
        echo -e "${RED}Unknown command: $COMMAND${NC}"
        print_usage
        exit 1
        ;;
esac

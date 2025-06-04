# BLE Gateway Data Processor - Dockerfile
# Multi-stage build for production optimization

# Stage 1: Build and test stage
FROM node:22-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files first for better Docker layer caching
COPY package*.json ./

# Install all dependencies (including devDependencies for testing)
RUN npm ci --include=dev

# Copy source code and configuration
COPY src/ ./src/
COPY test/ ./test/
COPY docs/ ./docs/

# Run tests to ensure code quality
RUN npm test

# Stage 2: Production stage
FROM node:22-alpine AS production

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy source code from builder stage
COPY --from=builder /app/src ./src

# Create directory for logs (if needed)
RUN mkdir -p /app/logs && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose the application port
EXPOSE 8000

# Add health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:8000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })" || exit 1

# Set the entry point
CMD ["node", "src/index.js"]

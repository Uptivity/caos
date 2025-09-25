# CAOS CRM - Production Dockerfile
# Multi-stage build for optimized production deployment

# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY backend/package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Production stage
FROM node:18-alpine AS production

# Create app directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S caos-crm -u 1001

# Copy node_modules from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy application files
COPY backend/ ./backend/
COPY components/ ./components/
COPY styles/ ./styles/

# Create logs directory
RUN mkdir -p /app/logs && chown -R caos-crm:nodejs /app/logs

# Set proper permissions
RUN chown -R caos-crm:nodejs /app

# Switch to non-root user
USER caos-crm

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node backend/health-check.js || exit 1

# Start command
CMD ["node", "backend/server.js"]
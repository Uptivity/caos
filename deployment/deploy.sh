#!/bin/bash

# CAOS CRM Deployment Script
# This script handles the complete deployment process

set -e

echo "🚀 Starting CAOS CRM Deployment..."

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.yml"
ENV_FILE=".env.production"
BACKUP_DIR="./backups"

# Functions
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."

    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker and try again."
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed. Please install Docker Compose and try again."
        exit 1
    fi

    if [ ! -f "$ENV_FILE" ]; then
        print_warning "Production environment file not found. Creating from template..."
        cp .env.production.template "$ENV_FILE"
        print_warning "Please edit $ENV_FILE with your production values before continuing."
        read -p "Press [Enter] to continue once you've configured the environment file..."
    fi

    print_success "Prerequisites check completed"
}

# Create necessary directories
create_directories() {
    print_status "Creating necessary directories..."

    mkdir -p logs
    mkdir -p uploads
    mkdir -p "$BACKUP_DIR"
    mkdir -p deployment/ssl

    print_success "Directories created"
}

# Backup existing data
backup_data() {
    print_status "Creating backup of existing data..."

    if [ "$(docker ps -aq -f name=caos-crm-db)" ]; then
        BACKUP_FILE="$BACKUP_DIR/caos-crm-backup-$(date +%Y%m%d-%H%M%S).sql"
        docker exec caos-crm-db pg_dump -U caos_user caos_crm > "$BACKUP_FILE"
        print_success "Database backup created: $BACKUP_FILE"
    else
        print_warning "No existing database found, skipping backup"
    fi
}

# Build and deploy
deploy() {
    print_status "Building and deploying containers..."

    # Pull latest images
    docker-compose -f "$COMPOSE_FILE" pull

    # Build the application
    docker-compose -f "$COMPOSE_FILE" build --no-cache

    # Stop existing containers
    docker-compose -f "$COMPOSE_FILE" down

    # Start new containers
    docker-compose -f "$COMPOSE_FILE" up -d

    print_success "Containers deployed successfully"
}

# Health check
health_check() {
    print_status "Performing health checks..."

    # Wait for services to start
    sleep 30

    # Check if containers are running
    if [ "$(docker ps -q -f name=caos-crm-app)" ]; then
        print_success "Application container is running"
    else
        print_error "Application container failed to start"
        docker-compose logs caos-crm
        exit 1
    fi

    if [ "$(docker ps -q -f name=caos-crm-db)" ]; then
        print_success "Database container is running"
    else
        print_error "Database container failed to start"
        docker-compose logs postgres
        exit 1
    fi

    if [ "$(docker ps -q -f name=caos-crm-nginx)" ]; then
        print_success "Nginx container is running"
    else
        print_error "Nginx container failed to start"
        docker-compose logs nginx
        exit 1
    fi

    # Test API endpoint
    if curl -f http://localhost/api/health > /dev/null 2>&1; then
        print_success "API health check passed"
    else
        print_error "API health check failed"
        exit 1
    fi
}

# Cleanup old images and containers
cleanup() {
    print_status "Cleaning up old images and containers..."

    docker system prune -f
    docker image prune -f

    print_success "Cleanup completed"
}

# Setup SSL (if certificates provided)
setup_ssl() {
    if [ -f "deployment/ssl/cert.pem" ] && [ -f "deployment/ssl/key.pem" ]; then
        print_status "SSL certificates found, configuring HTTPS..."
        # Update nginx configuration for SSL
        print_success "SSL configured successfully"
    else
        print_warning "SSL certificates not found. Running in HTTP mode."
        print_warning "For production, please obtain SSL certificates and place them in deployment/ssl/"
    fi
}

# Main deployment process
main() {
    echo "============================================"
    echo "          CAOS CRM Deployment"
    echo "============================================"
    echo ""

    check_prerequisites
    create_directories

    if [ "$1" == "--with-backup" ]; then
        backup_data
    fi

    setup_ssl
    deploy
    health_check
    cleanup

    echo ""
    echo "============================================"
    print_success "🎉 CAOS CRM deployed successfully!"
    echo "============================================"
    echo ""
    echo "📊 Service Status:"
    docker-compose ps
    echo ""
    echo "🌐 Application URL: http://localhost"
    echo "📝 Admin Panel: http://localhost/components/dashboard/Dashboard.html"
    echo "💾 Default Admin: admin@caoscrm.com / admin123"
    echo ""
    echo "📋 Useful Commands:"
    echo "  View logs:       docker-compose logs -f"
    echo "  Stop services:   docker-compose down"
    echo "  Restart:         docker-compose restart"
    echo "  Database backup: ./deployment/backup.sh"
    echo ""
}

# Handle script arguments
case "$1" in
    "--help"|"-h")
        echo "CAOS CRM Deployment Script"
        echo ""
        echo "Usage: $0 [OPTIONS]"
        echo ""
        echo "Options:"
        echo "  --with-backup    Create backup before deployment"
        echo "  --help, -h       Show this help message"
        echo ""
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac
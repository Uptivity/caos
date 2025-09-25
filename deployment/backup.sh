#!/bin/bash

# CAOS CRM Backup Script
# Creates backups of database and uploaded files

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
DB_CONTAINER="caos-crm-db"
APP_CONTAINER="caos-crm-app"
RETENTION_DAYS=30

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

# Create backup directory
create_backup_dir() {
    mkdir -p "$BACKUP_DIR"
    print_status "Backup directory: $BACKUP_DIR"
}

# Backup database
backup_database() {
    print_status "Creating database backup..."

    if [ "$(docker ps -aq -f name=$DB_CONTAINER)" ]; then
        DB_BACKUP_FILE="$BACKUP_DIR/database-backup-$TIMESTAMP.sql"
        docker exec $DB_CONTAINER mysqldump -u caos_user -p${DB_PASSWORD:-changeme123} caos_crm > "$DB_BACKUP_FILE"

        if [ -f "$DB_BACKUP_FILE" ]; then
            # Compress the backup
            gzip "$DB_BACKUP_FILE"
            print_success "Database backup created: ${DB_BACKUP_FILE}.gz"
        else
            print_error "Failed to create database backup"
            return 1
        fi
    else
        print_warning "Database container not found or not running"
        return 1
    fi
}

# Backup uploaded files
backup_files() {
    print_status "Creating files backup..."

    if [ -d "./uploads" ]; then
        FILES_BACKUP_FILE="$BACKUP_DIR/files-backup-$TIMESTAMP.tar.gz"
        tar -czf "$FILES_BACKUP_FILE" -C . uploads

        if [ -f "$FILES_BACKUP_FILE" ]; then
            print_success "Files backup created: $FILES_BACKUP_FILE"
        else
            print_error "Failed to create files backup"
            return 1
        fi
    else
        print_warning "Uploads directory not found"
        return 1
    fi
}

# Backup configuration
backup_config() {
    print_status "Creating configuration backup..."

    CONFIG_BACKUP_FILE="$BACKUP_DIR/config-backup-$TIMESTAMP.tar.gz"

    # Backup configuration files (excluding sensitive env files)
    tar -czf "$CONFIG_BACKUP_FILE" \
        --exclude='.env.production' \
        --exclude='*.log' \
        --exclude='node_modules' \
        --exclude='backups' \
        docker-compose.yml \
        Dockerfile \
        deployment/ \
        .env.production.template 2>/dev/null || true

    if [ -f "$CONFIG_BACKUP_FILE" ]; then
        print_success "Configuration backup created: $CONFIG_BACKUP_FILE"
    else
        print_warning "Configuration backup may be incomplete"
    fi
}

# Create complete backup manifest
create_manifest() {
    print_status "Creating backup manifest..."

    MANIFEST_FILE="$BACKUP_DIR/backup-manifest-$TIMESTAMP.txt"

    cat > "$MANIFEST_FILE" << EOF
CAOS CRM Backup Manifest
========================
Backup Date: $(date)
Backup ID: $TIMESTAMP

Files Included:
EOF

    # List all backup files for this timestamp
    ls -la "$BACKUP_DIR"/*-$TIMESTAMP.* >> "$MANIFEST_FILE" 2>/dev/null || true

    # Add system information
    cat >> "$MANIFEST_FILE" << EOF

System Information:
==================
Docker Version: $(docker --version)
Docker Compose Version: $(docker-compose --version)
Host OS: $(uname -a)

Database Container Status:
$(docker ps -f name=$DB_CONTAINER --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}")

Application Container Status:
$(docker ps -f name=$APP_CONTAINER --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}")

EOF

    print_success "Backup manifest created: $MANIFEST_FILE"
}

# Cleanup old backups
cleanup_old_backups() {
    print_status "Cleaning up backups older than $RETENTION_DAYS days..."

    if [ -d "$BACKUP_DIR" ]; then
        find "$BACKUP_DIR" -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
        find "$BACKUP_DIR" -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
        find "$BACKUP_DIR" -name "*.txt" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true

        print_success "Old backups cleaned up"
    fi
}

# Verify backup integrity
verify_backup() {
    print_status "Verifying backup integrity..."

    local db_backup="$BACKUP_DIR/database-backup-$TIMESTAMP.sql.gz"
    local files_backup="$BACKUP_DIR/files-backup-$TIMESTAMP.tar.gz"

    # Test database backup
    if [ -f "$db_backup" ]; then
        if gzip -t "$db_backup"; then
            print_success "Database backup integrity verified"
        else
            print_error "Database backup is corrupted"
            return 1
        fi
    fi

    # Test files backup
    if [ -f "$files_backup" ]; then
        if tar -tzf "$files_backup" > /dev/null; then
            print_success "Files backup integrity verified"
        else
            print_error "Files backup is corrupted"
            return 1
        fi
    fi
}

# Main backup process
main() {
    echo "============================================"
    echo "          CAOS CRM Backup"
    echo "============================================"
    echo ""

    create_backup_dir

    local success_count=0
    local total_count=3

    # Perform backups
    if backup_database; then
        ((success_count++))
    fi

    if backup_files; then
        ((success_count++))
    fi

    if backup_config; then
        ((success_count++))
    fi

    # Create manifest regardless
    create_manifest

    # Verify backups
    verify_backup

    # Cleanup old backups
    cleanup_old_backups

    echo ""
    echo "============================================"

    if [ $success_count -eq $total_count ]; then
        print_success "🎉 Backup completed successfully!"
        echo "✅ All components backed up: $success_count/$total_count"
    else
        print_warning "⚠️  Backup completed with warnings!"
        echo "⚠️  Components backed up: $success_count/$total_count"
    fi

    echo "============================================"
    echo ""
    echo "📁 Backup Location: $BACKUP_DIR"
    echo "🆔 Backup ID: $TIMESTAMP"
    echo "📋 Files created:"
    ls -la "$BACKUP_DIR"/*-$TIMESTAMP.* 2>/dev/null || echo "  No backup files found"
    echo ""
}

# Handle script arguments
case "$1" in
    "--help"|"-h")
        echo "CAOS CRM Backup Script"
        echo ""
        echo "Usage: $0 [OPTIONS]"
        echo ""
        echo "This script creates backups of:"
        echo "  - PostgreSQL database"
        echo "  - Uploaded files"
        echo "  - Configuration files"
        echo ""
        echo "Options:"
        echo "  --help, -h       Show this help message"
        echo ""
        echo "Backup retention: $RETENTION_DAYS days"
        echo ""
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac
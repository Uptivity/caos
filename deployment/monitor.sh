#!/bin/bash

# CAOS CRM Monitoring and Health Check Script
# Monitors all system components and generates reports

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

# Configuration
COMPOSE_FILE="docker-compose.yml"
HEALTH_CHECK_URL="http://localhost"
API_HEALTH_URL="http://localhost/api/health"
LOG_FILE="logs/monitoring.log"

# Functions
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
    echo "$(date): [INFO] $1" >> "$LOG_FILE"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
    echo "$(date): [SUCCESS] $1" >> "$LOG_FILE"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
    echo "$(date): [WARNING] $1" >> "$LOG_FILE"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    echo "$(date): [ERROR] $1" >> "$LOG_FILE"
}

print_header() {
    echo -e "${PURPLE}$1${NC}"
}

# Initialize monitoring
init_monitoring() {
    mkdir -p logs
    touch "$LOG_FILE"
    print_status "Monitoring initialized"
}

# Check Docker containers
check_containers() {
    print_header "=== Container Health Check ==="

    local containers=("caos-crm-app" "caos-crm-db" "caos-crm-redis" "caos-crm-nginx")
    local healthy_count=0
    local total_count=${#containers[@]}

    for container in "${containers[@]}"; do
        if docker ps -f name="$container" --format "table {{.Names}}\t{{.Status}}" | grep -q "Up"; then
            local status=$(docker ps -f name="$container" --format "{{.Status}}")
            print_success "$container: $status"
            ((healthy_count++))
        else
            print_error "$container: Not running or unhealthy"
        fi
    done

    echo ""
    echo "Container Summary: $healthy_count/$total_count containers healthy"

    if [ $healthy_count -eq $total_count ]; then
        return 0
    else
        return 1
    fi
}

# Check API endpoints
check_api_health() {
    print_header "=== API Health Check ==="

    # Test main health endpoint
    if curl -sf "$API_HEALTH_URL" > /dev/null 2>&1; then
        local response=$(curl -s "$API_HEALTH_URL")
        print_success "API Health endpoint: OK"
        echo "  Response: $response"
    else
        print_error "API Health endpoint: FAILED"
        return 1
    fi

    # Test key API endpoints
    local endpoints=(
        "/api/auth/health"
        "/api/leads/health"
        "/api/mobile/health"
    )

    local healthy_endpoints=0
    local total_endpoints=${#endpoints[@]}

    for endpoint in "${endpoints[@]}"; do
        if curl -sf "http://localhost$endpoint" > /dev/null 2>&1; then
            print_success "Endpoint $endpoint: OK"
            ((healthy_endpoints++))
        else
            print_warning "Endpoint $endpoint: Not responding"
        fi
    done

    echo ""
    echo "API Summary: $healthy_endpoints/$total_endpoints endpoints responding"

    if [ $healthy_endpoints -gt 0 ]; then
        return 0
    else
        return 1
    fi
}

# Check database connectivity
check_database() {
    print_header "=== Database Health Check ==="

    if docker exec caos-crm-db mysqladmin ping -h localhost -u caos_user -p${DB_PASSWORD:-changeme123} > /dev/null 2>&1; then
        print_success "Database: Connection OK"

        # Check database size and stats
        local db_stats=$(docker exec caos-crm-db mysql -u caos_user -p${DB_PASSWORD:-changeme123} caos_crm -e "
            SELECT
                ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) as db_size_mb,
                (SELECT count(*) FROM users) as user_count,
                (SELECT count(*) FROM leads) as lead_count,
                (SELECT count(*) FROM tasks) as task_count
            FROM information_schema.tables
            WHERE table_schema = 'caos_crm';
        " 2>/dev/null | tail -n +2)

        if [ ! -z "$db_stats" ]; then
            echo "  Database statistics available"
            print_success "Database: Statistics collected"
        else
            print_warning "Database: Could not collect statistics"
        fi
    else
        print_error "Database: Connection FAILED"
        return 1
    fi
}

# Check Redis connectivity
check_redis() {
    print_header "=== Redis Health Check ==="

    if docker exec caos-crm-redis redis-cli ping > /dev/null 2>&1; then
        print_success "Redis: Connection OK"

        # Get Redis info
        local redis_info=$(docker exec caos-crm-redis redis-cli info memory | grep used_memory_human | cut -d: -f2 | tr -d '\r')
        if [ ! -z "$redis_info" ]; then
            echo "  Memory usage: $redis_info"
            print_success "Redis: Memory info collected"
        fi
    else
        print_error "Redis: Connection FAILED"
        return 1
    fi
}

# Check system resources
check_system_resources() {
    print_header "=== System Resources ==="

    # Check disk space
    local disk_usage=$(df -h . | awk 'NR==2 {print $5}' | sed 's/%//')
    echo "Disk Usage: ${disk_usage}%"
    if [ "$disk_usage" -gt 80 ]; then
        print_warning "Disk usage is high: ${disk_usage}%"
    else
        print_success "Disk usage is acceptable: ${disk_usage}%"
    fi

    # Check Docker system info
    echo ""
    echo "Docker System Info:"
    docker system df --format "table {{.Type}}\t{{.Total}}\t{{.Active}}\t{{.Size}}\t{{.Reclaimable}}"

    # Check container resource usage
    echo ""
    echo "Container Resource Usage:"
    docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}"
}

# Check logs for errors
check_logs() {
    print_header "=== Log Analysis ==="

    local containers=("caos-crm-app" "caos-crm-nginx")
    local error_found=false

    for container in "${containers[@]}"; do
        echo "Checking $container logs for recent errors..."

        local errors=$(docker logs "$container" --since="1h" 2>&1 | grep -i "error\|exception\|failed" | wc -l)

        if [ "$errors" -gt 0 ]; then
            print_warning "$container: $errors errors found in last hour"
            error_found=true
        else
            print_success "$container: No errors in last hour"
        fi
    done

    if [ "$error_found" = true ]; then
        return 1
    else
        return 0
    fi
}

# Check SSL certificate (if applicable)
check_ssl() {
    if [ -f "deployment/ssl/cert.pem" ]; then
        print_header "=== SSL Certificate Check ==="

        local expiry=$(openssl x509 -enddate -noout -in deployment/ssl/cert.pem | cut -d= -f2)
        local expiry_date=$(date -d "$expiry" +%s)
        local current_date=$(date +%s)
        local days_until_expiry=$(( (expiry_date - current_date) / 86400 ))

        if [ $days_until_expiry -lt 30 ]; then
            print_warning "SSL certificate expires in $days_until_expiry days"
        else
            print_success "SSL certificate valid for $days_until_expiry days"
        fi
    fi
}

# Check backup status
check_backup() {
    print_header "=== Backup Status ==="

    if [ -d "./backups" ]; then
        local latest_backup=$(ls -t ./backups/ | head -1)
        if [ ! -z "$latest_backup" ]; then
            local backup_age=$(find ./backups/"$latest_backup" -mtime +1 | wc -l)

            if [ "$backup_age" -eq 0 ]; then
                print_success "Recent backup found: $latest_backup"
            else
                print_warning "Latest backup is older than 24 hours: $latest_backup"
            fi
        else
            print_warning "No backups found"
        fi
    else
        print_warning "Backup directory not found"
    fi
}

# Generate monitoring report
generate_report() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local report_file="logs/health-report-$(date +%Y%m%d-%H%M%S).json"

    cat > "$report_file" << EOF
{
  "timestamp": "$timestamp",
  "system_status": "$([ $overall_health -eq 0 ] && echo "healthy" || echo "unhealthy")",
  "checks_performed": {
    "containers": $([ $container_health -eq 0 ] && echo "true" || echo "false"),
    "api": $([ $api_health -eq 0 ] && echo "true" || echo "false"),
    "database": $([ $db_health -eq 0 ] && echo "true" || echo "false"),
    "redis": $([ $redis_health -eq 0 ] && echo "true" || echo "false"),
    "logs": $([ $log_health -eq 0 ] && echo "true" || echo "false")
  },
  "next_check": "$(date -d '+1 hour' '+%Y-%m-%d %H:%M:%S')"
}
EOF

    print_status "Health report generated: $report_file"
}

# Send alerts (if configured)
send_alerts() {
    if [ $overall_health -ne 0 ]; then
        print_warning "System health issues detected - alerts would be sent here"
        # Add webhook or email notification logic here
    fi
}

# Main monitoring function
main() {
    init_monitoring

    echo "============================================"
    echo "       CAOS CRM Health Monitor"
    echo "       $(date)"
    echo "============================================"
    echo ""

    # Initialize health status variables
    container_health=1
    api_health=1
    db_health=1
    redis_health=1
    log_health=1

    # Perform health checks
    check_containers && container_health=0
    echo ""

    check_api_health && api_health=0
    echo ""

    check_database && db_health=0
    echo ""

    check_redis && redis_health=0
    echo ""

    check_system_resources
    echo ""

    check_logs && log_health=0
    echo ""

    check_ssl
    echo ""

    check_backup
    echo ""

    # Calculate overall health
    overall_health=$((container_health + api_health + db_health + redis_health + log_health))

    # Summary
    echo "============================================"
    print_header "             HEALTH SUMMARY"
    echo "============================================"

    if [ $overall_health -eq 0 ]; then
        print_success "🎉 All systems are healthy!"
        echo "✅ Containers: Healthy"
        echo "✅ API: Healthy"
        echo "✅ Database: Healthy"
        echo "✅ Redis: Healthy"
        echo "✅ Logs: Clean"
    else
        print_warning "⚠️  Some issues detected:"
        [ $container_health -ne 0 ] && echo "❌ Containers: Issues detected"
        [ $api_health -ne 0 ] && echo "❌ API: Issues detected"
        [ $db_health -ne 0 ] && echo "❌ Database: Issues detected"
        [ $redis_health -ne 0 ] && echo "❌ Redis: Issues detected"
        [ $log_health -ne 0 ] && echo "❌ Logs: Errors found"

        echo ""
        print_status "Check individual sections above for details"
    fi

    echo ""
    echo "📊 Monitoring log: $LOG_FILE"
    echo "🔄 Run './deployment/monitor.sh' to check again"

    generate_report
    send_alerts

    exit $overall_health
}

# Handle script arguments
case "$1" in
    "--help"|"-h")
        echo "CAOS CRM Monitoring Script"
        echo ""
        echo "Usage: $0 [OPTIONS]"
        echo ""
        echo "This script performs comprehensive health checks on:"
        echo "  - Docker containers"
        echo "  - API endpoints"
        echo "  - Database connectivity"
        echo "  - Redis cache"
        echo "  - System resources"
        echo "  - Application logs"
        echo "  - SSL certificates (if present)"
        echo "  - Backup status"
        echo ""
        echo "Options:"
        echo "  --help, -h       Show this help message"
        echo ""
        echo "Exit codes:"
        echo "  0    All checks passed"
        echo "  >0   Number of failed checks"
        echo ""
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac
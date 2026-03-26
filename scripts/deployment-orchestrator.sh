#!/bin/bash
# scripts/deployment-orchestrator.sh

set -e

echo "🚀 Pro5 Chrome Manager Deployment Orchestrator"
echo "================================================"
echo "Starting deployment process: $(date)"
echo

# Configuration
DEPLOYMENT_MODE=${1:-"staging"}  # staging or production
FAIL_FAST=${FAIL_FAST:-true}
NOTIFY_ON_COMPLETION=${NOTIFY_ON_COMPLETION:-true}

# Environment-specific configuration
case $DEPLOYMENT_MODE in
    "staging")
        ENV_FILE=".env.staging"
        DEPLOY_SCRIPT="scripts/deploy-staging.sh"
        HEALTH_CHECK_SCRIPT="scripts/staging-health-check.js"
        ;;
    "production")
        ENV_FILE=".env.production"
        DEPLOY_SCRIPT="scripts/deploy-production.sh"
        HEALTH_CHECK_SCRIPT="scripts/production-health-check.js"
        ;;
    *)
        echo "❌ Invalid deployment mode. Use 'staging' or 'production'"
        exit 1
        ;;
esac

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging function
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Error handling
handle_error() {
    local exit_code=$?
    log_error "Deployment failed at step: ${BASH_LINENO[0]}"
    log_error "Error code: $exit_code"
    
    # Send notification
    if [ "$NOTIFY_ON_COMPLETION" = true ]; then
        notify_deployment "FAILED" "Deployment failed at step ${BASH_LINENO[0]} with code $exit_code"
    fi
    
    exit $exit_code
}

trap handle_error ERR

# Notification function
notify_deployment() {
    local status=$1
    local message=$2
    
    case $DEPLOYMENT_MODE in
        "staging")
            CHANNEL="#staging-deployments"
            ;;
        "production")
            CHANNEL="#production-deployments"
            ;;
    esac
    
    # Send Slack notification
    if command -v curl &> /dev/null && [ -n "$SLACK_WEBHOOK_URL" ]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"[$status] Pro5 Chrome Manager $DEPLOYMENT_MODE deployment: $message\",\"channel\":\"$CHANNEL\"}" \
            $SLACK_WEBHOOK_URL > /dev/null 2>&1 || true
    fi
    
    # Send email notification
    if command -v mail &> /dev/null && [ -n "$NOTIFICATION_EMAIL" ]; then
        echo "$message" | mail -s "[$status] Pro5 Deployment - $DEPLOYMENT_MODE" $NOTIFICATION_EMAIL
    fi
}

# Pre-flight checks
perform_preflight_checks() {
    log "📋 Performing pre-flight checks..."
    
    # Check required tools
    for tool in node npm git docker; do
        if ! command -v $tool &> /dev/null; then
            log_error "$tool is required but not installed"
            exit 1
        fi
    done
    
    # Check environment file
    if [ ! -f "$ENV_FILE" ]; then
        log_error "Environment file $ENV_FILE not found"
        exit 1
    fi
    
    # Check disk space
    AVAILABLE_SPACE=$(df . | awk 'NR==2 {print $4}')
    if [ $AVAILABLE_SPACE -lt 1048576 ]; then  # 1GB in KB
        log_error "Insufficient disk space. Need at least 1GB free space"
        exit 1
    fi
    
    # Check memory
    AVAILABLE_MEMORY=$(free -m | awk 'NR==2{printf "%.0f", $7}')
    if [ $AVAILABLE_MEMORY -lt 2048 ]; then
        log_warning "Low available memory: ${AVAILABLE_MEMORY}MB"
    fi
    
    log_success "Pre-flight checks passed"
}

# Build and test phase
build_and_test() {
    log "🏭 Executing build and test pipeline..."
    
    if ! ./scripts/build-and-test-pipeline.sh; then
        log_error "Build and test pipeline failed"
        if [ "$FAIL_FAST" = true ]; then
            exit 1
        fi
    fi
    
    log_success "Build and test completed"
}

# Security validation
security_validation() {
    log "🛡️  Performing security validation..."
    
    # Run security scans
    if command -v npm &> /dev/null; then
        npm audit --audit-level=high > security-audit.log 2>&1
        if [ $? -ne 0 ]; then
            log_warning "Security vulnerabilities found - review security-audit.log"
        fi
    fi
    
    # Check for secrets in code
    if git grep -i "password\|secret\|key" -- ".env*" "*.json" "*.yml" "*.yaml" > /dev/null 2>&1; then
        log_warning "Potential secrets found in code - please review"
    fi
    
    log_success "Security validation completed"
}

# Performance testing
performance_testing() {
    log "⚡ Running performance tests..."
    
    # Start application for testing
    npm run dev:server > /tmp/app-perf-test.log 2>&1 &
    APP_PID=$!
    sleep 15
    
    # Run performance tests
    if node scripts/performance/api-response-time.js; then
        log_success "Performance tests passed"
    else
        log_warning "Performance tests failed - review results"
        if [ "$FAIL_FAST" = true ]; then
            kill $APP_PID 2>/dev/null || true
            exit 1
        fi
    fi
    
    # Cleanup
    kill $APP_PID 2>/dev/null || true
}

# Main deployment
deploy_application() {
    log "🚀 Deploying to $DEPLOYMENT_MODE environment..."
    
    if [ -f "$DEPLOY_SCRIPT" ]; then
        if ! ./$DEPLOY_SCRIPT; then
            log_error "Deployment script failed"
            exit 1
        fi
    else
        log_error "Deployment script $DEPLOY_SCRIPT not found"
        exit 1
    fi
    
    log_success "Application deployed successfully"
}

# Health validation
validate_health() {
    log "🩺 Validating deployment health..."
    
    # Wait for service to stabilize
    sleep 30
    
    # Run health checks
    if [ -f "$HEALTH_CHECK_SCRIPT" ]; then
        if node "$HEALTH_CHECK_SCRIPT"; then
            log_success "Health validation passed"
        else
            log_error "Health validation failed"
            exit 1
        fi
    else
        log_warning "Health check script not found, skipping validation"
    fi
}

# Post-deployment tasks
post_deployment() {
    log "📝 Performing post-deployment tasks..."
    
    # Update documentation
    if [ -f "docs/DEPLOYMENT_LOG.md" ]; then
        echo "Deployment: $(date) - $DEPLOYMENT_MODE" >> docs/DEPLOYMENT_LOG.md
    fi
    
    # Cleanup old builds
    find . -name "build-*" -type d -mtime +7 -exec rm -rf {} \; 2>/dev/null || true
    
    # Rotate logs
    if command -v logrotate &> /dev/null; then
        logrotate /etc/logrotate.d/pro5-chrome-manager 2>/dev/null || true
    fi
    
    log_success "Post-deployment tasks completed"
}

# Main execution
main() {
    log "Starting $DEPLOYMENT_MODE deployment process..."
    
    # Notify start
    if [ "$NOTIFY_ON_COMPLETION" = true ]; then
        notify_deployment "STARTED" "Deployment process initiated for $DEPLOYMENT_MODE environment"
    fi
    
    # Execute phases
    perform_preflight_checks
    build_and_test
    security_validation
    performance_testing
    deploy_application
    validate_health
    post_deployment
    
    # Success notification
    log_success "🎉 $DEPLOYMENT_MODE deployment completed successfully!"
    
    if [ "$NOTIFY_ON_COMPLETION" = true ]; then
        notify_deployment "SUCCESS" "Deployment to $DEPLOYMENT_MODE completed successfully at $(date)"
    fi
    
    echo
    echo "📊 Deployment Summary:"
    echo "   Environment: $DEPLOYMENT_MODE"
    echo "   Timestamp: $(date)"
    echo "   Status: SUCCESS"
    echo "   Next Steps: Monitor application health and performance"
}

# Execute main function
main "$@"
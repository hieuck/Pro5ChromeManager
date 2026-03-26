#!/bin/bash
# scripts/deploy-production.sh

set -e

echo "🚀 Deploying to Production Environment..."
echo "=========================================="

# Production configuration
PROD_DIR="/opt/pro5-chrome-manager"
BACKUP_DIR="/opt/backups/pro5-$(date +%Y%m%d_%H%M%S)"
BUILD_DIR="./dist"

# Pre-deployment validation
echo "📋 Running pre-deployment validation..."
./scripts/pre-deploy-validation.sh

# System health check
echo "🩺 Checking system health..."
if ! systemctl is-active --quiet pro5-chrome-manager; then
    echo "⚠️  Service not currently running - this is expected for first deployment"
fi

# Create backup of current deployment
echo "📦 Creating backup..."
mkdir -p "$BACKUP_DIR"
if [ -d "$PROD_DIR" ]; then
    cp -r "$PROD_DIR"/* "$BACKUP_DIR/" 2>/dev/null || true
    echo "✅ Backup created at $BACKUP_DIR"
else
    echo "ℹ️  No existing deployment found"
fi

# Stop current service
echo "⏹️  Stopping current service..."
systemctl stop pro5-chrome-manager || true

# Deploy new version
echo "📦 Deploying new version..."
rm -rf "$PROD_DIR"
mkdir -p "$PROD_DIR"/{logs,data,backups,config,ssl}

# Copy application files
cp -r "$BUILD_DIR"/* "$PROD_DIR"/
cp package.json "$PROD_DIR"/
cp .env.production "$PROD_DIR"/.env

# Set permissions
chown -R pro5:pro5 "$PROD_DIR"
chmod 755 "$PROD_DIR"
chmod 600 "$PROD_DIR/.env"

# Install production dependencies
cd "$PROD_DIR"
sudo -u pro5 npm ci --only=production

# Start service
echo "▶️  Starting production service..."
systemctl start pro5-chrome-manager

# Health check with exponential backoff
echo "🩺 Performing health check..."
HEALTH_CHECK_COUNT=0
MAX_HEALTH_CHECKS=30

while [ $HEALTH_CHECK_COUNT -lt $MAX_HEALTH_CHECKS ]; do
    if curl -f http://localhost:3210/health > /dev/null 2>&1; then
        echo "✅ Health check passed!"
        break
    fi
    
    HEALTH_CHECK_COUNT=$((HEALTH_CHECK_COUNT + 1))
    echo "⏳ Waiting for service to start... (attempt $HEALTH_CHECK_COUNT/$MAX_HEALTH_CHECKS)"
    sleep 10
done

if [ $HEALTH_CHECK_COUNT -eq $MAX_HEALTH_CHECKS ]; then
    echo "❌ Health check failed after $MAX_HEALTH_CHECKS attempts"
    echo "🔄 Rolling back to previous version..."
    
    # Rollback procedure
    systemctl stop pro5-chrome-manager
    rm -rf "$PROD_DIR"
    cp -r "$BACKUP_DIR"/* "$PROD_DIR"/
    chown -R pro5:pro5 "$PROD_DIR"
    systemctl start pro5-chrome-manager
    
    echo "❌ Deployment failed and rolled back"
    exit 1
fi

# Post-deployment validation
echo "✅ Running post-deployment validation..."
node scripts/production-health-check.js

# Cleanup old backups (keep last 5)
echo "🧹 Cleaning up old backups..."
find /opt/backups -name "pro5-*" -type d | sort -r | tail -n +6 | xargs rm -rf

# Update deployment log
echo "$(date): Production deployment v$(node -p "require('./package.json').version") completed" >> /var/log/pro5-deployments.log

echo "🎉 Production deployment completed successfully!"
echo "📊 Deployment Details:"
echo "   Version: $(node -p "require('./package.json').version")"
echo "   Deployed to: $PROD_DIR"
echo "   Backup: $BACKUP_DIR"
echo "   Health check: http://localhost:3210/health"
echo "   API docs: http://localhost:3210/docs"
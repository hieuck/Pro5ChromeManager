# Staging Environment Configuration

## Environment Variables (.env.staging)
```bash
# Server Configuration
NODE_ENV=staging
SERVER_HOST=0.0.0.0
SERVER_PORT=3210
SESSION_SECRET=staging-session-secret-change-in-production

# Database Configuration (Staging DB)
DATABASE_URL=postgresql://staging_user:staging_password@staging-db.internal:5432/pro5_staging
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10

# Security Configuration
ENCRYPTION_KEY=staging-encryption-key-32-chars!!
JWT_SECRET=staging-jwt-secret-at-least-32-characters
ADMIN_PASSWORD=staging-admin-password

# Feature Flags
FEATURE_FINGERPRINTING=true
FEATURE_PROXY_MANAGEMENT=true
FEATURE_EXTENSION_MANAGEMENT=true
FEATURE_BACKUP_SYSTEM=true

# Backup Configuration
BACKUP_ENABLED=true
BACKUP_INTERVAL_HOURS=6
BACKUP_RETENTION_DAYS=7
BACKUP_COMPRESSION=true

# Monitoring and Logging
LOG_LEVEL=debug
LOG_FORMAT=json
MONITORING_ENABLED=true
METRICS_ENDPOINT=/metrics
HEALTH_CHECK_ENDPOINT=/health

# External Services (Staging)
SENTRY_DSN=https://staging-sentry-dsn-here
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/staging/webhook
EMAIL_SERVICE_API_KEY=staging-email-api-key

# Performance Tuning
MAX_REQUEST_SIZE=10mb
REQUEST_TIMEOUT_MS=30000
CONNECTION_TIMEOUT_MS=5000
```

## Staging Infrastructure Setup Script
```bash
#!/bin/bash
# scripts/setup-staging.sh

echo "🔧 Setting up staging environment..."

# Create staging directory structure
STAGING_DIR="/opt/pro5-chrome-manager-staging"
mkdir -p $STAGING_DIR/{logs,data,backups,config}

# Set proper permissions
chown -R pro5:pro5 $STAGING_DIR
chmod 755 $STAGING_DIR
chmod 700 $STAGING_DIR/config

# Install required packages
apt-get update
apt-get install -y nodejs npm postgresql-client redis-tools

# Create systemd service for staging
cat > /etc/systemd/system/pro5-staging.service << EOF
[Unit]
Description=Pro5 Chrome Manager Staging
After=network.target

[Service]
Type=simple
User=pro5
WorkingDirectory=$STAGING_DIR
ExecStart=/usr/bin/node $STAGING_DIR/server/index.js
Restart=always
RestartSec=10
EnvironmentFile=$STAGING_DIR/.env.staging

[Install]
WantedBy=multi-user.target
EOF

# Enable service
systemctl daemon-reload
systemctl enable pro5-staging

echo "✅ Staging environment setup completed!"
echo "Next steps:"
echo "1. Configure database connection"
echo "2. Set environment variables in $STAGING_DIR/.env.staging"
echo "3. Deploy application code"
echo "4. Start service with: systemctl start pro5-staging"
```

## Staging Deployment Script
```bash
#!/bin/bash
# scripts/deploy-staging.sh

set -e

echo "🚀 Deploying to staging environment..."

# Configuration
STAGING_DIR="/opt/pro5-chrome-manager-staging"
BUILD_DIR="./dist"

# Pre-deployment checks
echo "📋 Running pre-deployment validation..."
./scripts/pre-deploy-validation.sh

# Stop current staging service
echo "⏹️  Stopping current staging service..."
systemctl stop pro5-staging || true

# Create backup of current deployment
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/backups/staging-$TIMESTAMP"
mkdir -p "$BACKUP_DIR"
cp -r "$STAGING_DIR"/* "$BACKUP_DIR/" 2>/dev/null || true

# Deploy new build
echo "📦 Deploying new build..."
rm -rf "$STAGING_DIR"/*
mkdir -p "$STAGING_DIR"/{logs,data,backups,config}

# Copy build artifacts
cp -r "$BUILD_DIR"/* "$STAGING_DIR"/
cp package.json "$STAGING_DIR"/
cp .env.staging "$STAGING_DIR"/.env

# Install production dependencies
cd "$STAGING_DIR"
npm ci --only=production

# Set permissions
chown -R pro5:pro5 "$STAGING_DIR"
chmod 755 "$STAGING_DIR"

# Start staging service
echo "▶️  Starting staging service..."
systemctl start pro5-staging

# Health check
echo "🩺 Performing health check..."
sleep 10
curl -f http://localhost:3210/health || {
    echo "❌ Health check failed, rolling back..."
    systemctl stop pro5-staging
    rm -rf "$STAGING_DIR"
    cp -r "$BACKUP_DIR"/* "$STAGING_DIR"/
    systemctl start pro5-staging
    exit 1
}

# Cleanup old backups (keep last 3)
find /opt/backups -name "staging-*" -type d | sort -r | tail -n +4 | xargs rm -rf

echo "✅ Staging deployment completed successfully!"
echo "Staging URL: http://staging.pro5.internal:3210"
echo "Health check: http://staging.pro5.internal:3210/health"
```

## Staging Health Check Script
```javascript
// scripts/staging-health-check.js
const http = require('http');

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:3210';
const CHECKS = [
  { endpoint: '/health', name: 'Basic Health' },
  { endpoint: '/api/profiles', name: 'Profiles API' },
  { endpoint: '/metrics', name: 'Metrics Endpoint' }
];

async function checkEndpoint(url, endpoint) {
  return new Promise((resolve) => {
    const req = http.get(`${url}${endpoint}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          endpoint,
          status: res.statusCode,
          healthy: res.statusCode >= 200 && res.statusCode < 300,
          responseTime: Date.now() - startTime
        });
      });
    });

    const startTime = Date.now();
    req.setTimeout(5000, () => {
      req.destroy();
      resolve({ endpoint, status: 'TIMEOUT', healthy: false });
    });

    req.on('error', (error) => {
      resolve({ endpoint, status: 'ERROR', healthy: false, error: error.message });
    });
  });
}

async function runStagingHealthCheck() {
  console.log('🏥 Running staging health checks...\n');
  
  const results = [];
  for (const check of CHECKS) {
    const result = await checkEndpoint(STAGING_URL, check.endpoint);
    results.push({ ...result, name: check.name });
    
    const status = result.healthy ? '✅' : '❌';
    console.log(`${status} ${check.name}: ${result.status} (${result.responseTime || 0}ms)`);
  }

  const allHealthy = results.every(r => r.healthy);
  console.log(`\n📊 Summary: ${results.filter(r => r.healthy).length}/${results.length} checks passed`);
  
  if (!allHealthy) {
    console.log('\n⚠️  Some health checks failed!');
    process.exit(1);
  }
  
  console.log('\n✅ All staging health checks passed!');
  process.exit(0);
}

runStagingHealthCheck();
```

This staging setup provides a safe environment to validate the new architecture before production deployment.
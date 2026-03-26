# Production Environment Configuration

## Environment Variables

### Required Variables
```bash
# Server Configuration
NODE_ENV=production
SERVER_HOST=0.0.0.0
SERVER_PORT=3210
SESSION_SECRET=your-session-secret-here

# Database Configuration  
DATABASE_URL=postgresql://username:password@localhost:5432/pro5_chrome_manager
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=20

# Security Configuration
ENCRYPTION_KEY=your-32-character-encryption-key-here
JWT_SECRET=your-jwt-secret-at-least-32-characters
ADMIN_PASSWORD=your-admin-password-here

# Feature Flags
FEATURE_FINGERPRINTING=true
FEATURE_PROXY_MANAGEMENT=true
FEATURE_EXTENSION_MANAGEMENT=true
FEATURE_BACKUP_SYSTEM=true

# Backup Configuration
BACKUP_ENABLED=true
BACKUP_INTERVAL_HOURS=24
BACKUP_RETENTION_DAYS=30
BACKUP_COMPRESSION=true

# Monitoring and Logging
LOG_LEVEL=info
LOG_FORMAT=json
MONITORING_ENABLED=true
METRICS_ENDPOINT=/metrics
HEALTH_CHECK_ENDPOINT=/health

# External Services
SENTRY_DSN=https://your-sentry-dsn-here
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/your/webhook/url
EMAIL_SERVICE_API_KEY=your-email-service-api-key

# Performance Tuning
MAX_REQUEST_SIZE=10mb
REQUEST_TIMEOUT_MS=30000
CONNECTION_TIMEOUT_MS=5000
KEEP_ALIVE_TIMEOUT_MS=5000
HEADERS_TIMEOUT_MS=60000
```

### Optional Variables
```bash
# Optional Performance Settings
CLUSTER_MODE=true
WORKER_PROCESSES=4
MEMORY_LIMIT_MB=2048

# Optional External Integrations
REDIS_URL=redis://localhost:6379
ELASTICSEARCH_URL=http://localhost:9200
PROMETHEUS_PUSH_GATEWAY=http://localhost:9091

# Optional Feature Configurations
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
CACHE_TTL_SECONDS=300
```

## Production Deployment Scripts

### 1. Pre-deployment Validation
```bash
#!/bin/bash
# scripts/pre-deploy-validation.sh

echo "Running pre-deployment checks..."

# Check Node.js version
if [[ $(node -v | cut -d'.' -f1 | sed 's/v//') -lt 18 ]]; then
  echo "ERROR: Node.js 18+ required"
  exit 1
fi

# Check environment variables
required_vars=(
  "NODE_ENV"
  "DATABASE_URL" 
  "ENCRYPTION_KEY"
  "JWT_SECRET"
)

for var in "${required_vars[@]}"; do
  if [[ -z "${!var}" ]]; then
    echo "ERROR: Required environment variable $var is not set"
    exit 1
  fi
done

# Check database connectivity
echo "Testing database connection..."
node scripts/test-database-connection.js || exit 1

echo "Pre-deployment validation passed!"
```

### 2. Build and Test Pipeline
```bash
#!/bin/bash
# scripts/build-and-test.sh

echo "Starting build and test pipeline..."

# Clean previous builds
rm -rf dist/
rm -rf node_modules/.cache/

# Install production dependencies
npm ci --only=production

# Run security audit
npm run security-audit

# Type checking
npm run type-check

# Run tests
npm run test:coverage

# Build application
npm run build

# Post-build validation
node scripts/validate-build.js

echo "Build and test pipeline completed successfully!"
```

### 3. Deployment Script
```bash
#!/bin/bash
# scripts/deploy.sh

set -e

echo "Starting deployment process..."

# Source environment variables
source .env.production

# Run pre-deployment validation
./scripts/pre-deploy-validation.sh

# Stop current service
pm2 stop pro5-chrome-manager || true

# Create backup
timestamp=$(date +%Y%m%d_%H%M%S)
backup_dir="/opt/backups/pro5-chrome-manager-$timestamp"
mkdir -p "$backup_dir"
cp -r /opt/pro5-chrome-manager/* "$backup_dir/" || true

# Deploy new version
rm -rf /opt/pro5-chrome-manager
mkdir -p /opt/pro5-chrome-manager
cp -r dist/* /opt/pro5-chrome-manager/
cp package.json /opt/pro5-chrome-manager/
cp .env.production /opt/pro5-chrome-manager/

# Install production dependencies
cd /opt/pro5-chrome-manager
npm ci --only=production

# Start service with PM2
pm2 start ecosystem.config.js

# Health check
sleep 10
curl -f http://localhost:3210/health || {
  echo "Health check failed, rolling back..."
  pm2 stop pro5-chrome-manager
  rm -rf /opt/pro5-chrome-manager
  cp -r "$backup_dir"/* /opt/pro5-chrome-manager/
  pm2 start ecosystem.config.js
  exit 1
}

# Cleanup old backups (keep last 5)
find /opt/backups -name "pro5-chrome-manager-*" -type d | sort -r | tail -n +6 | xargs rm -rf

echo "Deployment completed successfully!"
```

### 4. Health Monitoring Script
```javascript
// scripts/health-monitor.js
const http = require('http');

const HEALTH_CHECK_URL = process.env.HEALTH_CHECK_URL || 'http://localhost:3210/health';
const TIMEOUT_MS = process.env.HEALTH_CHECK_TIMEOUT || 5000;

async function checkHealth() {
  return new Promise((resolve, reject) => {
    const req = http.get(HEALTH_CHECK_URL, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: 'healthy', data: JSON.parse(data) });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error('Health check timeout'));
    });

    req.on('error', reject);
  });
}

async function runHealthCheck() {
  try {
    const result = await checkHealth();
    console.log('✅ Health check passed:', result);
    process.exit(0);
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    process.exit(1);
  }
}

runHealthCheck();
```

## PM2 Ecosystem Configuration

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'pro5-chrome-manager',
    script: './server/index.js',
    instances: process.env.CLUSTER_MODE === 'true' ? 'max' : 1,
    exec_mode: process.env.CLUSTER_MODE === 'true' ? 'cluster' : 'fork',
    cwd: '/opt/pro5-chrome-manager',
    env: {
      NODE_ENV: 'production',
      PORT: 3210
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    max_memory_restart: process.env.MEMORY_LIMIT_MB ? `${process.env.MEMORY_LIMIT_MB}M` : '2G',
    node_args: '--max-old-space-size=2048',
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 10000,
    restart_delay: 4000
  }]
};
```

## Docker Configuration (Alternative Deployment)

### Dockerfile
```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

FROM node:18-alpine AS runtime

WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3210
USER node

CMD ["node", "dist/server/index.js"]
```

### docker-compose.yml
```yaml
version: '3.8'

services:
  pro5-chrome-manager:
    build: .
    ports:
      - "3210:3210"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:password@db:5432/pro5_chrome_manager
    depends_on:
      - db
      - redis
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs

  db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=pro5_chrome_manager
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

This production configuration provides enterprise-grade deployment capabilities with proper security, monitoring, and operational procedures.
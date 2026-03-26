# Comprehensive Monitoring and Alerting System

## 📊 Monitoring Architecture

### Prometheus Metrics Configuration
```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "alert-rules.yml"

scrape_configs:
  - job_name: 'pro5-chrome-manager'
    static_configs:
      - targets: ['localhost:3210']
    metrics_path: '/metrics'
    scrape_interval: 10s
    
  - job_name: 'node-exporter'
    static_configs:
      - targets: ['localhost:9100']
      
  - job_name: 'postgres-exporter'
    static_configs:
      - targets: ['localhost:9187']

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['localhost:9093']
```

### Alert Rules Configuration
```yaml
# alert-rules.yml
groups:
- name: pro5-chrome-manager-alerts
  rules:
  - alert: HighErrorRate
    expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
    for: 2m
    labels:
      severity: critical
    annotations:
      summary: "High error rate detected"
      description: "{{ $value }}% of requests are failing"

  - alert: HighLatency
    expr: histogram_quantile(0.95, http_request_duration_seconds_bucket) > 2
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "High API latency"
      description: "95th percentile response time is {{ $value }}s"

  - alert: LowDiskSpace
    expr: node_filesystem_free_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"} < 0.1
    for: 5m
    labels:
      severity: critical
    annotations:
      summary: "Low disk space"
      description: "Only {{ $value }}% disk space remaining"

  - alert: HighMemoryUsage
    expr: (node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes > 0.85
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "High memory usage"
      description: "{{ $value }}% of memory is being used"

  - alert: ServiceDown
    expr: up{job="pro5-chrome-manager"} == 0
    for: 1m
    labels:
      severity: critical
    annotations:
      summary: "Service is down"
      description: "Pro5 Chrome Manager service is not responding"
```

## 🚨 Alerting Configuration

### Alertmanager Configuration
```yaml
# alertmanager.yml
global:
  smtp_smarthost: 'smtp.company.com:587'
  smtp_from: 'alerts@company.com'
  smtp_auth_username: 'alerting'
  smtp_auth_password: 'password'

route:
  group_by: ['alertname']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 3h
  receiver: 'team-alerts'

receivers:
- name: 'team-alerts'
  slack_configs:
  - api_url: 'https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK'
    channel: '#pro5-alerts'
    send_resolved: true
    title: '{{ template "slack.default.title" . }}'
    text: '{{ template "slack.default.text" . }}'
  
  email_configs:
  - to: 'operations-team@company.com'
    send_resolved: true
```

## 📈 Grafana Dashboard Configuration

### Main Dashboard JSON
```json
{
  "dashboard": {
    "id": null,
    "title": "Pro5 Chrome Manager - Overview",
    "tags": ["pro5", "chrome-manager"],
    "timezone": "browser",
    "panels": [
      {
        "type": "graph",
        "title": "HTTP Requests Rate",
        "datasource": "Prometheus",
        "targets": [
          {
            "expr": "rate(http_requests_total[5m])",
            "legendFormat": "{{method}} {{status}}"
          }
        ]
      },
      {
        "type": "graph", 
        "title": "Response Time Distribution",
        "datasource": "Prometheus",
        "targets": [
          {
            "expr": "histogram_quantile(0.5, http_request_duration_seconds_bucket)",
            "legendFormat": "50th percentile"
          },
          {
            "expr": "histogram_quantile(0.95, http_request_duration_seconds_bucket)",
            "legendFormat": "95th percentile"
          },
          {
            "expr": "histogram_quantile(0.99, http_request_duration_seconds_bucket)",
            "legendFormat": "99th percentile"
          }
        ]
      },
      {
        "type": "stat",
        "title": "Current Active Profiles",
        "datasource": "Prometheus",
        "targets": [
          {
            "expr": "pro5_active_profiles"
          }
        ]
      },
      {
        "type": "stat",
        "title": "Uptime",
        "datasource": "Prometheus", 
        "targets": [
          {
            "expr": "time() - process_start_time_seconds"
          }
        ]
      }
    ]
  }
}
```

## 🛠️ Custom Metrics Implementation

### Application Metrics Collection
```typescript
// src/server/core/monitoring/metrics.ts
import client from 'prom-client';

// Create metrics registry
const register = new client.Registry();
client.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 10]
});

const activeProfiles = new client.Gauge({
  name: 'pro5_active_profiles',
  help: 'Number of currently active browser profiles'
});

const profileCreations = new client.Counter({
  name: 'pro5_profile_creations_total',
  help: 'Total number of profile creations',
  labelNames: ['success']
});

// Middleware to collect metrics
export function metricsMiddleware(req: any, res: any, next: any) {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration.observe({
      method: req.method,
      route: req.route?.path || req.path,
      status: res.statusCode
    }, duration);
  });
  
  next();
}

// Export metrics endpoint
export function metricsEndpoint(req: any, res: any) {
  res.set('Content-Type', register.contentType);
  register.metrics().then(metrics => {
    res.end(metrics);
  });
}

// Profile metrics helpers
export function incrementProfileCreations(success: boolean) {
  profileCreations.inc({ success: success.toString() });
}

export function setActiveProfiles(count: number) {
  activeProfiles.set(count);
}
```

## 🎯 Health Check Enhancement

### Advanced Health Endpoint
```typescript
// src/server/core/server/http/health.ts
import { Request, Response } from 'express';
import { profileManager } from '../../../features/profiles/ProfileManager';
import { configManager } from '../../../features/config/ConfigManager';

interface HealthCheck {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  details?: any;
}

async function checkDatabase(): Promise<HealthCheck> {
  try {
    // Database connectivity test
    const result = await db.query('SELECT 1');
    return {
      name: 'database',
      status: 'healthy',
      details: { latency: result.latency }
    };
  } catch (error) {
    return {
      name: 'database',
      status: 'unhealthy',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function checkDiskSpace(): Promise<HealthCheck> {
  try {
    const stats = await fs.statfs(configManager.get('paths.dataDir'));
    const freeSpace = stats.bavail * stats.bsize;
    const totalSpace = stats.blocks * stats.bsize;
    const freePercentage = (freeSpace / totalSpace) * 100;
    
    return {
      name: 'disk-space',
      status: freePercentage > 10 ? 'healthy' : 'degraded',
      details: { freePercentage, freeSpace: formatBytes(freeSpace) }
    };
  } catch (error) {
    return {
      name: 'disk-space',
      status: 'unhealthy',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function checkProfiles(): Promise<HealthCheck> {
  try {
    const profileCount = await profileManager.count();
    return {
      name: 'profiles',
      status: profileCount >= 0 ? 'healthy' : 'degraded',
      details: { profileCount }
    };
  } catch (error) {
    return {
      name: 'profiles',
      status: 'unhealthy',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export async function healthEndpoint(req: Request, res: Response) {
  const checks = await Promise.all([
    checkDatabase(),
    checkDiskSpace(),
    checkProfiles()
  ]);

  const unhealthyChecks = checks.filter(c => c.status === 'unhealthy');
  const degradedChecks = checks.filter(c => c.status === 'degraded');
  
  const overallStatus = unhealthyChecks.length > 0 ? 'unhealthy' : 
                       degradedChecks.length > 0 ? 'degraded' : 'healthy';

  res.status(overallStatus === 'unhealthy' ? 503 : 200).json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version,
    uptime: process.uptime(),
    checks
  });
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  
  return `${value.toFixed(2)} ${units[unitIndex]}`;
}
```

## 📊 Log Aggregation Setup

### ELK Stack Configuration
```yaml
# docker-compose.logging.yml
version: '3.8'

services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.11.0
    environment:
      - discovery.type=single-node
      - ES_JAVA_OPTS=-Xms1g -Xmx1g
    ports:
      - "9200:9200"
    volumes:
      - es_data:/usr/share/elasticsearch/data

  kibana:
    image: docker.elastic.co/kibana/kibana:8.11.0
    ports:
      - "5601:5601"
    depends_on:
      - elasticsearch

  logstash:
    image: docker.elastic.co/logstash/logstash:8.11.0
    volumes:
      - ./logstash/pipeline:/usr/share/logstash/pipeline
      - /var/log/pro5:/var/log/pro5:ro
    depends_on:
      - elasticsearch

volumes:
  es_data:
```

This monitoring system provides comprehensive observability with real-time alerts, performance metrics, and health monitoring for production operations.
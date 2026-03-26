# Operational Runbooks and Playbooks

## 📋 Incident Response Playbook

### Critical Service Down Scenario

#### Initial Response (0-5 minutes)
```markdown
** playbook: Service_Down_Incident.md **

## 🔴 CRITICAL INCIDENT: Service Unavailable

### Immediate Actions:
1. **Confirm Outage**
   - Check monitoring dashboards
   - Verify service status: `curl -f http://localhost:3210/health`
   - Check system logs: `journalctl -u pro5-chrome-manager -n 50`

2. **Assess Impact**
   - Number of affected users
   - Business criticality
   - Duration of outage

3. **Communication**
   - Notify stakeholders via Slack: `#incidents` channel
   - Send status update to customers if >5 minutes
   - Assign incident commander

### Diagnosis (5-15 minutes)
```bash
# System Health Check
./scripts/diagnostic/system-health-check.sh

# Service Logs Analysis
journalctl -u pro5-chrome-manager --since "1 hour ago" | grep -i "error\|exception\|fatal"

# Resource Usage
htop
df -h
free -m

# Database Connectivity
psql -h localhost -U pro5_user -d pro5_production -c "SELECT 1;"
```

### Resolution Actions

#### Option 1: Service Restart
```bash
# Graceful restart
systemctl restart pro5-chrome-manager
sleep 30
curl -f http://localhost:3210/health
```

#### Option 2: Rollback to Previous Version
```bash
# Execute rollback procedure
./scripts/deployment/rollback.sh
# Verify health after rollback
curl -f http://localhost:3210/health
```

#### Option 3: Database Recovery
```bash
# Check database status
systemctl status postgresql

# If database down, restart
systemctl restart postgresql
sleep 30

# Verify database connectivity
./scripts/database/health-check.sh
```

### Post-Incident Activities
1. **Root Cause Analysis**
   - Document findings in incident report
   - Update runbooks if procedures changed
   - Schedule post-mortem meeting

2. **Preventive Measures**
   - Implement additional monitoring
   - Add automated recovery procedures
   - Update alerting thresholds

3. **Communication**
   - Send resolution summary to stakeholders
   - Update status page
   - Close incident ticket
```

### Performance Degradation Playbook

#### Detection and Assessment
```markdown
## 🟡 PERFORMANCE INCIDENT: Degraded Service

### Identification:
- Response times > 2s (95th percentile)
- Error rates > 1%
- CPU usage > 80%
- Memory usage > 85%

### Investigation Steps:

1. **Resource Analysis**
```bash
# CPU and Memory
top -b -n 1 | head -20
ps aux --sort=-%cpu | head -10

# Disk I/O
iostat -x 1 5

# Network
ss -tuln | grep 3210
netstat -i
```

2. **Application Profiling**
```bash
# Take heap dump
kill -USR2 $(pgrep -f "pro5-chrome-manager")

# CPU profiling
clinic doctor -- node dist/server/index.js

# Memory profiling  
clinic bubbleprof -- node dist/server/index.js
```

3. **Database Performance**
```sql
-- Slow query analysis
SELECT query, mean_time, calls 
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;

-- Connection pool status
SELECT count(*) as connections,
       state,
       wait_event_type
FROM pg_stat_activity 
WHERE datname = 'pro5_production'
GROUP BY state, wait_event_type;
```

### Remediation Actions:

#### Short-term Fixes:
1. **Cache Warming**
```bash
# Pre-populate caches
curl -X POST http://localhost:3210/admin/cache/warm
```

2. **Connection Pool Adjustment**
```bash
# Increase database connections temporarily
sudo -u postgres psql -c "ALTER SYSTEM SET max_connections = 200;"
sudo systemctl reload postgresql
```

3. **Load Shedding**
```bash
# Enable rate limiting
curl -X POST http://localhost:3210/admin/rate-limit/enable?threshold=50
```

#### Long-term Solutions:
1. **Scaling**
   - Add application instances
   - Database read replicas
   - CDN implementation

2. **Optimization**
   - Query optimization
   - Index improvements
   - Caching strategy enhancement

3. **Architecture Improvements**
   - Microservices decomposition
   - Asynchronous processing
   - Database sharding
```

## 🛠️ Routine Operations Runbooks

### Daily Operations Checklist
```markdown
## 📅 DAILY OPERATIONS CHECKLIST

### Morning Health Check (9:00 AM)
- [ ] Service health status: `curl -f http://localhost:3210/health`
- [ ] Error rate review: Check logs for >1% error rate
- [ ] Resource utilization: CPU < 70%, Memory < 80%
- [ ] Backup verification: Latest backup successful
- [ ] Monitoring alerts: No critical alerts in past 24 hours

### Performance Review (10:00 AM)
- [ ] Response time analysis: 95th percentile < 500ms
- [ ] Database performance: Query times < 100ms
- [ ] User experience metrics: Page load times
- [ ] Capacity planning: Resource trends analysis

### Security Check (11:00 AM)
- [ ] Security scan results review
- [ ] Access logs analysis for suspicious activity
- [ ] Certificate expiration check
- [ ] Dependency vulnerability scan

### Evening Summary (5:00 PM)
- [ ] Daily metrics report generation
- [ ] Incident summary compilation
- [ ] Capacity and performance trends
- [ ] Tomorrow's planned maintenance review
```

### Weekly Maintenance Runbook
```markdown
## 📆 WEEKLY MAINTENANCE PROCEDURES

### Monday: System Updates
```bash
# OS Security Updates
sudo apt update && sudo apt upgrade -y

# Application Dependencies
cd /opt/pro5-chrome-manager
sudo -u pro5 npm audit fix

# Database Maintenance
sudo -u postgres psql -c "ANALYZE;"
```

### Tuesday: Backup Verification
```bash
# Verify backup integrity
./scripts/backup/verify-backups.sh

# Test restore procedure
./scripts/backup/test-restore.sh

# Rotate old backups
./scripts/backup/rotate-backups.sh
```

### Wednesday: Performance Tuning
```bash
# Database optimization
sudo -u postgres psql -c "REINDEX DATABASE pro5_production;"

# Application cache cleanup
curl -X POST http://localhost:3210/admin/cache/cleanup

# Log rotation
logrotate /etc/logrotate.d/pro5-chrome-manager
```

### Thursday: Security Review
```bash
# Full security scan
./scripts/security/full-scan.sh

# Certificate renewal check
./scripts/security/cert-check.sh

# Access review
./scripts/security/access-review.sh
```

### Friday: Capacity Planning
```bash
# Resource trend analysis
./scripts/monitoring/resource-trends.sh

# Performance benchmarking
./scripts/performance/benchmark.sh

# Scaling decision support
./scripts/capacity/planning-report.sh
```
```

### Monthly Operations Review
```markdown
## 📊 MONTHLY OPERATIONS REVIEW

### Metrics Analysis
- Service uptime and availability
- Performance trends and degradation patterns
- Resource utilization efficiency
- User growth and capacity requirements
- Incident frequency and resolution times

### Architecture Review
- Technical debt assessment
- Scalability requirements planning
- Security posture evaluation
- Compliance verification
- Technology stack currency

### Process Improvement
- Incident response effectiveness
- Automation opportunity identification
- Documentation completeness
- Team skill development needs
- Vendor relationship management

### Budget and Planning
- Infrastructure cost analysis
- Licensing and subscription renewals
- Capital expenditure planning
- Resource allocation optimization
- ROI assessment of improvements
```

## 🚨 Emergency Procedures

### Data Loss Recovery
```markdown
## 💾 DATA LOSS EMERGENCY PROCEDURE

### Immediate Actions:
1. **Stop all write operations**
   ```bash
   systemctl stop pro5-chrome-manager
   ```

2. **Assess damage extent**
   ```bash
   # Check database status
   pg_isready -h localhost
   
   # Identify corrupted tables
   psql -c "SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'public';"
   ```

3. **Restore from backup**
   ```bash
   # Latest backup restore
   ./scripts/backup/restore-latest.sh
   
   # Point-in-time recovery if needed
   ./scripts/backup/point-in-time-restore.sh "2024-01-15 14:30:00"
   ```

4. **Validation and Testing**
   ```bash
   # Data integrity check
   ./scripts/database/integrity-check.sh
   
   # Functional testing
   npm run test:e2e
   ```

5. **Gradual Service Restoration**
   ```bash
   # Start in read-only mode first
   ./scripts/service/start-readonly.sh
   
   # Monitor for issues
   ./scripts/monitoring/watch-mode.sh
   
   # Enable write operations
   ./scripts/service/enable-writes.sh
   ```
```

### Security Breach Response
```markdown
## 🔐 SECURITY BREACH RESPONSE

### Containment Phase:
1. **Immediate Isolation**
   ```bash
   # Block external access
   iptables -A INPUT -p tcp --dport 3210 -j DROP
   
   # Disable user access
   ./scripts/security/lockdown.sh
   ```

2. **Evidence Collection**
   ```bash
   # System snapshot
   ./scripts/forensics/system-snapshot.sh
   
   # Log preservation
   ./scripts/forensics/preserve-logs.sh
   
   # Memory dump if needed
   ./scripts/forensics/memory-dump.sh
   ```

3. **Threat Analysis**
   ```bash
   # Malware scanning
   clamscan -r /opt/pro5-chrome-manager/
   
   # Network analysis
   tcpdump -i any -w breach-analysis.pcap
   
   # File integrity check
   aide --check
   ```

### Eradication and Recovery:
1. **Clean System Rebuild**
   ```bash
   # Fresh OS installation
   ./scripts/deployment/fresh-install.sh
   
   # Secure configuration
   ./scripts/security/hardening.sh
   
   # Application redeployment
   ./scripts/deployment/deploy-secure.sh
   ```

2. **Verification and Monitoring**
   ```bash
   # Security validation
   ./scripts/security/validation.sh
   
   # Continuous monitoring setup
   ./scripts/monitoring/security-monitor.sh
   
   # Alert configuration
   ./scripts/alerting/security-alerts.sh
   ```

### Post-Incident Activities:
1. **Lessons Learned Documentation**
2. **Security Enhancement Implementation**
3. **Stakeholder Communication**
4. **Regulatory Reporting if Required**
```

These operational runbooks provide comprehensive guidance for managing the Pro5 Chrome Manager in production, covering routine operations, incident response, and emergency procedures.
# Operational Runbooks

## Daily Operations

### Morning Checklist
- Check system status: `systemctl status pro5-*`
- Review logs: `journalctl -u pro5-server --since "1 hour ago"`
- Monitor resources: `free -h && df -h`
- Verify application health: `curl http://localhost:3000/health`

### Incident Response

#### Critical (P0) - 15 minute response
1. Acknowledge incident
2. Assemble response team
3. Assess impact and scope
4. Implement resolution
5. Communicate status

#### High Priority (P1) - 1 hour response
1. Investigate root cause
2. Apply fixes
3. Monitor recovery
4. Document findings

### Performance Monitoring

#### Key Metrics
- Response time < 2 seconds
- Error rate < 1%
- CPU usage < 70%
- Memory usage < 80%

#### Monitoring Commands
```bash
# Health check
curl -f http://localhost:3000/health

# Metrics
curl -s http://localhost:3000/metrics | jq '.'

# Resource usage
htop
iostat -x 5
```

### Backup and Recovery

#### Daily Backup
```bash
# Database
pg_dump pro5_db > /backup/daily/database-$(date +%Y%m%d).sql

# Application data
tar -czf /backup/daily/data-$(date +%Y%m%d).tar.gz /opt/pro5/data/
```

#### Recovery Process
1. Stop services
2. Restore database
3. Restore application data
4. Start services
5. Verify functionality

### Deployment Operations

#### Pre-deployment
- Run tests: `npm run test`
- Create backup
- Notify stakeholders

#### Deployment Steps
1. Stop worker processes
2. Deploy new code
3. Run database migrations
4. Start services
5. Verify health

#### Rollback Procedure
1. Stop services
2. Checkout previous version
3. Restore database (if needed)
4. Start services
5. Verify functionality

### Security Operations

#### Monitoring
- Check failed logins: `grep "Failed" /var/log/auth.log`
- Monitor network connections: `netstat -an`
- File integrity checks: `find /opt/pro5 -type f -mtime -1`

#### Access Management
- Add users: `sudo useradd username`
- Remove access: `sudo userdel username`
- Update permissions: `chmod` and `chown` commands

### Troubleshooting Guide

#### Common Issues

**Application won't start:**
```bash
journalctl -u pro5-server -n 50
systemctl status pro5-server
ps aux | grep pro5
```

**Performance issues:**
```bash
top -p $(pgrep -f pro5-server)
vmstat 5
iostat -x 5
```

**Database connectivity:**
```bash
nc -zv database.host 5432
psql -c "SELECT 1;" pro5_db
```

**Memory problems:**
```bash
free -h
ps aux --sort=-%mem | head -10
```

### Emergency Contacts

- Primary On-Call: [Contact Info]
- Secondary On-Call: [Contact Info]
- Infrastructure Team: [Contact Info]
- Database Admin: [Contact Info]
#!/bin/bash
# scripts/comprehensive-test-suite.sh

set -e

echo "🔬 Running Comprehensive Test Suite..."
echo "Environment: $(NODE_ENV)"
echo "Timestamp: $(date)"

# Test Categories Configuration
ENABLE_UNIT_TESTS=true
ENABLE_INTEGRATION_TESTS=true
ENABLE_E2E_TESTS=true
ENABLE_PERFORMANCE_TESTS=true
ENABLE_SECURITY_TESTS=true

# Test Configuration
TEST_TIMEOUT=30000
PARALLEL_JOBS=4
FAIL_FAST=false

# Results Tracking
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log_result() {
    local status=$1
    local message=$2
    case $status in
        "PASS")
            echo -e "${GREEN}✅ PASS${NC} $message"
            ((PASSED_TESTS++))
            ;;
        "FAIL")
            echo -e "${RED}❌ FAIL${NC} $message"
            ((FAILED_TESTS++))
            if [ "$FAIL_FAST" = true ]; then
                exit 1
            fi
            ;;
        "WARN")
            echo -e "${YELLOW}⚠️  WARN${NC} $message"
            ;;
        *)
            echo "📝 INFO $message"
            ;;
    esac
    ((TOTAL_TESTS++))
}

# Run test with timeout
run_test() {
    local test_name=$1
    local test_command=$2
    local timeout=${3:-$TEST_TIMEOUT}
    
    log_result "INFO" "Running: $test_name"
    
    if timeout $timeout bash -c "$test_command" > /tmp/test_output 2>&1; then
        log_result "PASS" "$test_name completed successfully"
        return 0
    else
        local exit_code=$?
        if [ $exit_code -eq 124 ]; then
            log_result "FAIL" "$test_name timed out after ${timeout}ms"
        else
            log_result "FAIL" "$test_name failed with exit code $exit_code"
            cat /tmp/test_output
        fi
        return 1
    fi
}

# Unit Tests
if [ "$ENABLE_UNIT_TESTS" = true ]; then
    echo -e "\n${BLUE}🧪 Running Unit Tests${NC}"
    
    run_test "Core Architecture Components" "
        npm run test src/core/__tests__/
    "
    
    run_test "Domain Entities" "
        npm run test src/domain/entities/__tests__/
    "
    
    run_test "Application Services" "
        npm run test src/application/services/__tests__/
    "
    
    run_test "Repository Implementations" "
        npm run test src/infrastructure/repositories/__tests__/
    "
fi

# Integration Tests
if [ "$ENABLE_INTEGRATION_TESTS" = true ]; then
    echo -e "\n${BLUE}🔗 Running Integration Tests${NC}"
    
    # Start test database
    log_result "INFO" "Starting test database..."
    docker run -d --name test-postgres -e POSTGRES_PASSWORD=testpass -p 5433:5432 postgres:15 > /dev/null 2>&1
    sleep 10
    
    run_test "Database Integration" "
        DATABASE_URL=postgresql://postgres:testpass@localhost:5433/postgres \
        npm run test src/integration/database/
    "
    
    run_test "API Integration" "
        npm run test src/integration/api/
    "
    
    # Cleanup
    docker stop test-postgres > /dev/null 2>&1
    docker rm test-postgres > /dev/null 2>&1
fi

# End-to-End Tests
if [ "$ENABLE_E2E_TESTS" = true ]; then
    echo -e "\n${BLUE}🌐 Running End-to-End Tests${NC}"
    
    # Start application for E2E tests
    log_result "INFO" "Starting application for E2E tests..."
    npm run dev:server > /tmp/app.log 2>&1 &
    APP_PID=$!
    sleep 15
    
    run_test "Profile Management E2E" "
        npm run test:e2e src/e2e/profile-management.spec.ts
    "
    
    run_test "Proxy Configuration E2E" "
        npm run test:e2e src/e2e/proxy-configuration.spec.ts
    "
    
    # Cleanup
    kill $APP_PID 2>/dev/null || true
fi

# Performance Tests
if [ "$ENABLE_PERFORMANCE_TESTS" = true ]; then
    echo -e "\n${BLUE}⚡ Running Performance Tests${NC}"
    
    # Start application for performance tests
    npm run dev:server > /dev/null 2>&1 &
    APP_PID=$!
    sleep 15
    
    run_test "API Response Time" "
        node scripts/performance/api-response-time.js
    "
    
    run_test "Concurrent Requests" "
        node scripts/performance/concurrent-requests.js
    "
    
    run_test "Memory Usage" "
        node scripts/performance/memory-usage.js
    "
    
    # Cleanup
    kill $APP_PID 2>/dev/null || true
fi

# Security Tests
if [ "$ENABLE_SECURITY_TESTS" = true ]; then
    echo -e "\n${BLUE}🛡️  Running Security Tests${NC}"
    
    run_test "Dependency Security Audit" "
        npm audit --audit-level=high
    "
    
    run_test "Code Security Scan" "
        npx eslint src/ --ext .ts,.tsx --rule 'security/detect-object-injection: error'
    "
    
    run_test "Input Validation" "
        npm run test src/security/input-validation.test.ts
    "
fi

# Generate Test Report
echo -e "\n${BLUE}📋 Generating Test Report${NC}"

cat > test-report.json << EOF
{
  "timestamp": "$(date -Iseconds)",
  "environment": "$NODE_ENV",
  "gitInfo": {
    "hash": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
    "branch": "$(git branch --show-current 2>/dev/null || echo 'unknown')"
  },
  "testResults": {
    "totalTests": $TOTAL_TESTS,
    "passedTests": $PASSED_TESTS,
    "failedTests": $FAILED_TESTS,
    "successRate": $(echo "scale=2; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc)
  },
  "categories": {
    "unitTests": $ENABLE_UNIT_TESTS,
    "integrationTests": $ENABLE_INTEGRATION_TESTS,
    "e2eTests": $ENABLE_E2E_TESTS,
    "performanceTests": $ENABLE_PERFORMANCE_TESTS,
    "securityTests": $ENABLE_SECURITY_TESTS
  }
}
EOF

# Final Summary
echo -e "\n${BLUE}🏁 Test Suite Summary${NC}"
echo "==================================="
echo "Total Tests: $TOTAL_TESTS"
echo "Passed: $PASSED_TESTS"
echo "Failed: $FAILED_TESTS"
echo "Success Rate: $(echo "scale=1; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc)%"

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "\n${GREEN}🎉 All tests passed!${NC}"
    exit 0
else
    echo -e "\n${RED}❌ $FAILED_TESTS tests failed${NC}"
    exit 1
fi
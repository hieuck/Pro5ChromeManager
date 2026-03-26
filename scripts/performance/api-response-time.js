// scripts/performance/api-response-time.js
const http = require('http');
const https = require('https');

class PerformanceTester {
  constructor(baseUrl = 'http://localhost:3210') {
    this.baseUrl = baseUrl;
    this.results = [];
  }

  async makeRequest(endpoint, method = 'GET') {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    const client = url.protocol === 'https:' ? https : http;
    
    return new Promise((resolve, reject) => {
      const startTime = process.hrtime.bigint();
      
      const req = client.request(url, { method }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          const endTime = process.hrtime.bigint();
          const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
          
          resolve({
            endpoint,
            method,
            statusCode: res.statusCode,
            responseTime: duration,
            success: res.statusCode >= 200 && res.statusCode < 300
          });
        });
      });

      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      
      req.end();
    });
  }

  async runBenchmark() {
    console.log('🚀 Starting API Response Time Benchmark...\n');
    
    const endpoints = [
      { path: '/health', method: 'GET', expectedMaxTime: 50 },
      { path: '/api/profiles', method: 'GET', expectedMaxTime: 100 },
      { path: '/api/profiles', method: 'POST', expectedMaxTime: 200 },
      { path: '/metrics', method: 'GET', expectedMaxTime: 75 }
    ];

    const iterations = 100;
    const concurrentRequests = 10;

    for (const endpoint of endpoints) {
      console.log(`Testing ${endpoint.method} ${endpoint.path}...`);
      
      const iterationResults = [];
      
      // Sequential testing for accuracy
      for (let i = 0; i < iterations; i++) {
        try {
          const result = await this.makeRequest(endpoint.path, endpoint.method);
          iterationResults.push(result);
          
          // Show progress
          if ((i + 1) % 20 === 0) {
            process.stdout.write(`.${i + 1}`);
          }
        } catch (error) {
          iterationResults.push({
            endpoint: endpoint.path,
            method: endpoint.method,
            error: error.message,
            success: false
          });
        }
      }
      
      console.log(' Done\n');
      
      // Calculate statistics
      const successfulRequests = iterationResults.filter(r => r.success);
      const responseTimes = successfulRequests.map(r => r.responseTime);
      
      if (responseTimes.length > 0) {
        const stats = this.calculateStats(responseTimes);
        const passRate = (successfulRequests.length / iterations) * 100;
        
        this.results.push({
          endpoint: endpoint.path,
          method: endpoint.method,
          ...stats,
          passRate,
          targetMaxTime: endpoint.expectedMaxTime
        });

        this.printResults(endpoint, stats, passRate, endpoint.expectedMaxTime);
      }
    }

    this.generateReport();
    return this.analyzeResults();
  }

  calculateStats(times) {
    const sorted = [...times].sort((a, b) => a - b);
    const sum = times.reduce((a, b) => a + b, 0);
    const avg = sum / times.length;
    
    return {
      average: Math.round(avg * 100) / 100,
      min: Math.min(...times),
      max: Math.max(...times),
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }

  printResults(endpoint, stats, passRate, targetMax) {
    console.log(`📊 ${endpoint.method} ${endpoint.path} Results:`);
    console.log(`   Success Rate: ${passRate.toFixed(1)}% (${passRate === 100 ? '✅' : '⚠️'})`);
    console.log(`   Average: ${stats.average}ms`);
    console.log(`   Min/Max: ${stats.min}ms / ${stats.max}ms`);
    console.log(`   Median: ${stats.median}ms`);
    console.log(`   95th Percentile: ${stats.p95}ms ${stats.p95 <= targetMax ? '✅' : '❌'}`);
    console.log(`   99th Percentile: ${stats.p99}ms`);
    console.log(`   Target: ≤${targetMax}ms\n`);
  }

  analyzeResults() {
    const failedTargets = this.results.filter(r => r.p95 > r.targetMaxTime);
    const overallPassRate = this.results.every(r => r.passRate >= 95);
    const performanceGoalsMet = failedTargets.length === 0;

    console.log('🎯 Performance Analysis:');
    console.log(`   Overall Pass Rate: ${overallPassRate ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`   Performance Targets: ${performanceGoalsMet ? '✅ MET' : '❌ MISSED'}`);
    console.log(`   Failed Endpoints: ${failedTargets.length}\n`);

    if (failedTargets.length > 0) {
      console.log('❌ Endpoints failing performance targets:');
      failedTargets.forEach(target => {
        console.log(`   - ${target.method} ${target.endpoint}: ${target.p95}ms > ${target.targetMaxTime}ms`);
      });
    }

    return {
      overallPassRate,
      performanceGoalsMet,
      failedTargets,
      totalEndpoints: this.results.length
    };
  }

  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      testResults: this.results,
      summary: {
        totalEndpoints: this.results.length,
        averageResponseTime: Math.round(this.results.reduce((sum, r) => sum + r.average, 0) / this.results.length * 100) / 100,
        worstEndpoint: this.results.reduce((worst, current) => 
          current.p95 > worst.p95 ? current : worst
        )
      }
    };

    require('fs').writeFileSync('performance-report.json', JSON.stringify(report, null, 2));
    console.log('📄 Performance report saved to performance-report.json\n');
  }
}

// Run the benchmark
async function runPerformanceTest() {
  const tester = new PerformanceTester();
  const results = await tester.runBenchmark();
  
  process.exit(results.performanceGoalsMet && results.overallPassRate ? 0 : 1);
}

runPerformanceTest().catch(error => {
  console.error('Performance test failed:', error);
  process.exit(1);
});
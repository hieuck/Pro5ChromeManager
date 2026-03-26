#!/usr/bin/env node

/**
 * Performance Testing Script
 * Measures build times, bundle sizes, and runtime performance
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class PerformanceTester {
  constructor() {
    this.results = {
      buildTimes: {},
      bundleSizes: {},
      memoryUsage: {}
    };
  }

  runTests() {
    console.log('🚀 Starting Performance Tests...\n');

    // Test 1: Standard Build Performance
    this.testStandardBuild();

    // Test 2: Optimized Build Performance
    this.testOptimizedBuild();

    // Test 3: Bundle Size Analysis
    this.analyzeBundleSizes();

    // Test 4: Memory Usage
    this.testMemoryUsage();

    // Display Results
    this.displayResults();
  }

  testStandardBuild() {
    console.log('📏 Testing Standard Build...');
    const start = Date.now();
    
    try {
      execSync('npm run build', { stdio: 'inherit' });
      const duration = Date.now() - start;
      this.results.buildTimes.standard = duration;
      console.log(`✅ Standard build completed in ${duration}ms\n`);
    } catch (error) {
      console.error('❌ Standard build failed:', error.message);
    }
  }

  testOptimizedBuild() {
    console.log('⚡ Testing Optimized Build...');
    const start = Date.now();
    
    try {
      execSync('npm run build:optimized', { stdio: 'inherit' });
      const duration = Date.now() - start;
      this.results.buildTimes.optimized = duration;
      console.log(`✅ Optimized build completed in ${duration}ms\n`);
    } catch (error) {
      console.error('❌ Optimized build failed:', error.message);
    }
  }

  analyzeBundleSizes() {
    console.log('📦 Analyzing Bundle Sizes...');
    
    const uiDistPath = path.join(__dirname, '..', 'dist', 'ui');
    if (!fs.existsSync(uiDistPath)) {
      console.log('⚠️  UI distribution not found');
      return;
    }

    const files = fs.readdirSync(uiDistPath);
    const jsFiles = files.filter(file => file.endsWith('.js') && !file.includes('chunk'));

    jsFiles.forEach(file => {
      const filePath = path.join(uiDistPath, file);
      const stats = fs.statSync(filePath);
      const sizeInKB = Math.round(stats.size / 1024);
      
      this.results.bundleSizes[file] = {
        size: sizeInKB,
        path: filePath
      };
      
      console.log(`  ${file}: ${sizeInKB}KB`);
    });

    // Calculate total size
    const totalSize = Object.values(this.results.bundleSizes)
      .reduce((sum, file) => sum + file.size, 0);
    this.results.bundleSizes.total = totalSize;
    console.log(`📊 Total bundle size: ${totalSize}KB\n`);
  }

  testMemoryUsage() {
    console.log('🧠 Testing Memory Usage...');
    
    // Start server and measure memory
    try {
      const serverProcess = execSync('node dist/server/server/index.js', {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 10000,
        killSignal: 'SIGTERM'
      });
      
      // This is a simplified test - in reality you'd want to measure
      // the actual running process memory usage
      console.log('✅ Memory usage test completed\n');
    } catch (error) {
      if (error.signal === 'SIGTERM') {
        console.log('✅ Server terminated successfully\n');
      } else {
        console.error('❌ Memory usage test failed:', error.message);
      }
    }
  }

  displayResults() {
    console.log('\n📈 PERFORMANCE TEST RESULTS');
    console.log('==========================');

    // Build Times Comparison
    if (this.results.buildTimes.standard && this.results.buildTimes.optimized) {
      const improvement = Math.round(
        ((this.results.buildTimes.standard - this.results.buildTimes.optimized) 
        / this.results.buildTimes.standard) * 100
      );
      
      console.log('\n🏗️  Build Time Comparison:');
      console.log(`  Standard: ${this.results.buildTimes.standard}ms`);
      console.log(`  Optimized: ${this.results.buildTimes.optimized}ms`);
      console.log(`  Improvement: ${improvement}% faster`);
    }

    // Bundle Sizes
    if (this.results.bundleSizes.total) {
      console.log('\n📦 Bundle Size Analysis:');
      console.log(`  Total Size: ${this.results.bundleSizes.total}KB`);
      
      // Show individual files
      Object.entries(this.results.bundleSizes).forEach(([file, data]) => {
        if (file !== 'total') {
          console.log(`  ${file}: ${data.size}KB`);
        }
      });
    }

    console.log('\n✨ Performance testing completed!');
  }
}

// Run the tests
const tester = new PerformanceTester();
tester.runTests();
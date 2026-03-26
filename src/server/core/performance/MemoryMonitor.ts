import { logger } from '../logging/logger';

class MemoryMonitor {
  private static instance: MemoryMonitor;
  private monitoringInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.startMonitoring();
  }

  public static getInstance(): MemoryMonitor {
    if (!MemoryMonitor.instance) {
      MemoryMonitor.instance = new MemoryMonitor();
    }
    return MemoryMonitor.instance;
  }

  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      const memoryUsage = process.memoryUsage();
      
      // Convert bytes to MB for readability
      const memoryMB = {
        rss: Math.round(memoryUsage.rss / 1024 / 1024),
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        external: Math.round(memoryUsage.external / 1024 / 1024),
        arrayBuffers: Math.round(memoryUsage.arrayBuffers / 1024 / 1024)
      };

      logger.debug('Memory usage', memoryMB);

      // Alert on high memory usage
      if (memoryMB.heapUsed > 500) { // 500MB threshold
        logger.warn('High memory usage detected', memoryMB);
        this.performGarbageCollection();
      }

      // Alert on memory leaks
      if (memoryMB.heapUsed > memoryMB.heapTotal * 0.9) {
        logger.error('Critical memory usage - potential memory leak', memoryMB);
        this.logHeapStatistics();
      }
    }, 30000); // Check every 30 seconds
  }

  private performGarbageCollection(): void {
    if (global.gc) {
      const before = process.memoryUsage();
      global.gc();
      const after = process.memoryUsage();
      
      logger.info('Manual garbage collection performed', {
        before: Math.round(before.heapUsed / 1024 / 1024),
        after: Math.round(after.heapUsed / 1024 / 1024),
        freed: Math.round((before.heapUsed - after.heapUsed) / 1024 / 1024)
      });
    }
  }

  private logHeapStatistics(): void {
    if ((process as any).heapdump) {
      const filename = `heapdump-${Date.now()}.heapsnapshot`;
      (process as any).heapdump(filename, (err: Error | null) => {
        if (err) {
          logger.error('Failed to create heap dump', { error: err.message });
        } else {
          logger.info('Heap dump created', { filename });
        }
      });
    }
  }

  public stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  public forceGarbageCollection(): void {
    this.performGarbageCollection();
  }
}

export const memoryMonitor = MemoryMonitor.getInstance();
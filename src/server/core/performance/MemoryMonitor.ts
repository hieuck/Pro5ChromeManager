import { logger } from '../logging/logger';

const BYTES_PER_MEGABYTE = 1024 * 1024;
const HIGH_HEAP_USAGE_THRESHOLD_MB = 500;
const HEAP_LEAK_UTILIZATION_THRESHOLD = 0.9;
const MEMORY_MONITOR_INTERVAL_MS = 30_000;
const HEAP_DUMP_FILE_PREFIX = 'heapdump';
const HEAP_DUMP_FILE_EXTENSION = '.heapsnapshot';

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
        rss: Math.round(memoryUsage.rss / BYTES_PER_MEGABYTE),
        heapTotal: Math.round(memoryUsage.heapTotal / BYTES_PER_MEGABYTE),
        heapUsed: Math.round(memoryUsage.heapUsed / BYTES_PER_MEGABYTE),
        external: Math.round(memoryUsage.external / BYTES_PER_MEGABYTE),
        arrayBuffers: Math.round(memoryUsage.arrayBuffers / BYTES_PER_MEGABYTE)
      };

      logger.debug('Memory usage', memoryMB);

      // Alert on high memory usage
      if (memoryMB.heapUsed > HIGH_HEAP_USAGE_THRESHOLD_MB) {
        logger.warn('High memory usage detected', memoryMB);
        this.performGarbageCollection();
      }

      // Alert on memory leaks
      if (memoryMB.heapUsed > memoryMB.heapTotal * HEAP_LEAK_UTILIZATION_THRESHOLD) {
        logger.error('Critical memory usage - potential memory leak', memoryMB);
        this.logHeapStatistics();
      }
    }, MEMORY_MONITOR_INTERVAL_MS);
  }

  private performGarbageCollection(): void {
    if (global.gc) {
      const before = process.memoryUsage();
      global.gc();
      const after = process.memoryUsage();
      
      logger.info('Manual garbage collection performed', {
        before: Math.round(before.heapUsed / BYTES_PER_MEGABYTE),
        after: Math.round(after.heapUsed / BYTES_PER_MEGABYTE),
        freed: Math.round((before.heapUsed - after.heapUsed) / BYTES_PER_MEGABYTE)
      });
    }
  }

  private logHeapStatistics(): void {
    if ((process as any).heapdump) {
      const filename = `${HEAP_DUMP_FILE_PREFIX}-${Date.now()}${HEAP_DUMP_FILE_EXTENSION}`;
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

import http from 'http';

const POLL_INTERVAL_MS = 500;

/**
 * Poll http://localhost:{port}/json/version every 500ms until it returns HTTP 200
 * or the timeout is exceeded.
 * Resolves when CDP is ready, rejects on timeout.
 */
export function waitForCDP(port: number, timeoutMs: number = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    function poll(): void {
      if (Date.now() >= deadline) {
        reject(new Error(`CDP not ready on port ${port} after ${timeoutMs}ms`));
        return;
      }

      const req = http.get(
        { host: '127.0.0.1', port, path: '/json/version', timeout: POLL_INTERVAL_MS },
        (res) => {
          if (res.statusCode === 200) {
            // Drain response body
            res.resume();
            resolve();
          } else {
            res.resume();
            setTimeout(poll, POLL_INTERVAL_MS);
          }
        },
      );

      req.on('error', () => {
        setTimeout(poll, POLL_INTERVAL_MS);
      });

      req.on('timeout', () => {
        req.destroy();
        setTimeout(poll, POLL_INTERVAL_MS);
      });
    }

    poll();
  });
}

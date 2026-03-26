import net from 'net';

const DEFAULT_START = 40000;
const DEFAULT_END = 49999;

/**
 * Test if a TCP port is free by attempting to bind to it.
 * Returns true if the port is available (bind succeeds), false otherwise.
 */
function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

/**
 * Find a free TCP port in the range [start, end].
 * Throws if no free port is found in the range.
 */
export async function findFreePort(
  start: number = DEFAULT_START,
  end: number = DEFAULT_END,
): Promise<number> {
  for (let port = start; port <= end; port++) {
    if (await isPortFree(port)) {
      return port;
    }
  }
  throw new Error(`No free port found in range ${start}–${end}`);
}

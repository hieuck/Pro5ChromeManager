import net from 'net';

const DEFAULT_START = 40000;
const DEFAULT_END = 49999;
const LOOPBACK_HOST = '127.0.0.1';

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, LOOPBACK_HOST);
  });
}

export async function findFreePort(
  start: number = DEFAULT_START,
  end: number = DEFAULT_END,
): Promise<number> {
  for (let port = start; port <= end; port += 1) {
    if (await isPortFree(port)) {
      return port;
    }
  }

  throw new Error(`No free port found in range ${start}-${end}`);
}

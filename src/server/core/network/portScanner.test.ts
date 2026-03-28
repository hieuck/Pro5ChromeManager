import net from 'net';
import { afterEach, describe, expect, it } from 'vitest';
import { findFreePort } from './portScanner';

describe('findFreePort', () => {
  const servers: net.Server[] = [];

  afterEach(async () => {
    await Promise.all(servers.map((server) => new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }).catch(() => undefined)));
    servers.length = 0;
  });

  async function listenOnRandomPort(): Promise<number> {
    const server = net.createServer();
    servers.push(server);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to bind test port');
    }

    return address.port;
  }

  async function closeServer(server: net.Server): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  it('returns a free port when the requested range is available', async () => {
    const server = net.createServer();
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to bind test port');
    }

    const candidatePort = address.port;
    await closeServer(server);

    await expect(findFreePort(candidatePort, candidatePort)).resolves.toBe(candidatePort);
  });

  it('skips occupied ports and returns a different free port in the range', async () => {
    const occupiedPort = await listenOnRandomPort();

    const freePort = await findFreePort(occupiedPort, occupiedPort + 50);

    expect(freePort).toBeGreaterThanOrEqual(occupiedPort);
    expect(freePort).toBeLessThanOrEqual(occupiedPort + 50);
    expect(freePort).not.toBe(occupiedPort);
  });

  it('throws when every port in the range is occupied', async () => {
    const occupiedPort = await listenOnRandomPort();

    await expect(findFreePort(occupiedPort, occupiedPort)).rejects.toThrow(
      `No free port found in range ${occupiedPort}-${occupiedPort}`,
    );
  });
});

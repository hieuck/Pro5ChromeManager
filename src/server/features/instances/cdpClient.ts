import http from 'http';
import WebSocket from 'ws';
import { logger } from '../../utils/logger';
import { ManagedCookie } from '../../shared/types';

/**
 * Handles WebSocket and HTTP CDP (Chrome DevTools Protocol) interactions.
 */
export class CDPClient {
  async getPageWebSocketUrl(port: number): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const req = http.get(
        { host: '127.0.0.1', port, path: '/json/list', timeout: 5000 },
        (res) => {
          let data = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            try {
              const targets = JSON.parse(data) as Array<{ type?: string; webSocketDebuggerUrl?: string }>;
              const page = targets.find((target) => target.type === 'page' && typeof target.webSocketDebuggerUrl === 'string');
              resolve(page?.webSocketDebuggerUrl ?? null);
            } catch (err) {
              reject(err);
            }
          });
        },
      );
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy(new Error(`Timed out loading CDP targets from port ${port}`));
      });
    });
  }

  async sendCommandSequence(
    webSocketDebuggerUrl: string,
    commands: Array<{ method: string; params?: Record<string, unknown> }>,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(webSocketDebuggerUrl);
      let nextId = 0;

      socket.once('open', () => {
        for (const command of commands) {
          nextId += 1;
          socket.send(JSON.stringify({
            id: nextId,
            method: command.method,
            params: command.params ?? {},
          }));
        }
      });

      socket.on('message', (payload) => {
        try {
          const message = JSON.parse(payload.toString()) as { id?: number; error?: { message?: string } };
          if (message.error) {
            socket.close();
            reject(new Error(message.error.message ?? 'CDP command failed'));
            return;
          }
          if (message.id === commands.length) {
            socket.close();
            resolve();
          }
        } catch (err) {
          socket.close();
          reject(err);
        }
      });

      socket.once('error', reject);
    });
  }

  async getCurrentUrl(port: number, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error('CDP getCurrentUrl timed out')), timeoutMs);
      const req = http.get(
        { host: '127.0.0.1', port, path: '/json/list', timeout: 5000 },
        (res) => {
          let data = '';
          res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
          res.on('end', () => {
            clearTimeout(deadline);
            try {
              const targets = JSON.parse(data) as Array<{ url: string; type: string }>;
              const page = targets.find((t) => t.type === 'page');
              resolve(page?.url ?? '');
            } catch { resolve(''); }
          });
        },
      );
      req.on('error', () => { clearTimeout(deadline); resolve(''); });
    });
  }

  async ping(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get(
        { host: '127.0.0.1', port, path: '/json/version', timeout: 2000 },
        (res) => { res.resume(); resolve(res.statusCode === 200); },
      );
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
    });
  }

  toCDPCookie(cookie: ManagedCookie): Record<string, unknown> {
    return {
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      ...(cookie.expires ? { expires: cookie.expires } : {}),
      ...(cookie.sameSite ? { sameSite: cookie.sameSite } : {}),
    };
  }
}

export const cdpClient = new CDPClient();

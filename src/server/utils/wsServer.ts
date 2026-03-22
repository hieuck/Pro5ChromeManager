import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage, Server } from 'http';
import { logger } from './logger';

// ─── Event types ──────────────────────────────────────────────────────────────

export type WsEventType =
  | 'instance:started'
  | 'instance:stopped'
  | 'instance:status-changed';

export interface WsEvent {
  type: WsEventType;
  payload: {
    profileId: string;
    status: string;
    port?: number;
  };
}

// ─── WsServer singleton ───────────────────────────────────────────────────────

class WsServer {
  private wss: WebSocketServer | null = null;

  attach(server: Server): void {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      logger.debug('WebSocket client connected', { ip: req.socket.remoteAddress });

      ws.on('close', () => {
        logger.debug('WebSocket client disconnected');
      });

      ws.on('error', (err) => {
        logger.warn('WebSocket client error', { error: err.message });
      });
    });

    logger.info('WebSocket server attached at /ws');
  }

  broadcast(event: WsEvent): void {
    if (!this.wss) return;
    const data = JSON.stringify(event);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  close(): void {
    this.wss?.close();
    this.wss = null;
  }
}

export const wsServer = new WsServer();

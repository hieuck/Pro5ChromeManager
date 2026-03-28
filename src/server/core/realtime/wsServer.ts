import { IncomingMessage, Server } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { logger } from '../logging/logger';

const WEBSOCKET_PATH = '/ws';
const WEBSOCKET_SERVER_ATTACHED_MESSAGE = 'WebSocket server attached at /ws';

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

class WsServer {
  private wss: WebSocketServer | null = null;

  attach(server: Server): void {
    this.wss = new WebSocketServer({ server, path: WEBSOCKET_PATH });

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      logger.debug('WebSocket client connected', { ip: req.socket.remoteAddress });

      ws.on('close', () => {
        logger.debug('WebSocket client disconnected');
      });

      ws.on('error', (err) => {
        logger.warn('WebSocket client error', { error: err.message });
      });
    });

    logger.info(WEBSOCKET_SERVER_ATTACHED_MESSAGE);
  }

  broadcast(event: WsEvent): void {
    if (!this.wss) {
      return;
    }

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

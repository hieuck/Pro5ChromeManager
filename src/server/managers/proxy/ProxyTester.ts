import http from 'http';
import https from 'https';
import * as ProxyChain from 'proxy-chain';
import { ProxyConfig } from '../../shared/types';
import { logger } from '../../utils/logger';

/**
 * Handles proxy connectivity testing and IP/Timezone detection.
 */
export class ProxyTester {
  async testProxy(proxy: ProxyConfig): Promise<string> {
    const isSocks = proxy.type === 'socks4' || proxy.type === 'socks5';

    if (isSocks) {
      const proxyUrl = this.buildProxyUrl(proxy);
      const localProxyUrl = await ProxyChain.anonymizeProxy(proxyUrl);
      try {
        const localParsed = new URL(localProxyUrl);
        const localPort = parseInt(localParsed.port, 10);
        const httpProxy: ProxyConfig = {
          id: proxy.id,
          type: 'http',
          host: '127.0.0.1',
          port: localPort,
        };
        const body = await this.httpGetViaProxy('https://api.ipify.org?format=json', httpProxy, 10000);
        const parsed = JSON.parse(body) as { ip: string };
        return parsed.ip;
      } finally {
        await ProxyChain.closeAnonymizedProxy(localProxyUrl, true).catch(() => undefined);
      }
    } else {
      const body = await this.httpGetViaProxy('https://api.ipify.org?format=json', proxy, 10000);
      const parsed = JSON.parse(body) as { ip: string };
      return parsed.ip;
    }
  }

  async detectTimezone(ip: string): Promise<string> {
    const body = await this.httpGet(`https://ipapi.co/${ip}/timezone`, 5000);
    return body.trim();
  }

  private async httpGet(url: string, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const mod = url.startsWith('https') ? https : http;
      const req = mod.get(url, { timeout: timeoutMs }, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    });
  }

  private async httpGetViaProxy(targetUrl: string, proxy: ProxyConfig, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(targetUrl);
      const isHttps = parsed.protocol === 'https:';

      if (isHttps) {
        const connectOptions: http.RequestOptions = {
          host: proxy.host,
          port: proxy.port,
          method: 'CONNECT',
          path: `${parsed.hostname}:443`,
          timeout: timeoutMs,
        };
        if (proxy.username) {
          const auth = Buffer.from(`${proxy.username}:${proxy.password ?? ''}`).toString('base64');
          connectOptions.headers = { 'Proxy-Authorization': `Basic ${auth}` };
        }

        const connectReq = http.request(connectOptions);
        connectReq.on('connect', (_res, socket) => {
          const tlsOptions = { socket, servername: parsed.hostname };
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const tls = require('tls') as typeof import('tls');
          const tlsSocket = tls.connect(tlsOptions, () => {
            const getReq = `GET ${parsed.pathname}${parsed.search} HTTP/1.1\r\nHost: ${parsed.hostname}\r\nConnection: close\r\n\r\n`;
            tlsSocket.write(getReq);
            let data = '';
            tlsSocket.on('data', (chunk: Buffer) => { data += chunk.toString(); });
            tlsSocket.on('end', () => {
              const body = data.split('\r\n\r\n').slice(1).join('\r\n\r\n');
              resolve(body);
            });
            tlsSocket.on('error', reject);
          });
          tlsSocket.on('error', reject);
        });
        connectReq.on('error', reject);
        connectReq.on('timeout', () => { connectReq.destroy(); reject(new Error('Proxy connect timed out')); });
        connectReq.end();
      } else {
        const options: http.RequestOptions = {
          host: proxy.host,
          port: proxy.port,
          path: targetUrl,
          timeout: timeoutMs,
          headers: { Host: parsed.hostname },
        };
        if (proxy.username) {
          const auth = Buffer.from(`${proxy.username}:${proxy.password ?? ''}`).toString('base64');
          options.headers = { ...options.headers, 'Proxy-Authorization': `Basic ${auth}` };
        }
        const req = http.get(options, (res) => {
          let data = '';
          res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
          res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
      }
    });
  }

  private buildProxyUrl(proxy: ProxyConfig): string {
    const auth = proxy.username
      ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password ?? '')}@`
      : '';
    return `${proxy.type}://${auth}${proxy.host}:${proxy.port}`;
  }
}

export const proxyTester = new ProxyTester();

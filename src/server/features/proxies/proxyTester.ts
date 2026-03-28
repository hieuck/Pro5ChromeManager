import http from 'http';
import https from 'https';
import * as tls from 'tls';
import * as ProxyChain from 'proxy-chain';
import { ProxyConfig } from '../../../shared/contracts';

const LOOPBACK_HOST = '127.0.0.1';
const IP_LOOKUP_URL = 'https://api.ipify.org?format=json';
const TIMEZONE_LOOKUP_URL_TEMPLATE = 'https://ipapi.co/{ip}/timezone';
const HTTPS_DEFAULT_PORT = 443;
const PROXY_AUTH_HEADER = 'Proxy-Authorization';
const REQUEST_TIMEOUT_MESSAGE = 'Request timed out';
const PROXY_CONNECT_TIMEOUT_MESSAGE = 'Proxy connect timed out';
const PROXY_TEST_TIMEOUT_MS = 10_000;
const TIMEZONE_LOOKUP_TIMEOUT_MS = 5_000;

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
          host: LOOPBACK_HOST,
          port: localPort,
        };
        const body = await this.httpGetViaProxy(IP_LOOKUP_URL, httpProxy, PROXY_TEST_TIMEOUT_MS);
        const parsed = JSON.parse(body) as { ip: string };
        return parsed.ip;
      } finally {
        await ProxyChain.closeAnonymizedProxy(localProxyUrl, true).catch(() => undefined);
      }
    } else {
      const body = await this.httpGetViaProxy(IP_LOOKUP_URL, proxy, PROXY_TEST_TIMEOUT_MS);
      const parsed = JSON.parse(body) as { ip: string };
      return parsed.ip;
    }
  }

  async detectTimezone(ip: string): Promise<string> {
    const url = TIMEZONE_LOOKUP_URL_TEMPLATE.replace('{ip}', ip);
    const body = await this.httpGet(url, TIMEZONE_LOOKUP_TIMEOUT_MS);
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
      req.on('timeout', () => { req.destroy(); reject(new Error(REQUEST_TIMEOUT_MESSAGE)); });
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
          path: `${parsed.hostname}:${HTTPS_DEFAULT_PORT}`,
          timeout: timeoutMs,
        };
        if (proxy.username) {
          const auth = Buffer.from(`${proxy.username}:${proxy.password ?? ''}`).toString('base64');
          connectOptions.headers = { [PROXY_AUTH_HEADER]: `Basic ${auth}` };
        }

        const connectReq = http.request(connectOptions);
        connectReq.on('connect', (_res, socket) => {
          const tlsOptions = { socket, servername: parsed.hostname };
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
        connectReq.on('timeout', () => { connectReq.destroy(); reject(new Error(PROXY_CONNECT_TIMEOUT_MESSAGE)); });
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
          options.headers = { ...options.headers, [PROXY_AUTH_HEADER]: `Basic ${auth}` };
        }
        const req = http.get(options, (res) => {
          let data = '';
          res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
          res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error(REQUEST_TIMEOUT_MESSAGE)); });
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

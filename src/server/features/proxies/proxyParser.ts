import { ProxyConfig } from '../../../shared/contracts';

/**
 * Handles detection and normalization of proxy input strings.
 */
export class ProxyParser {
  parseInput(input: string, defaultType: ProxyConfig['type'] = 'http'): Array<Omit<ProxyConfig, 'id'>> {
    const lines = input
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#') && !line.startsWith('//'));

    return lines.map((line) => this.parseLine(line, defaultType));
  }

  parseLine(line: string, defaultType: ProxyConfig['type']): Omit<ProxyConfig, 'id'> {
    if (line.includes('://')) {
      const parsed = new URL(line);
      const type = parsed.protocol.replace(':', '') as ProxyConfig['type'];
      if (!['http', 'https', 'socks4', 'socks5'].includes(type)) {
        throw new Error(`Unsupported proxy protocol: ${type}`);
      }

      const port = Number(parsed.port);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`Invalid proxy port in line: ${line}`);
      }

      return {
        type,
        host: parsed.hostname,
        port,
        username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
        password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
      };
    }

    const parts = line.split(':');
    if (parts.length === 2 || parts.length === 4) {
      const [host, rawPort, username, password] = parts;
      const port = Number(rawPort);
      if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`Invalid proxy line: ${line}`);
      }

      return {
        type: defaultType,
        host,
        port,
        username,
        password,
      };
    }

    throw new Error(`Unsupported proxy format: ${line}`);
  }
}

export const proxyParser = new ProxyParser();

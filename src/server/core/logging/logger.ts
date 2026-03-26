import fs from 'fs';
import os from 'os';
import path from 'path';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { dataPath } from '../fs/dataPaths';

export function resolveLogDir(): string {
  if (process.env['NODE_ENV'] === 'test' && !process.env['DATA_DIR']) {
    return path.join(os.tmpdir(), 'pro5-test-logs', `pid-${process.pid}`);
  }

  return dataPath('logs');
}

const LOG_DIR = resolveLogDir();
const isDev = process.env.NODE_ENV !== 'production';

fs.mkdirSync(LOG_DIR, { recursive: true });

const fileTransport = new DailyRotateFile({
  dirname: LOG_DIR,
  filename: 'app-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '10m',
  maxFiles: '5',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
});

const exceptionTransport = new DailyRotateFile({
  dirname: LOG_DIR,
  filename: 'exceptions-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '10m',
  maxFiles: '7',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
});

const rejectionTransport = new DailyRotateFile({
  dirname: LOG_DIR,
  filename: 'rejections-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '10m',
  maxFiles: '7',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
});

const consoleTransport = new winston.transports.Console({
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
      return `[${timestamp}] ${level}: ${message}${metaStr}`;
    })
  ),
});

export const logger = winston.createLogger({
  level: isDev ? 'debug' : 'info',
  transports: [
    fileTransport,
    ...(isDev ? [consoleTransport] : []),
  ],
  exceptionHandlers: [
    exceptionTransport,
    ...(isDev ? [consoleTransport] : []),
  ],
  rejectionHandlers: [
    rejectionTransport,
    ...(isDev ? [consoleTransport] : []),
  ],
});

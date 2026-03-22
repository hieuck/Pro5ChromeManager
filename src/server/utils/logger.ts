import path from 'path';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const LOG_DIR = path.resolve('data/logs');
const isDev = process.env.NODE_ENV !== 'production';

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
});

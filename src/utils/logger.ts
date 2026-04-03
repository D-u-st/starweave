import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';

const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
    return `${timestamp} [${level.toUpperCase()}]: ${message} ${metaStr}`;
  })
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message }) => {
    return `${timestamp} ${level}: ${message}`;
  })
);

const fileRotateTransport = new DailyRotateFile({
  filename: path.join(logDir, 'bot-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: process.env.LOG_MAX_SIZE || '10m',
  maxFiles: process.env.LOG_MAX_FILES || '5',
  format: logFormat
});

const errorFileTransport = new DailyRotateFile({
  filename: path.join(logDir, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '10m',
  maxFiles: '5',
  level: 'error',
  format: logFormat
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    fileRotateTransport,
    errorFileTransport,
    new winston.transports.Console({
      format: consoleFormat
    })
  ]
});

logger.on('error', (error) => {
  console.error('Logger error:', error);
});

export function logSessionActivity(sessionId: string, action: string, details?: any): void {
  logger.info(`Session ${sessionId}: ${action}`, details);
}

export function logError(context: string, error: any): void {
  logger.error(`${context}:`, {
    message: error.message,
    stack: error.stack,
    ...error
  });
}

export function logMetric(metric: string, value: number, tags?: Record<string, string>): void {
  logger.info('Metric', { metric, value, tags });
}

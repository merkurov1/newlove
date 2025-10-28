// lib/logger.ts
import pino from 'pino';

// Create logger instance with appropriate configuration
const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  browser: {
    asObject: true,
  },
  ...(process.env.NODE_ENV !== 'production' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  }),
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    env: process.env.NODE_ENV,
  },
});

// Helper functions for common logging patterns
export const log = {
  info: (msg: string, data?: any) => logger.info(data, msg),
  error: (msg: string, error?: any) => {
    if (error instanceof Error) {
      logger.error({ err: error, stack: error.stack }, msg);
    } else {
      logger.error(error, msg);
    }
  },
  warn: (msg: string, data?: any) => logger.warn(data, msg),
  debug: (msg: string, data?: any) => logger.debug(data, msg),
  trace: (msg: string, data?: any) => logger.trace(data, msg),
};

// API request logger
export function logApiRequest(
  method: string,
  path: string,
  statusCode: number,
  duration: number,
  userId?: string
) {
  logger.info({
    type: 'api_request',
    method,
    path,
    statusCode,
    duration,
    userId,
  }, `${method} ${path} ${statusCode} ${duration}ms`);
}

// Database query logger
export function logDbQuery(
  query: string,
  duration: number,
  error?: Error
) {
  if (error) {
    logger.error({
      type: 'db_query',
      query,
      duration,
      err: error,
    }, 'Database query failed');
  } else {
    logger.debug({
      type: 'db_query',
      query,
      duration,
    }, 'Database query executed');
  }
}

// Security event logger
export function logSecurityEvent(
  event: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  details?: any
) {
  logger.warn({
    type: 'security_event',
    event,
    severity,
    ...details,
  }, `Security event: ${event}`);
}

export default logger;

// lib/middleware/apiLogger.ts
import { NextRequest, NextResponse } from 'next/server';
import { logApiRequest } from '@/lib/logger';

export function withApiLogger(handler: Function) {
  return async (req: NextRequest, ...args: any[]) => {
    const startTime = Date.now();
    const method = req.method;
    const path = req.nextUrl.pathname;

    try {
      const response = await handler(req, ...args);
      const duration = Date.now() - startTime;
      const statusCode = response?.status || 200;

      logApiRequest(method, path, statusCode, duration);

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      logApiRequest(method, path, 500, duration);
      throw error;
    }
  };
}

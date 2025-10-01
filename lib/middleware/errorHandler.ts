import { NextRequest, NextResponse } from 'next/server';

export function handleApiError(fn: Function) {
  return async (req: NextRequest, ...args: any[]) => {
    try {
      return await fn(req, ...args);
    } catch (err: any) {
      console.error('API Error:', err);
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
  };
}

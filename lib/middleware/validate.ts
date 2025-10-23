import { NextRequest, NextResponse } from 'next/server';
import { ZodSchema } from 'zod';

export function withValidation(schema: ZodSchema, handler: Function) {
  return async (req: NextRequest, ...args: any[]) => {
    let data;
    try {
      data = await req.json();
    } catch (e) {
      console.error('Ошибка парсинга JSON:', e);
      return NextResponse.json({ error: 'Invalid JSON: ' + (e instanceof Error ? e.message : String(e)) }, { status: 400 });
    }
    const result = schema.safeParse(data);
    if (!result.success) {
      console.error('Ошибка валидации:', result.error, 'Данные:', data);
      return NextResponse.json({ error: 'Validation failed', details: result.error.issues }, { status: 400 });
    }
    return handler(req, result.data, ...args);
  };
}

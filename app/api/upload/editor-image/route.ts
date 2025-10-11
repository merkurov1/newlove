export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';

// Vercel не поддерживает запись в /public, используем временную папку
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

// На Vercel используем /tmp, локально - /public/uploads
const UPLOAD_DIR = process.env.VERCEL 
  ? '/tmp/uploads' 
  : path.join(process.cwd(), 'public', 'uploads');

export async function POST(req: NextRequest) {
  console.log('🚀 API /upload/editor-image: Начинаю обработку запроса');
  console.log('🔧 Среда выполнения:', {
    vercel: !!process.env.VERCEL,
    uploadDir: UPLOAD_DIR,
    platform: os.platform()
  });
  
  try {
    // Проверка аутентификации
    const session = await getServerSession(authOptions);
    console.log('👤 Сессия пользователя:', {
      exists: !!session,
      userId: session?.user?.id,
      role: (session?.user as any)?.role,
      email: session?.user?.email
    });
  
    if (!session?.user || (session.user as any).role !== 'ADMIN') {
      console.log('🚫 Отказано в доступе: пользователь не является администратором');
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('image') as File;
    if (process.env.NODE_ENV === 'development') {
      console.log('📁 Получен файл:', {
        name: file?.name,
        type: file?.type,
        size: file?.size
      });
    }
    
    if (!file) {
      if (process.env.NODE_ENV === 'development') {
        console.log('❌ Файл не найден в запросе');
      }
      return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });
    }

    // Валидация типа файла
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      if (process.env.NODE_ENV === 'development') {
        console.log('❌ Неподдерживаемый тип файла:', file.type);
      }
      return NextResponse.json({ success: false, error: 'Invalid file type' }, { status: 400 });
    }

    // Ограничение размера файла (5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      console.log('❌ Файл слишком большой:', file.size, 'байт');
      return NextResponse.json({ success: false, error: 'File too large' }, { status: 400 });
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const filename = `${Date.now()}-${file.name}`.replace(/\s+/g, '-');
      
      console.log('📂 Создаю директорию:', UPLOAD_DIR);
      await fs.mkdir(UPLOAD_DIR, { recursive: true });
      
      const filePath = path.join(UPLOAD_DIR, filename);
      console.log('💾 Сохраняю файл в:', filePath);
      
      await fs.writeFile(filePath, buffer);
      
      // На Vercel файлы нужно возвращать как base64 или использовать внешнее хранилище
      let url: string;
      if (process.env.VERCEL) {
        // На Vercel возвращаем base64 URL (временное решение)
        const base64 = buffer.toString('base64');
        url = `data:${file.type};base64,${base64}`;
        console.log('🔗 Vercel: возвращаю base64 URL (размер:', base64.length, 'символов)');
      } else {
        url = `/uploads/${filename}`;
        console.log('🔗 Локально: возвращаю файловый URL:', url);
      }

      console.log('✅ Файл успешно обработан:', {
        filename,
        size: file.size,
        urlType: process.env.VERCEL ? 'base64' : 'file'
      });

      return NextResponse.json({
        success: true,
        file: {
          url: url,
          name: filename,
          size: file.size,
          type: file.type
        }
      });
    } catch (error) {
      console.error('💥 Ошибка при сохранении файла:', error);
      console.error('📋 Детали ошибки:', {
        name: (error as Error).name,
        message: (error as Error).message,
        stack: (error as Error).stack?.split('\n').slice(0, 3)
      });
      return NextResponse.json({ 
        success: false, 
        error: `Failed to save file: ${(error as Error).message}` 
      }, { status: 500 });
    }
  } catch (error) {
    console.error('💥 Критическая ошибка в API:', error);
    return NextResponse.json({ 
      success: false, 
      error: `Internal server error: ${(error as Error).message}` 
    }, { status: 500 });
  }
}
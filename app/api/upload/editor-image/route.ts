import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';

// Пример: сохраняет файл в /public/uploads (или интегрируйте с Supabase Storage/S3)
import path from 'path';
import fs from 'fs/promises';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');

export async function POST(req: NextRequest) {
  console.log('🚀 API /upload/editor-image: Начинаю обработку запроса');
  
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
  console.log('📁 Получен файл:', {
    name: file?.name,
    type: file?.type,
    size: file?.size
  });
  
  if (!file) {
    console.log('❌ Файл не найден в запросе');
    return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });
  }

  // Валидация типа файла
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    console.log('❌ Неподдерживаемый тип файла:', file.type);
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
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const filePath = path.join(UPLOAD_DIR, filename);
    await fs.writeFile(filePath, buffer);
    const url = `/uploads/${filename}`;

    console.log('✅ Файл успешно сохранен:', {
      filename,
      url,
      size: file.size
    });

    // Возвращаем формат, ожидаемый useImageUpload
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
    return NextResponse.json({ success: false, error: 'Failed to save file' }, { status: 500 });
  }
  } catch (error) {
    console.error('💥 Критическая ошибка в API:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
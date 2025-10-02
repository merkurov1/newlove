// app/api/media/delete/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { createClient } from '@supabase/supabase-js';

// Создаем Supabase клиент с service role для админских операций
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export async function DELETE(req: NextRequest) {
  try {
    // Проверка авторизации
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Получаем данные из body запроса
    const { fileName, fileNames } = await req.json();

    if (!fileName && !fileNames) {
      return NextResponse.json({ error: 'Не указаны файлы для удаления' }, { status: 400 });
    }

    // Определяем какие файлы удалять
    const filesToDelete = fileName ? [fileName] : fileNames;

    if (!Array.isArray(filesToDelete) || filesToDelete.length === 0) {
      return NextResponse.json({ error: 'Неверный формат данных' }, { status: 400 });
    }

    // Удаляем файлы из Supabase Storage
    const { data, error } = await supabaseAdmin.storage
      .from('media')
      .remove(filesToDelete);

    if (error) {
      console.error('Supabase storage error:', error);
      return NextResponse.json({ 
        error: 'Ошибка при удалении файлов', 
        details: error.message 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: `Удалено файлов: ${filesToDelete.length}`,
      deletedFiles: filesToDelete
    });

  } catch (error) {
    console.error('Error in delete media API:', error);
    return NextResponse.json({ 
      error: 'Внутренняя ошибка сервера' 
    }, { status: 500 });
  }
}
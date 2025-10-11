export const dynamic = 'force-dynamic';
// app/api/media/route.ts
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

export async function GET(req: NextRequest) {
  try {
    // Проверка авторизации
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Получаем список файлов из Supabase Storage
    const { data: files, error } = await supabaseAdmin.storage
      .from('media')
      .list('', {
        limit: 1000,
        offset: 0,
        sortBy: { column: 'created_at', order: 'desc' }
      });

    if (error) {
      console.error('Supabase storage list error:', error);
      return NextResponse.json({ 
        error: 'Ошибка при получении списка файлов', 
        details: error.message 
      }, { status: 500 });
    }

    // Формируем данные для клиента
    const formattedFiles = files.map(file => {
      const { data: publicUrlData } = supabaseAdmin.storage
        .from('media')
        .getPublicUrl(file.name);

      return {
        name: file.name,
        publicUrl: publicUrlData.publicUrl,
        metadata: file.metadata,
        created_at: file.created_at,
        updated_at: file.updated_at,
        size: file.metadata?.size
      };
    });

    return NextResponse.json({ 
      files: formattedFiles,
      count: formattedFiles.length
    });

  } catch (error) {
    console.error('Error in media API:', error);
    return NextResponse.json({ 
      error: 'Внутренняя ошибка сервера' 
    }, { status: 500 });
  }
}
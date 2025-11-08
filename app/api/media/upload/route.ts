// @ts-nocheck
export const dynamic = 'force-dynamic';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';

// Создаем клиент с service role для админских операций — ленивая инициализация чтобы избежать ошибок сборки
let supabaseAdmin: any = null;
function getSupabaseAdmin() {
  if (!supabaseAdmin) {
    supabaseAdmin = getServerSupabaseClient({ useServiceRole: true });
  }
  return supabaseAdmin;
}

export async function POST(request: Request) {
  try {
    // Проверяем аутентификацию через Supabase
    try {
      await requireAdminFromRequest(request as Request);
    } catch (e) {
      return NextResponse.json({ error: 'Доступ запрещен' }, { status: 403 });
    }

    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'Файлы не предоставлены' },
        { status: 400 }
      );
    }

  const uploadResults: any[] = [];

    for (const file of files) {
      if (!file.name) {
        uploadResults.push({
          fileName: 'unknown',
          success: false,
          error: 'Имя файла не указано'
        });
        continue;
      }

      try {
        // Конвертируем File в ArrayBuffer для Supabase
        const arrayBuffer = await file.arrayBuffer();
        const fileBuffer = new Uint8Array(arrayBuffer);

        // Загружаем файл в Supabase Storage
        const { data, error } = await getSupabaseAdmin().storage
          .from('media')
          .upload(file.name, fileBuffer, {
            contentType: file.type,
            upsert: true
          });

        if (error) {
          uploadResults.push({
            fileName: file.name,
            success: false,
            error: error.message
          });
        } else {
          uploadResults.push({
            fileName: file.name,
            success: true,
            path: data.path
          });
        }
      } catch (error) {
        uploadResults.push({
          fileName: file.name,
          success: false,
          error: error instanceof Error ? error.message : 'Неизвестная ошибка'
        });
      }
    }

    const successCount = uploadResults.filter(result => result.success).length;
    const errorCount = uploadResults.length - successCount;

    return NextResponse.json({
      message: `Загружено: ${successCount}, ошибок: ${errorCount}`,
      results: uploadResults,
      success: errorCount === 0
    });

  } catch (error) {
    console.error('Ошибка при загрузке файлов:', error);
    return NextResponse.json(
      { error: 'Внутренняя ошибка сервера' },
      { status: 500 }
    );
  }
}
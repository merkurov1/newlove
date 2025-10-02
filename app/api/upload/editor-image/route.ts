import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export async function POST(req: NextRequest) {
  try {
    // Проверка аутентификации - только администраторы
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ 
        success: false, 
        error: 'Unauthorized' 
      }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('image') as File;
    
    if (!file) {
      return NextResponse.json({ 
        success: false, 
        error: 'No file uploaded' 
      }, { status: 400 });
    }

    // Валидация типа файла
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid file type. Only JPEG, PNG, GIF and WebP are allowed.' 
      }, { status: 400 });
    }

    // Ограничение размера файла (5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ 
        success: false, 
        error: 'File too large. Maximum size is 5MB.' 
      }, { status: 400 });
    }

    // Загрузка в Supabase Storage
    const supabase = createClientComponentClient();
    const fileName = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
    
    const { data, error } = await supabase.storage
      .from('media')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Supabase upload error:', error);
      }
      return NextResponse.json({ 
        success: false, 
        error: 'Upload failed' 
      }, { status: 500 });
    }

    // Получаем публичный URL
    const { data: publicUrlData } = supabase.storage
      .from('media')
      .getPublicUrl(fileName);

    return NextResponse.json({
      success: true,
      file: {
        url: publicUrlData.publicUrl,
        name: fileName,
        size: file.size,
        type: file.type
      }
    });

  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Editor image upload error:', error);
    }
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}
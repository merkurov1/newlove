
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authOptions } from '@/lib/authOptions';


export async function POST(req, res) {


  const session = await getServerSession(authOptions);
  if (!session || !session.supabaseAccessToken) {
    return NextResponse.json({ success: 0, error: 'Not authenticated' }, { status: 401 });
  }

  // Создаём supabase client с авторизацией пользователя
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: {
        headers: {
          Authorization: `Bearer ${session.supabaseAccessToken}`,
        },
      },
    }
  );

  const formData = await req.formData();
  const file = formData.get('image');
  if (!file) {
    return NextResponse.json({ success: 0, error: 'No file uploaded' }, { status: 400 });
  }

  const fileName = `${Date.now()}-${file.name}`;
  const { data, error } = await supabase.storage.from('media').upload(fileName, file);
  if (error) {
    return NextResponse.json({ success: 0, error: error.message }, { status: 500 });
  }


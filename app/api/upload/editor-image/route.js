
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authOptions } from '@/lib/authOptions';
import rateLimit from 'express-rate-limit';
// Simple in-memory rate limiter for Next.js API route
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 минута
  max: 10, // максимум 10 загрузок в минуту с одного IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return NextResponse.json({ error: 'Too many uploads, please try again later.' }, { status: 429 });
  },
});


export async function POST(req, res) {
  // Rate limit check
  // @ts-ignore
  await new Promise((resolve, reject) => limiter(req, res, (result) => result instanceof Error ? reject(result) : resolve(result)));

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
  const { data: urlData } = supabase.storage.from('media').getPublicUrl(fileName);
  return NextResponse.json({ success: 1, file: { url: urlData.publicUrl } });
}

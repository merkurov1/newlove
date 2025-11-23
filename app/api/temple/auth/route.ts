import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  console.log("API: /api/temple/auth hit");

  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sbServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!sbUrl || !sbServiceKey) {
    console.error("API Error: Missing Supabase Env Vars");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const supabaseAdmin = createClient(sbUrl, sbServiceKey, {
    auth: { persistSession: false }
  });

  try {
    const body = await req.json();
    console.log("API: Received body:", body);

    const { id, username, first_name, last_name, language_code } = body;

    if (!id) {
      console.error("API: No ID in body");
      return NextResponse.json({ error: "No ID provided" }, { status: 400 });
    }

    // Upsert в таблицу temple_users
    const { data, error } = await supabaseAdmin
      .from('temple_users')
      .upsert({
        telegram_id: id,
        username: username || '',
        first_name: first_name || '',
        // last_name: last_name || '', // Раскомментируй, если есть в базе
        // language_code: language_code || '', // Раскомментируй, если есть в базе
        last_seen_at: new Date().toISOString()
      }, { onConflict: 'telegram_id' })
      .select();

    if (error) {
      console.error("API: Supabase Insert Error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log("API: Success writing user:", id);
    
    // Логируем в temple_log от имени системы
    await supabaseAdmin.from('temple_log').insert({
      event_type: 'enter',
      message: `User ${id} (${username}) entered`
    });

    return NextResponse.json({ success: true, userId: id });

  } catch (e: any) {
    console.error("API: Critical Error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
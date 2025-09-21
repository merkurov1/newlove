// app/api/articles/route.js
import { createClient } from '../../lib/supabase-server.js'; // Исправленный путь с .js

export async function GET(request) {
  const supabaseClient = createClient();
  const { data, error } = await supabaseClient
    .from('articles')
    .select('id, title, created_at, content, slug')
    .order('created_at', { ascending: false });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
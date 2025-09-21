// app/articles/route.js
import { createClient } from '@/lib/supabase-server'; // Убедитесь, что импорт правильный

export async function GET(_request) { // <-- Исправление здесь
  const supabaseClient = createClient();
  // Этот код может отличаться, но исправление для GET то же самое
  const { data, error } = await supabaseClient
    .from('articles')
    .select('id, title, slug')
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

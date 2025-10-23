export const dynamic = 'force-dynamic';
// app/api/messages/route.ts
import { requireUser } from '@/lib/serverAuth';
import { NextResponse } from 'next/server';


export async function POST(req: Request) {
  // Получаем текущего пользователя через Supabase
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const { content } = await req.json();

  if (!content) {
    return new NextResponse('Missing content', { status: 400 });
  }

  // TODO: Replace with Supabase insert or other storage
  // Example: const { data: message, error } = await supabase.from('messages').insert([{ content, user_id: user.id }]).select().single();
  // For now, return a mock message
  const message = { id: 'mock', content, userId: user.id, createdAt: new Date().toISOString() };
  return NextResponse.json(message);
}

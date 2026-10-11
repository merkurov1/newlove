import { NextResponse } from 'next/server';
import { getServerSupabaseClient } from '@/lib/serverAuth';

// POST: Создание задачи
export async function POST(request: Request) {
  try {
    const supabase = getServerSupabaseClient({ useServiceRole: true });
    const body = await request.json();

    const { data, error } = await supabase
      .from('todos') // Проверьте точное название таблицы (todos или todo)
      .insert([body])
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH: Обновление статуса
export async function PATCH(request: Request) {
  try {
    const supabase = getServerSupabaseClient({ useServiceRole: true });
    const { id, ...updates } = await request.json();

    const { data, error } = await supabase
      .from('todos')
      .update(updates)
      .eq('id', id)
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE: Удаление задачи
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
    }

    const supabase = getServerSupabaseClient({ useServiceRole: true });
    const { error } = await supabase.from('todos').delete().eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

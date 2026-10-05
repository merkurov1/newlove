export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminFromRequest, requireUser, getServerSupabaseClient } from '@/lib/serverAuth';
import { attachTagsToArticles } from '@/lib/attachTagsToArticles';

// GET - Получить проект по ID (для админки)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getServerSupabaseClient({ useServiceRole: true });
    
    // Только админы могут получать любые проекты (включая неопубликованные)
    try {
      await requireAdminFromRequest(request as Request);
      
      // Fetch project by id (any status) from Supabase
      const { data: project, error } = await supabase
        .from('projects')
        .select('*, author:authorId(name,email)')
        .eq('id', params.id)
        .maybeSingle();
      
      if (error) {
        console.error('Supabase error fetching project:', error);
        return NextResponse.json({ error: 'Ошибка загрузки проекта' }, { status: 500 });
      }
      
      if (!project) {
        return NextResponse.json({ error: 'Проект не найден' }, { status: 404 });
      }
      
      // Attach tags
      const projectsWithTags = await attachTagsToArticles(supabase, [project]);
      return NextResponse.json(projectsWithTags[0] || project);
      
    } catch {
      // Обычные пользователи видят только опубликованные проекты
      const { data: project, error } = await supabase
        .from('projects')
        .select('*, author:authorId(name,email)')
        .eq('id', params.id)
        .eq('published', true)
        .maybeSingle();
      
      if (error || !project) {
        return NextResponse.json({ error: 'Проект не найден' }, { status: 404 });
      }
      
      // Attach tags
      const projectsWithTags = await attachTagsToArticles(supabase, [project]);
      return NextResponse.json(projectsWithTags[0] || project);
    }
    
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Ошибка при получении проекта:', error);
    }
    return NextResponse.json({ error: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}

// PUT - Обновить проект (только для админов)
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    try {
      await requireAdminFromRequest(request as Request);
    } catch {
      return NextResponse.json({ error: 'Доступ запрещен' }, { status: 403 });
    }

    const data = await request.json();
    const { title, slug, content, published, tags } = data;

    // Валидация данных
    if (!title || !slug || !content) {
      return NextResponse.json({ error: 'Обязательные поля: title, slug, content' }, { status: 400 });
    }

    // Проверяем, что content - это валидная структура блоков
    let validatedContent = content;
    if (typeof content === 'string') {
      try {
        validatedContent = JSON.parse(content);
      } catch {
        return NextResponse.json({ error: 'content должен быть валидным JSON массивом блоков' }, { status: 400 });
      }
    }

    if (!Array.isArray(validatedContent)) {
      return NextResponse.json({ error: 'content должен быть массивом блоков' }, { status: 400 });
    }

    const { data: project, error } = await getServerSupabaseClient({ useServiceRole: true })
      .from('projects')
      .update({ title, slug, content: JSON.stringify(validatedContent), published: Boolean(published), publishedAt: published ? new Date().toISOString() : null })
      .eq('id', params.id)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    return NextResponse.json(project);

  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Ошибка при обновлении проекта:', error);
    }
    return NextResponse.json({ error: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}

// DELETE - Удалить проект (только для админов)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    try {
      await requireAdminFromRequest(request as Request);
    } catch {
      return NextResponse.json({ error: 'Доступ запрещен' }, { status: 403 });
    }

    const { error } = await getServerSupabaseClient({ useServiceRole: true })
      .from('projects').delete().eq('id', params.id);
    if (error) throw error;
    return NextResponse.json({ message: 'Project deleted' });

  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Ошибка при удалении проекта:', error);
    }
    return NextResponse.json({ error: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}

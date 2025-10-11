export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';

// GET - Получить проект по ID (для админки)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    // Только админы могут получать любые проекты (включая неопубликованные)
    if (session?.user?.role === 'ADMIN') {
      const project = await prisma.project.findUnique({
        where: { id: params.id },
        include: { author: { select: { name: true, image: true } }, tags: true }
      });
      
      if (!project) {
        return NextResponse.json({ error: 'Проект не найден' }, { status: 404 });
      }
      
      return NextResponse.json(project);
    }
    
    // Обычные пользователи видят только опубликованные проекты
    const project = await prisma.project.findUnique({
      where: { 
        id: params.id,
        published: true 
      },
      include: { author: { select: { name: true, image: true } }, tags: true }
    });
    
    if (!project) {
      return NextResponse.json({ error: 'Проект не найден' }, { status: 404 });
    }
    
    return NextResponse.json(project);
    
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
    const session = await getServerSession(authOptions);
    
    if (!session?.user || session.user.role !== 'ADMIN') {
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

    const project = await prisma.project.update({
      where: { id: params.id },
      data: {
        title,
        slug,
        content: validatedContent,
        published: published || false,
        publishedAt: published ? new Date() : null,
      },
      include: { author: { select: { name: true, image: true } }, tags: true }
    });

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
    const session = await getServerSession(authOptions);
    
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Доступ запрещен' }, { status: 403 });
    }

    await prisma.project.delete({
      where: { id: params.id }
    });

    return NextResponse.json({ message: 'Проект успешно удален' });

  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Ошибка при удалении проекта:', error);
    }
    return NextResponse.json({ error: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}
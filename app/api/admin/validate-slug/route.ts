import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import prisma from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    // Проверка аутентификации - только для администраторов
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const slug = searchParams.get('slug');
    const type = searchParams.get('type') || 'letter'; // letter, article, project
    const excludeId = searchParams.get('excludeId'); // Исключить определенный ID при проверке

    if (!slug) {
      return NextResponse.json({ error: 'Slug is required' }, { status: 400 });
    }

    let exists = false;

    // Проверяем в зависимости от типа контента
    switch (type) {
      case 'letter':
        const letter = await prisma.letter.findUnique({
          where: { slug }
        });
        exists = letter !== null && letter.id !== excludeId;
        break;

      case 'article':
        const article = await prisma.article.findUnique({
          where: { slug }
        });
        exists = article !== null && article.id !== excludeId;
        break;

      case 'project':
        const project = await prisma.project.findUnique({
          where: { slug }
        });
        exists = project !== null && project.id !== excludeId;
        break;

      default:
        return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    return NextResponse.json({ 
      exists,
      available: !exists 
    });

  } catch (error) {
    console.error('Slug validation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
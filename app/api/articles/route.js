// app/api/articles/route.js
import prisma from '@/lib/prisma';

export async function GET(_request) {
  try {
    const articles = await prisma.article.findMany({
      where: { published: true },
      select: {
        id: true,
        title: true,
        slug: true,
        content: true,
        publishedAt: true,
      },
      orderBy: { publishedAt: 'desc' },
    });

    return new Response(JSON.stringify(articles), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to fetch articles' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Эта функция будет вызываться по GET запросу на /api/articles/[id]
export async function GET(request, { params }) {
  try {
    const articleId = params.id;
    const article = await prisma.article.findUnique({
      where: { id: articleId },
    });

    if (!article) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    }

    return NextResponse.json(article);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error("Error fetching article:", error);
    }
    return new Response(JSON.stringify({ error: "Article not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
}


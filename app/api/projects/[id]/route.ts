
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// ВАЖНО: authorId должен быть передан с фронта или получен из сессии (упрощённо — из тела запроса)

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(project);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const data = await req.json();
  const { title, slug, content, authorId, published = false } = data;
  if (!title || !slug || !authorId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  const project = await prisma.project.update({
    where: { id: params.id },
    data: { title, slug, content, authorId, published },
  });
  return NextResponse.json(project);
}

export async function POST(req: NextRequest) {
  const data = await req.json();
  const { title, slug, content, authorId, published = false } = data;
  if (!title || !slug || !authorId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  const project = await prisma.project.create({
    data: { title, slug, content, authorId, published },
  });
  return NextResponse.json(project);
}

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      where: { published: true },
      take: 5,
      select: {
        id: true,
        title: true,
        slug: true,
        content: true,
      }
    });

    return NextResponse.json({ 
      success: true, 
      count: projects.length,
      projects: projects.map(p => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        contentType: typeof p.content,
        contentSample: JSON.stringify(p.content).substring(0, 500),
        contentStructure: Array.isArray(p.content) ? 'array' : (p.content && typeof p.content === 'object' ? Object.keys(p.content) : 'primitive'),
      }))
    });
  } catch (error) {
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
}
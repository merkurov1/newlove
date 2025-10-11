export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      select: {
        id: true,
        title: true,
        slug: true,
        published: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ 
      success: true, 
      count: projects.length,
      projects: projects
    });
  } catch (error) {
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
}
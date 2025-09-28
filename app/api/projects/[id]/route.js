import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Эта функция будет вызываться по GET запросу на /api/projects/[id]
export async function GET(request, { params }) {
  try {
    const projectId = params.id;
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json(project);
  } catch (error) {
    console.error("Error fetching project:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}


import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  const subscribers = await prisma.subscriber.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      createdAt: true,
      userId: true,
    },
  });
  return NextResponse.json({ subscribers });
}

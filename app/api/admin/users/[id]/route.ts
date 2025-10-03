import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import prisma from '@/lib/prisma';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { role, name, username, bio, website } = await request.json();
    const userId = params.id;

    // Проверяем что пользователь не пытается изменить свою роль на не-ADMIN
    if (session.user.id === userId && role && role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Cannot remove admin role from yourself' },
        { status: 400 }
      );
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(role && { role }),
        ...(name !== undefined && { name }),
        ...(username !== undefined && { username }),
        ...(bio !== undefined && { bio }),
        ...(website !== undefined && { website }),
      },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        image: true,
        bio: true,
        website: true,
      },
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
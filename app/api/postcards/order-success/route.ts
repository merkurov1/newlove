export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import prisma from '@/lib/prisma';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-08-27.basil',
});

export async function GET(request: Request) {
  try {
    // Проверка аутентификации
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('session_id');

    if (!sessionId) {
      return NextResponse.json({ 
        error: 'Session ID не предоставлен' 
      }, { status: 400 });
    }

    // Получаем информацию о сессии из Stripe
    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);

    if (!checkoutSession.metadata?.orderId) {
      return NextResponse.json({ 
        error: 'Заказ не найден' 
      }, { status: 404 });
    }

    // Получаем заказ из базы данных
    const order = await prisma.postcardOrder.findUnique({
      where: { 
        id: checkoutSession.metadata.orderId,
        userId: session.user.id // Проверяем, что заказ принадлежит пользователю
      },
      include: {
        postcard: {
          select: {
            title: true,
            image: true
          }
        }
      }
    });

    if (!order) {
      return NextResponse.json({ 
        error: 'Заказ не найден' 
      }, { status: 404 });
    }

    // Если оплата прошла успешно, обновляем статус заказа
    if (checkoutSession.payment_status === 'paid' && order.status === 'PENDING') {
      await prisma.postcardOrder.update({
        where: { id: order.id },
        data: { status: 'PAID' }
      });
      order.status = 'PAID';
    }

    return NextResponse.json({
      success: true,
      order: {
        id: order.id,
        postcard: order.postcard,
        recipientName: order.recipientName,
        city: order.city,
        amount: order.amount,
        status: order.status,
        createdAt: order.createdAt
      }
    });

  } catch (error) {
    console.error('Error fetching order success info:', error);
    return NextResponse.json({ 
      error: 'Ошибка при получении информации о заказе' 
    }, { status: 500 });
  }
}
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import prisma from '@/lib/prisma';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-08-27.basil',
});

export async function POST(request: Request) {
  try {
    // Проверка аутентификации
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      postcardId,
      recipientName,
      address,
      city,
      postalCode,
      country,
      phone,
      customMessage
    } = body;

    // Проверяем обязательные поля
    if (!postcardId || !recipientName || !address || !city || !postalCode) {
      return NextResponse.json({ 
        error: 'Не заполнены обязательные поля' 
      }, { status: 400 });
    }

    // Получаем информацию о открытке
    const postcard = await prisma.postcard.findUnique({
      where: { id: postcardId }
    });

    if (!postcard || !postcard.available) {
      return NextResponse.json({ 
        error: 'Открытка не найдена или недоступна' 
      }, { status: 404 });
    }

    // Создаем заказ в базе данных
    const order = await prisma.postcardOrder.create({
      data: {
        postcardId,
        userId: session.user.id,
        recipientName,
        address,
        city,
        postalCode,
        country: country || 'Russia',
        phone: phone || null,
        customMessage: customMessage || null,
        amount: postcard.price,
        status: 'PENDING'
      }
    });

    // Создаем Payment Intent в Stripe
    const paymentIntent = await stripe.paymentIntents.create({
      amount: postcard.price, // Сумма в копейках
      currency: 'rub',
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        orderId: order.id,
        postcardId: postcard.id,
        userId: session.user.id,
        recipientName,
      },
      description: `Заказ открытки: ${postcard.title}`,
      receipt_email: session.user.email || undefined,
    });

    // Обновляем заказ с Payment Intent ID
    await prisma.postcardOrder.update({
      where: { id: order.id },
      data: { stripePaymentIntentId: paymentIntent.id }
    });

    // Создаем Checkout Session для более простого UX
    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'rub',
            product_data: {
              name: postcard.title,
              description: postcard.description || 'Авторская открытка',
              images: [postcard.image],
            },
            unit_amount: postcard.price,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.NEXTAUTH_URL}/letters/order-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXTAUTH_URL}/letters`,
      metadata: {
        orderId: order.id,
        postcardId: postcard.id,
        userId: session.user.id,
      },
      customer_email: session.user.email || undefined,
    });

    return NextResponse.json({
      success: true,
      orderId: order.id,
      paymentUrl: checkoutSession.url,
      paymentIntentId: paymentIntent.id,
    });

  } catch (error) {
    console.error('Error creating postcard order:', error);
    return NextResponse.json({ 
      error: 'Ошибка при создании заказа' 
    }, { status: 500 });
  }
}
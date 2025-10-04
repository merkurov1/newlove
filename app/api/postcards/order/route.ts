import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
// import prisma from '@/lib/prisma';
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
      streetAddress,
      addressLine2,
      city,
      stateProvince,
      postalCode,
      country,
      phone,
      customMessage
    } = body;

    // Проверяем обязательные поля
    if (!postcardId || !recipientName || !streetAddress || !city || !postalCode || !country) {
      return NextResponse.json({ 
        error: 'Не заполнены обязательные поля' 
      }, { status: 400 });
    }

    // Временно используем моковые данные до обновления базы
    const mockPostcards: any = {
      'postcard_1': { id: 'postcard_1', price: 2900, available: true, title: 'Авторская открытка "Закат"' },
      'postcard_2': { id: 'postcard_2', price: 2900, available: true, title: 'Открытка "Минимализм"' }
    };

    const postcard = mockPostcards[postcardId];
    if (!postcard || !postcard.available) {
      return NextResponse.json({ 
        error: 'Открытка не найдена или недоступна' 
      }, { status: 404 });
    }

    // Собираем полный адрес для Stripe
    const fullAddress = [streetAddress, addressLine2].filter(Boolean).join(', ');
    
    // TODO: Создаем заказ в базе данных когда модели будут готовы
    const orderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Моковый заказ для демонстрации
    const mockOrder = {
      id: orderId,
      postcardId,
      userId: session.user.id,
      recipientName,
      address: fullAddress,
      city,
      stateProvince,
      postalCode,
      country,
      phone: phone || null,
      customMessage: customMessage || null,
      amount: postcard.price,
      status: 'PENDING'
    };

    // Создаем Checkout Session для более простого UX
    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'gbp', // Меняем на фунты стерлингов
            product_data: {
              name: postcard.title,
              description: 'Авторская открытка с международной доставкой',
              images: ['/images/postcard-placeholder.jpg'],
            },
            unit_amount: postcard.price, // £29.00 в пенсах
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.NEXTAUTH_URL}/letters/order-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXTAUTH_URL}/letters`,
      metadata: {
        orderId: mockOrder.id,
        postcardId: postcard.id,
        userId: session.user.id,
        recipientName,
        fullAddress,
        city,
        stateProvince: stateProvince || '',
        postalCode,
        country,
        phone: phone || '',
        customMessage: customMessage || '',
      },
      customer_email: session.user.email || undefined,
      shipping_address_collection: {
        allowed_countries: ['GB', 'US', 'CA', 'AU', 'DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'CH', 'AT', 'SE', 'NO', 'DK', 'FI', 'JP', 'KR', 'SG', 'NZ', 'RU', 'PL', 'CZ', 'IE', 'PT'],
      },
      billing_address_collection: 'required',
    });

    return NextResponse.json({
      success: true,
      orderId: mockOrder.id,
      paymentUrl: checkoutSession.url,
    });

  } catch (error) {
    console.error('Error creating postcard order:', error);
    return NextResponse.json({ 
      error: 'Ошибка при создании заказа' 
    }, { status: 500 });
  }
}
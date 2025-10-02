import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { sanitizeString } from '@/lib/validation/security';

// Проверка переменных окружения при билде
if (!process.env.STRIPE_SECRET_KEY && process.env.NODE_ENV !== 'development') {
  console.warn('⚠️ STRIPE_SECRET_KEY not configured');
}

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-08-27.basil',
}) : null;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Проверка конфигурации Stripe
    if (!stripe) {
      console.error('❌ Stripe not configured');
      return NextResponse.json({ error: 'Service temporarily unavailable' }, { status: 503 });
    }

    const { id } = params;
    
    // Валидация ID продукта
    const sanitizedId = sanitizeString(id);
    if (!sanitizedId || sanitizedId.length > 50) {
      return NextResponse.json({ error: 'Invalid product ID' }, { status: 400 });
    }

    // Получаем товар из Supabase
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/products?id=eq.${encodeURIComponent(sanitizedId)}&select=*`, {
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      },
      cache: 'no-store',
    });
    
    if (!res.ok) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }
    
    const data = await res.json();
    const product = data[0];
    
    if (!product || !product.active) {
      return NextResponse.json({ error: 'Product not found or inactive' }, { status: 404 });
    }

    // Валидация данных продукта
    if (!product.name || !product.price || product.price <= 0) {
      return NextResponse.json({ error: 'Invalid product data' }, { status: 400 });
    }

    // Создаём Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'rub',
            product_data: {
              name: product.name,
              description: product.description || undefined,
              images: product.image ? [product.image] : undefined,
            },
            unit_amount: Math.round(product.price * 100), // рубли → копейки, округляем
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/shop/success`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/shop/cancel`,
      metadata: {
        product_id: product.id,
        product_name: product.name,
      },
    });

    return NextResponse.redirect(session.url!, 303);
    
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Checkout error:', error);
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

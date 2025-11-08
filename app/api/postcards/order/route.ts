export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import Stripe from 'stripe';

// Temporary: use a minimal Stripe client. In a follow-up we'll wire a server-side
// Supabase/Onboard auth client and persist orders to the DB.
const stripeKey = process.env.STRIPE_SECRET_KEY || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || 'sk_test_placeholder';
const stripe = new Stripe(stripeKey, {
  apiVersion: '2025-08-27.basil',
});

export async function POST(request: Request) {
  try {
    // Try Supabase session first, fall back to x-user-id header for transition
    let userId = request.headers.get('x-user-id');
    try {
      const { getUserAndSupabaseForRequest } = await import('@/lib/getUserAndSupabaseForRequest');
      const { user } = await getUserAndSupabaseForRequest(request as any);
      if (user?.id) userId = user.id;
    } catch (e) {
      // helper might fail — we'll rely on header fallback
    }
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
      customMessage,
    } = body || {};

    if (!postcardId || !recipientName || !streetAddress || !city || !postalCode || !country) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Mock postcards catalog until DB model is ready
    const mockPostcards: Record<string, { id: string; price: number; available: boolean; title: string }> = {
      postcard_1: { id: 'postcard_1', price: 2900, available: true, title: 'Авторская открытка "Закат"' },
      postcard_2: { id: 'postcard_2', price: 2900, available: true, title: 'Открытка "Минимализм"' },
    };

    const postcard = mockPostcards[postcardId];
    if (!postcard || !postcard.available) {
      return NextResponse.json({ error: 'Postcard not found or unavailable' }, { status: 404 });
    }

    const fullAddress = [streetAddress, addressLine2].filter(Boolean).join(', ');

    const orderId = `order_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    const mockOrder = {
      id: orderId,
      postcardId,
      userId,
      recipientName,
      address: fullAddress,
      city,
      stateProvince,
      postalCode,
      country,
      phone: phone || null,
      customMessage: customMessage || null,
      amount: postcard.price,
      status: 'PENDING',
    };

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';

    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'gbp',
            product_data: {
              name: postcard.title,
              description: 'Авторская открытка с международной доставкой',
              images: ['/images/postcard-placeholder.jpg'],
            },
            unit_amount: postcard.price,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${baseUrl}/letters/order-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/letters`,
      metadata: {
        orderId: mockOrder.id,
        postcardId: postcard.id,
        userId,
        recipientName,
        fullAddress,
        city,
        stateProvince: stateProvince || '',
        postalCode,
        country,
        phone: phone || '',
        customMessage: customMessage || '',
      },
      customer_email: undefined,
      shipping_address_collection: {
        allowed_countries: ['GB', 'US', 'CA', 'AU', 'DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'CH', 'AT', 'SE', 'NO', 'DK', 'FI', 'JP', 'KR', 'SG', 'NZ', 'RU', 'PL', 'CZ', 'IE', 'PT'],
      },
      billing_address_collection: 'required',
    });

    return NextResponse.json({ success: true, orderId: mockOrder.id, paymentUrl: checkoutSession.url });
  } catch (error) {
    console.error('Error creating postcard order:', error);
    return NextResponse.json({ error: 'Error creating order' }, { status: 500 });
  }
}
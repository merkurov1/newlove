import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import {
  normalizePierrotPostcardRef,
  pierrotConversationIdFromRef,
} from '@/lib/pierrot/orderAttribution';
import { recordPierrotEventByConversationId } from '@/lib/pierrot/serverStore';

export const dynamic = 'force-dynamic';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-08-27.basil',
});

const OrderSchema = z.object({
  postcardId: z.string().min(1).max(100),
  recipientName: z.string().trim().min(2).max(100),
  streetAddress: z.string().trim().min(5).max(200),
  addressLine2: z.string().trim().max(200).optional().default(''),
  city: z.string().trim().min(2).max(100),
  stateProvince: z.string().trim().max(100).optional().default(''),
  postalCode: z.string().trim().min(3).max(20),
  country: z.string().trim().min(2).max(100),
  phone: z.string().trim().max(30).optional().default(''),
  email: z.string().trim().email().max(254),
  customMessage: z.string().max(500).optional().default(''),
  // Opaque attribution only. Never a price, status or trusted order field.
  pierrotAttribution: z.string().max(80).optional(),
});

export async function POST(request: Request) {
  const limited = checkRateLimit(getClientIp(request), {
    interval: 60 * 60 * 1000,
    maxRequests: 10,
    keyPrefix: 'postcards',
  });

  if (limited) return limited;

  try {
    const parsed = OrderSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Please check the order details.',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const body = parsed.data;

    const supabase = getServerSupabaseClient({ useServiceRole: true });

    const { data: postcard, error: postcardError } = await supabase
      .from('postcards')
      .select('id, title, description, image, price, available')
      .eq('id', body.postcardId)
      .eq('available', true)
      .maybeSingle();

    if (postcardError) {
      console.error('Postcard lookup failed:', postcardError);
      return NextResponse.json(
        { error: 'Could not verify the postcard. Please try again.' },
        { status: 500 },
      );
    }

    if (!postcard || postcard.available === false) {
      return NextResponse.json(
        { error: 'This postcard is currently unavailable.' },
        { status: 404 },
      );
    }

    if (!Number.isInteger(postcard.price) || postcard.price <= 0) {
      console.error('Invalid postcard price:', postcard.id, postcard.price);
      return NextResponse.json(
        { error: 'The postcard price is not configured correctly.' },
        { status: 500 },
      );
    }

    const baseUrl = (
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXTAUTH_URL ||
      'http://localhost:3000'
    ).replace(/\/$/, '');

    const orderId = randomUUID();
    const pierrotAttribution = normalizePierrotPostcardRef(body.pierrotAttribution);
    const fullAddress = [body.streetAddress, body.addressLine2]
      .filter(Boolean)
      .join(', ');

    // The current table requires userId even for guest orders.
    // "guest" is a marker, not an authenticated user identity.
    const { error: insertError } = await supabase
      .from('postcard_orders')
      .insert({
        id: orderId,
        postcardId: postcard.id,
        userId: 'guest',
        recipientName: body.recipientName,
        address: fullAddress,
        city: body.city,
        postalCode: body.postalCode,
        country: body.country,
        phone: body.phone || null,
        customMessage: body.customMessage || null,
        amount: postcard.price,
        status: 'PENDING',
      });

    if (insertError) {
      console.error('Postcard order insert failed:', insertError);
      return NextResponse.json(
        { error: 'Could not save the order. Please try again.' },
        { status: 500 },
      );
    }

    try {
      const checkout = await stripe.checkout.sessions.create(
        {
          mode: 'payment',
          payment_method_types: ['card'],
          customer_email: body.email,
          line_items: [
            {
              price_data: {
                currency: 'gbp',
                unit_amount: postcard.price,
                product_data: {
                  name: postcard.title,
                  description:
                    'Original Heart & Angel physical postcard. Postage included.',
                  ...(postcard.image?.startsWith('https://')
                    ? { images: [postcard.image] }
                    : {}),
                },
              },
              quantity: 1,
            },
          ],
          success_url:
            `${baseUrl}/heartandangel/card/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${baseUrl}/heartandangel/card?checkout=cancelled#order`,
          metadata: {
            type: 'postcard_v1',
            orderId,
            postcardId: postcard.id,
            ...(pierrotAttribution ? { pierrotAttribution } : {}),
          },
          billing_address_collection: 'required',
        },
        {
          idempotencyKey: `postcard-checkout-${orderId}`,
        },
      );

      if (!checkout.url) {
        throw new Error('Stripe did not return a Checkout URL.');
      }

      // The existing checkout session is the initiation event. Payment is
      // still confirmed only by the trusted Stripe webhook.
      const pierrotConversationId = pierrotConversationIdFromRef(pierrotAttribution);

      if (pierrotConversationId) {
        await recordPierrotEventByConversationId(supabase, {
          conversationId: pierrotConversationId,
          eventName: 'checkout_started',
          eventKey: `checkout_started:${orderId}`,
          payload: {
            offer_id: 'heart_angel_postcard',
            order_id: orderId,
            amount_total: postcard.price,
            currency: 'gbp',
          },
        });
      }

      return NextResponse.json({
        success: true,
        orderId,
        paymentUrl: checkout.url,
      });
    } catch (stripeError) {
      console.error('Stripe Checkout creation failed:', stripeError);

      await supabase
        .from('postcard_orders')
        .update({
          status: 'CANCELLED',
          updatedAt: new Date().toISOString(),
        })
        .eq('id', orderId);

      return NextResponse.json(
        { error: 'Secure payment could not be started. Please try again.' },
        { status: 502 },
      );
    }
  } catch (error) {
    console.error('Postcard order endpoint failed:', error);
    return NextResponse.json(
      { error: 'Unexpected error creating the order.' },
      { status: 500 },
    );
  }
}

import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY || '',
  {
    apiVersion: '2025-08-27.basil' as any,
    typescript: true,
  }
);

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(req: Request) {
  try {
    const body = await req.text();

    const headerList = await headers();
    const signature = headerList.get('stripe-signature');

    if (!signature || !endpointSecret) {
      console.error(
        'Stripe webhook: missing signature or secret'
      );

      return NextResponse.json(
        {
          error: 'Missing Stripe signature or webhook secret',
        },
        { status: 400 }
      );
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        endpointSecret
      );
    } catch (error: any) {
      console.error(
        'Stripe webhook signature error:',
        error?.message
      );

      return NextResponse.json(
        {
          error: `Webhook signature error: ${
            error?.message || 'invalid signature'
          }`,
        },
        { status: 400 }
      );
    }

    if (event.type !== 'checkout.session.completed') {
      return NextResponse.json({
        received: true,
      });
    }

    const session = event.data.object as Stripe.Checkout.Session;
    const metadata = session.metadata || {};

    /*
     * POSTCARDS
     *
     * Postcard payments are processed independently of Tributes.
     * The order ID is passed to Stripe Checkout in metadata.
     */
    if (metadata.type === 'postcard_v1') {
      if (session.payment_status !== 'paid') {
        console.log(
          `Ignoring unpaid postcard session ${session.id}: ${session.payment_status}`
        );

        return NextResponse.json({
          received: true,
          ignored: true,
        });
      }

      const orderId = metadata.orderId;

      if (!orderId) {
        console.error(
          `Postcard session ${session.id} is missing orderId metadata`
        );

        return NextResponse.json(
          { error: 'Missing postcard order ID' },
          { status: 400 }
        );
      }

      const {
        data: order,
        error: lookupError,
      } = await supabaseAdmin
        .from('postcard_orders')
        .select('id, status')
        .eq('id', orderId)
        .maybeSingle();

      if (lookupError) {
        console.error(
          'Postcard order lookup error:',
          lookupError
        );

        return NextResponse.json(
          { error: 'Postcard order lookup failed' },
          { status: 500 }
        );
      }

      if (!order) {
        console.error(
          `Postcard order ${orderId} not found for session ${session.id}`
        );

        return NextResponse.json(
          { error: 'Postcard order not found' },
          { status: 500 }
        );
      }

      /*
       * Idempotency:
       * Stripe may deliver the same event multiple times.
       * Do not downgrade orders that have already progressed.
       */
      const completedStatuses = [
        'PAID',
        'PROCESSING',
        'SHIPPED',
        'DELIVERED',
      ];

      if (completedStatuses.includes(order.status)) {
        console.log(
          `Postcard order ${orderId} already has status ${order.status}`
        );

        return NextResponse.json({
          received: true,
          duplicate: true,
        });
      }

      const paymentIntentId =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id || null;

      const { error: updateError } = await supabaseAdmin
        .from('postcard_orders')
        .update({
          status: 'PAID',
          stripePaymentIntentId: paymentIntentId,
          updatedAt: new Date().toISOString(),
        })
        .eq('id', orderId);

      if (updateError) {
        console.error(
          'Postcard order update error:',
          updateError
        );

        // Return 500 so Stripe retries the webhook.
        return NextResponse.json(
          { error: 'Failed to update postcard order' },
          { status: 500 }
        );
      }

      console.log(
        `Postcard order ${orderId} marked PAID; Stripe session ${session.id}`
      );

      return NextResponse.json({
        received: true,
        processed: true,
        type: 'postcard_v1',
        orderId,
      });
    }

    /*
     * TRIBUTES
     *
     * Only Tribute sessions are allowed to enter `tributes`.
     */
    if (metadata.type !== 'tribute_v1') {
      console.log(
        `Ignoring Stripe session ${session.id}: unsupported payment type`
      );

      return NextResponse.json({
        received: true,
        ignored: true,
      });
    }

    // A Tribute is successful only after Stripe confirms payment.
    if (session.payment_status !== 'paid') {
      console.log(
        `Ignoring unpaid Tribute session ${session.id}: ${session.payment_status}`
      );

      return NextResponse.json({
        received: true,
        ignored: true,
      });
    }

    /*
     * Idempotency:
     * The database has a UNIQUE index on
     * tributes.stripe_session_id.
     */
    const {
      data: existingTribute,
      error: lookupError,
    } = await supabaseAdmin
      .from('tributes')
      .select('id')
      .eq('stripe_session_id', session.id)
      .maybeSingle();

    if (lookupError) {
      console.error(
        'Tribute idempotency lookup error:',
        lookupError
      );

      return NextResponse.json(
        { error: 'DB lookup error' },
        { status: 500 }
      );
    }

    if (existingTribute) {
      console.log(
        `Tribute ${session.id} already exists; webhook acknowledged`
      );

      return NextResponse.json({
        received: true,
        duplicate: true,
      });
    }

    const amountCents = session.amount_total || 0;
    const currency = session.currency || 'usd';

    const donorName =
      typeof metadata.donor_name === 'string'
        ? metadata.donor_name
        : 'Anonymous';

    const message =
      typeof metadata.message === 'string'
        ? metadata.message
        : '';

    console.log(
      `Processing Tribute ${session.id}: ${donorName}, ${amountCents} cents`
    );

    const { error: insertError } = await supabaseAdmin
      .from('tributes')
      .insert({
        amount_cents: amountCents,
        currency,
        provider: 'stripe',
        status: 'succeeded',
        donor_name: donorName,
        message,
        stripe_session_id: session.id,
      });

    if (insertError) {
      /*
       * If a concurrent webhook inserted this session first,
       * PostgreSQL returns a unique-constraint violation.
       */
      if (insertError.code === '23505') {
        console.log(
          `Tribute ${session.id} was inserted concurrently; acknowledging duplicate`
        );

        return NextResponse.json({
          received: true,
          duplicate: true,
        });
      }

      console.error(
        'Supabase Tribute insert error:',
        insertError
      );

      // Return 500 so Stripe retries the webhook.
      return NextResponse.json(
        { error: 'DB Error' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      received: true,
      processed: true,
      type: 'tribute_v1',
    });
  } catch (error: any) {
    console.error(
      'Stripe webhook handler error:',
      error
    );

    return NextResponse.json(
      { error: 'Server Error' },
      { status: 500 }
    );
  }
}

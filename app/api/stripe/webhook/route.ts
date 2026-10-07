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

const endpointSecret =
  process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(req: Request) {
  try {
    const body = await req.text();

    const headerList = await headers();
    const signature =
      headerList.get('stripe-signature');

    if (!signature || !endpointSecret) {
      console.error(
        'Stripe webhook: missing signature or secret'
      );

      return NextResponse.json(
        {
          error:
            'Missing Stripe signature or webhook secret',
        },
        { status: 400 }
      );
    }

    let event: Stripe.Event;

    try {
      event =
        stripe.webhooks.constructEvent(
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
          error:
            `Webhook signature error: ${
              error?.message || 'invalid signature'
            }`,
        },
        { status: 400 }
      );
    }

    if (
      event.type !==
      'checkout.session.completed'
    ) {
      return NextResponse.json({
        received: true,
      });
    }

    const session =
      event.data.object as Stripe.Checkout.Session;

    const metadata = session.metadata || {};

    // Critical separation:
    // only Tribute sessions are allowed to enter `tributes`.
    if (metadata.type !== 'tribute_v1') {
      console.log(
        `Ignoring Stripe session ${session.id}: unsupported payment type`
      );

      return NextResponse.json({
        received: true,
        ignored: true,
      });
    }

    // A Tribute is considered successful only after Stripe
    // confirms the payment.
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
     *
     * Stripe may deliver the same webhook more than once.
     * The database also has a UNIQUE index on
     * tributes.stripe_session_id.
     *
     * We still perform the lookup first for a clean fast path.
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

    const amountCents =
      session.amount_total || 0;

    const currency =
      session.currency || 'usd';

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

    const { error: insertError } =
      await supabaseAdmin
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
       * If another webhook invocation won the race and
       * inserted this session first, PostgreSQL returns
       * a unique-constraint violation.
       *
       * That is still a successful/idempotent outcome.
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

      // 500 makes Stripe retry the webhook.
      return NextResponse.json(
        { error: 'DB Error' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      received: true,
      processed: true,
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
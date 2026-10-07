import Stripe from 'stripe';

export const dynamic = 'force-dynamic';

const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY || '',
  {
    apiVersion: '2025-08-27.basil' as any,
  }
);

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  'https://merkurov.love'
).replace(/\/+$/, '');

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const amount = Number(body?.amount);

    const currency =
      typeof body?.currency === 'string'
        ? body.currency.toLowerCase()
        : 'eur';

    if (
      !Number.isFinite(amount) ||
      !Number.isInteger(amount) ||
      amount < 1
    ) {
      return new Response(
        JSON.stringify({
          error: 'Invalid amount.',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    if (currency !== 'eur') {
      return new Response(
        JSON.stringify({
          error:
            'This donation endpoint currently accepts EUR only.',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const session =
      await stripe.checkout.sessions.create({
        payment_method_types: ['card'],

        line_items: [
          {
            price_data: {
              currency: 'eur',

              product_data: {
                name: 'Donation',
              },

              unit_amount: amount,
            },

            quantity: 1,
          },
        ],

        mode: 'payment',

        success_url:
          `${SITE_URL}/?donate=success`,

        cancel_url:
          `${SITE_URL}/?donate=cancel`,

        metadata: {
          type: 'generic_donation_v1',
        },
      });

    return new Response(
      JSON.stringify({
        id: session.id,
        url: session.url,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error: any) {
    console.error(
      'Stripe generic checkout error:',
      error
    );

    return new Response(
      JSON.stringify({
        error:
          error?.message ||
          'Unable to create Stripe session.',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
}
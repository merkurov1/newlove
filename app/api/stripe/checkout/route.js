export const dynamic = 'force-dynamic';

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2022-11-15',
});

export async function POST(req) {
  try {
    const { amount, currency = 'usd', successUrl, cancelUrl } = await req.json();
    if (!amount || !successUrl || !cancelUrl) {
      return new Response(JSON.stringify({ error: 'Missing required parameters.' }), { status: 400 });
    }
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: 'Donation',
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
    return new Response(JSON.stringify({ id: session.id, url: session.url }), { status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

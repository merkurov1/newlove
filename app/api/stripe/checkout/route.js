// app/api/stripe/checkout/route.js
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-08-16',
});

export async function POST(req) {
  try {
    const { amount = 500, currency = 'usd', success_url, cancel_url } = await req.json();
    // amount — в центах (500 = $5)
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: 'Донат',
              description: 'Поддержка проекта',
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: success_url || `${req.headers.get('origin')}/donate/success`,
      cancel_url: cancel_url || `${req.headers.get('origin')}/donate/cancel`,
    });
    return new Response(JSON.stringify({ url: session.url }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}



import rateLimit from 'express-rate-limit';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2022-11-15',
});

// Simple in-memory rate limiter for Next.js API route
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 минута
  max: 5, // максимум 5 запросов в минуту с одного IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return NextResponse.json({ error: 'Too many requests, please try again later.' }, { status: 429 });
  },
});

export async function POST(req, res) {
  // Rate limit check
  // @ts-ignore
  await new Promise((resolve, reject) => limiter(req, res, (result) => result instanceof Error ? reject(result) : resolve(result)));
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

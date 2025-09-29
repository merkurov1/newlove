// app/api/stripe/checkout/route.js
// Stripe checkout route временно отключён для успешной сборки
export async function POST() {
  return new Response(JSON.stringify({ error: 'Stripe checkout временно отключён для сборки.' }), { status: 503 });
}

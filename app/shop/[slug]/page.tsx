import Image from 'next/image';
import Link from 'next/link';

async function getProduct(slug: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/products?slug=eq.${slug}&select=*`, {
    headers: {
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data[0] || null;
}

export default async function ProductPage({ params }: { params: { slug: string } }) {
  const product = await getProduct(params.slug);
  if (!product) return <div className="p-8">Товар не найден</div>;

  return (
    <div className="container mx-auto px-4 py-12 max-w-2xl">
      <div className="flex flex-col md:flex-row gap-8">
        {product.image && (
          <div className="relative w-full md:w-80 h-80 bg-gray-100 rounded-lg overflow-hidden">
            <Image src={product.image} alt={product.name} fill className="object-cover" />
          </div>
        )}
        <div className="flex-1 flex flex-col">
          <h1 className="text-3xl font-bold mb-4">{product.name}</h1>
          <div className="text-lg text-gray-700 mb-4">{product.description}</div>
          <div className="text-2xl font-bold text-blue-700 mb-8">{product.price} ₽</div>
          <form action={`/api/shop/checkout/${product.id}`} method="POST">
            <button type="submit" className="rounded bg-blue-600 px-6 py-3 text-white font-semibold hover:bg-blue-700 transition">Купить через Stripe</button>
          </form>
          <Link href="/shop" className="mt-6 text-blue-500 hover:underline">← Все товары</Link>
        </div>
      </div>
    </div>
  );
}

import Link from 'next/link';
import Image from 'next/image';

async function getProducts() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/products?select=*`, {
    headers: {
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    },
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.filter((p: any) => p.active);
}

export default async function ShopPage() {
  const products = await getProducts();

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-8">Магазин</h1>
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product: any) => (
          <div key={product.id} className="bg-white rounded-lg shadow-sm border border-gray-100 flex flex-col group overflow-hidden">
            {product.image && (
              <Link href={`/shop/${product.slug}`} className="block relative w-full h-48">
                <Image src={product.image} alt={product.name} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" className="object-cover group-hover:scale-105 transition-transform duration-300" />
              </Link>
            )}
            <div className="p-6 flex-grow flex flex-col">
              <Link href={`/shop/${product.slug}`}> 
                <h2 className="text-xl font-semibold text-gray-900 mb-2 group-hover:text-blue-600">{product.name}</h2>
              </Link>
              <div className="text-lg font-bold text-blue-700 mb-4">{product.price} ₽</div>
              <Link href={`/shop/${product.slug}`} className="mt-auto inline-block rounded bg-blue-600 px-4 py-2 text-white font-semibold hover:bg-blue-700 transition">Купить</Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

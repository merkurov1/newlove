import Link from 'next/link';
import Image from 'next/image';
import prisma from '@/lib/prisma';
import { EmptyState } from '@/components/admin/EmptyState';

async function getProducts() {
  try {
    return await prisma.product.findMany({
      where: { active: true },
      orderBy: { createdAt: 'desc' }
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    return [];
  }
}

function ProductCard({ product }: { product: any }) {
  return (
    <div className="group bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-all duration-300 hover:scale-[1.02]">
      {product.image && (
        <Link href={`/shop/${product.slug}`} className="block relative w-full h-64 overflow-hidden">
          <Image 
            src={product.image} 
            alt={product.name} 
            fill 
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" 
            className="object-cover group-hover:scale-110 transition-transform duration-500" 
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all duration-300" />
        </Link>
      )}
      
      <div className="p-6">
        <Link href={`/shop/${product.slug}`} className="block mb-3"> 
          <h3 className="text-xl font-semibold text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2">
            {product.name}
          </h3>
        </Link>
        
        {product.description && (
          <p className="text-gray-600 text-sm mb-4 line-clamp-3">
            {product.description}
          </p>
        )}
        
        <div className="flex items-center justify-between">
          <div className="text-2xl font-bold text-gray-900">
            £{Number(product.price).toLocaleString('en-GB')}
          </div>
          <Link 
            href={`/shop/${product.slug}`} 
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Купить
            <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default async function ShopPage() {
  const products = await getProducts();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-gray-900 sm:text-5xl md:text-6xl">
              Магазин
            </h1>
            <p className="mt-4 text-xl text-gray-600 max-w-2xl mx-auto">
              Качественные товары и услуги для ваших потребностей
            </p>
          </div>
        </div>
      </div>

      {/* Products Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {products.length === 0 ? (
          <EmptyState
            icon="🛍️"
            title="Товары пока недоступны"
            description="В магазине пока нет товаров. Загляните позже!"
          />
        ) : (
          <>
            <div className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                Доступные товары
              </h2>
              <p className="text-gray-600">
                {products.length} {products.length === 1 ? 'товар' : products.length < 5 ? 'товара' : 'товаров'}
              </p>
            </div>

            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

import Link from 'next/link';

export default function ShopCancelPage() {
  return (
    <div className="container mx-auto px-4 py-24 text-center max-w-xl">
      <h1 className="text-3xl font-bold mb-6 text-red-600">Оплата не завершена</h1>
      <p className="mb-8 text-lg text-gray-700">Платёж был отменён или не завершён. Вы можете попробовать снова или выбрать другой товар.</p>
      <Link href="/shop" className="inline-block rounded bg-blue-600 px-6 py-3 text-white font-semibold hover:bg-blue-700 transition">Вернуться в магазин</Link>
    </div>
  );
}

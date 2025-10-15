import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function Page403() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-8">
      <div className="max-w-md text-center">
        <h1 className="text-4xl font-extrabold text-red-600 mb-4">403 — Доступ запрещён</h1>
        <p className="text-gray-700 mb-6">У вас нет прав для доступа к этой странице. Если вы считаете, что это ошибка, выполните вход под админом или свяжитесь с владельцем сайта.</p>
        <div className="flex justify-center gap-3">
          <Link href="/" className="px-4 py-2 rounded bg-gray-100 border">На главную</Link>
          <Link href="/" className="px-4 py-2 rounded bg-blue-600 text-white">Войти</Link>
        </div>
      </div>
    </div>
  );
}

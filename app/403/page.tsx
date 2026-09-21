import Link from 'next/link';
import PasskeyAuth from '@/components/PasskeyAuth';

export const dynamic = 'force-dynamic';

export default function Page403() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white p-8">
      <div className="max-w-md w-full text-center mb-8">
        <h1 className="text-4xl font-extrabold text-red-600 mb-4">403 — Доступ запрещён</h1>
        <p className="text-gray-700 mb-6">
          Для доступа к панели администратора необходима авторизация с правами администратора. Используйте биометрию Passkey ниже.
        </p>
      </div>

      <div className="w-full max-w-md">
        <PasskeyAuth />
      </div>

      <div className="mt-8 flex justify-center gap-3">
        <Link href="/" className="px-4 py-2 text-sm rounded bg-gray-100 border text-gray-700 hover:bg-gray-200 transition">
          На главную
        </Link>
      </div>
    </div>
  );
}

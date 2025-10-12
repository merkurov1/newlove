import { usePrivyAuth } from '@/hooks/usePrivyAuth';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const { ready, authenticated, isLoading, error, login, session, status, debug } = usePrivyAuth();
  const router = useRouter();

  useEffect(() => {
    if (authenticated && status === 'authenticated') {
      router.push('/');
    }
  }, [authenticated, status, router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-4">
      <div className="max-w-md w-full bg-white shadow-lg rounded-xl p-8 flex flex-col items-center">
        <h1 className="text-2xl font-bold mb-6 text-gray-900">Вход через Privy</h1>
        <button
          onClick={login}
          disabled={isLoading || !ready || authenticated}
          className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-pink-600 hover:bg-pink-700 text-white font-semibold rounded-lg shadow transition text-lg mb-4"
        >
          {isLoading ? '⏳ Вход...' : '🔐 Войти через Privy'}
        </button>
        {error && <div className="text-red-600 mb-2">❌ {error}</div>}
        <div className="text-xs text-gray-500 mb-2">Session status: {status}</div>
        <div className="text-xs text-gray-500 mb-2">Authenticated: {String(authenticated)}</div>
        {process.env.NODE_ENV !== 'production' && debug && (
          <pre className="text-xs bg-gray-100 p-2 rounded max-w-full overflow-x-auto mt-2">{JSON.stringify(debug, null, 2)}</pre>
        )}
      </div>
    </div>
  );
}

// components/UserSidebar.js
"use client";
import Link from 'next/link';
import useSupabaseSession from '@/hooks/useSupabaseSession';
import Image from 'next/image';
import { createClient as createBrowserClient } from '@/lib/supabase-browser';

export default function UserSidebar() {
  const { session, status } = useSupabaseSession();
  if (status !== 'authenticated' || !session?.user) return null;
  const { user } = session;
  const username = user.username || user.name || 'me';

  const [diagLoading, setDiagLoading] = React.useState(false);
  const [diagResult, setDiagResult] = React.useState(null);
  const [diagError, setDiagError] = React.useState(null);

  const runDiagnostics = async () => {
    setDiagLoading(true);
    setDiagError(null);
    setDiagResult(null);
    try {
      const sb = createBrowserClient();
      // get session and token
      const { data: sessData } = await sb.auth.getSession();
      const sess = (sessData || {}).session || null;
      const token = sess?.access_token || null;

      // call server role endpoint
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const roleRes = await fetch('/api/user/role', { headers });
      const roleJson = await roleRes.json().catch(() => null);

      // try anon read of user_roles via browser client
      let anonRoles = null;
      try {
        const { data: rolesData, error: rolesErr } = await sb
          .from('user_roles')
          .select('role_id,roles(name)')
          .eq('user_id', user.id);
        if (rolesErr) {
          anonRoles = { error: rolesErr.message || String(rolesErr) };
        } else {
          anonRoles = rolesData || [];
        }
      } catch (e) {
        anonRoles = { error: e?.message || String(e) };
      }

      setDiagResult({ session: sess, roleEndpoint: roleJson, anonRoles });
    } catch (e) {
      setDiagError(e?.message || String(e));
    }
    setDiagLoading(false);
  };

  const role = (user.role || '').toString();
  const roleNorm = (role.toUpperCase() === 'AUTHENTICATED' || role.toUpperCase() === 'ANONYMOUS') ? 'USER' : role.toUpperCase();
  // Debug info panel at the left of the sidebar for troubleshooting
  const debugPanel = (
      <div className="ml-3 text-xs text-gray-500">
        <div>status: {String(status)}</div>
        <div>id: {user.id}</div>
        <div>email: {user.email || '—'}</div>
        <div>role: {roleNorm}</div>
      <div className="mt-2">
        <button
          onClick={runDiagnostics}
          className="text-xs px-2 py-1 bg-yellow-100 rounded border border-yellow-200"
          disabled={diagLoading}
        >
          {diagLoading ? 'Проверка...' : 'Диагностика роли'}
        </button>
      </div>
      {diagError && <div className="text-red-600 mt-2">Ошибка: {String(diagError)}</div>}
      {diagResult && (
        <div className="mt-2 text-xs text-gray-600">
          <div><strong>/api/user/role:</strong> {JSON.stringify(diagResult.roleEndpoint)}</div>
          <div className="mt-1"><strong>session.user.role / metadata:</strong> {JSON.stringify(diagResult.session?.user?.role || diagResult.session?.user?.user_metadata)}</div>
          <div className="mt-1"><strong>anon user_roles query:</strong> {JSON.stringify(diagResult.anonRoles)}</div>
        </div>
      )}
    </div>
  );

  if (roleNorm === 'ADMIN') {
    // Админский сайдбар
    return (
      <div className="w-full border-t border-pink-300 bg-pink-50 flex flex-row items-center justify-center py-3 gap-3">
        {user.image && (
          <Image src={user.image} alt={user.name || ''} width={36} height={36} className="rounded-full border border-pink-300" />
        )}
        <nav className="flex flex-row items-center gap-3">
          <Link href={`/you/${username}`} className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-pink-100 text-xl transition font-bold" title="Профиль">👤</Link>
          <Link href="/users" className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-pink-100 text-xl transition font-bold" title="Пользователи">👥</Link>
          <Link href="/admin" className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-pink-200 text-xl transition font-bold" title="Админка">⚙️</Link>
          <Link href="/admin/logs" className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-pink-200 text-xl transition font-bold" title="Логи">📝</Link>
        </nav>
        {debugPanel}
      </div>
    );
  }

  // Обычный сайдбар
  return (
    <div className="w-full border-t border-gray-200 bg-gray-50 flex flex-row items-center justify-center py-3 gap-3">
      {user.image && (
        <Image src={user.image} alt={user.name || ''} width={36} height={36} className="rounded-full border border-gray-200" />
      )}
      <nav className="flex flex-row items-center gap-3">
        <Link href={`/you/${username}`} className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-blue-100 text-xl transition" title="Профиль">👤</Link>
        <Link href="/users" className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-blue-100 text-xl transition" title="Пользователи">👥</Link>
      </nav>
      <div className="ml-3 text-xs text-gray-500">
        <div>status: {String(status)}</div>
        <div>id: {user.id}</div>
        <div>email: {user.email || '—'}</div>
        <div>role: {(user.role || '').toString()}</div>
      </div>
    </div>
  );
}

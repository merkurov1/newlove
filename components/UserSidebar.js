// components/UserSidebar.js
"use client";
import React from 'react';
import Link from 'next/link';
// import useSupabaseSession from '@/hooks/useSupabaseSession';
import { useAuth } from './AuthContext';
import Image from 'next/image';
import { createClient as createBrowserClient } from '@/lib/supabase-browser';

export default function UserSidebar() {
  const { user, roles, isLoading } = useAuth();
  if (isLoading || !user) return null;
  const username = user.username || user.name || 'me';

  const [diagLoading, setDiagLoading] = React.useState(false);
  const [diagResult, setDiagResult] = React.useState(null);
  const [diagError, setDiagError] = React.useState(null);
  const [effectiveRole, setEffectiveRole] = React.useState(null);

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

  // call server role endpoint (fallback) using same-origin cookie auth
  const roleRes = await fetch('/api/user/role', { credentials: 'same-origin' });
  const roleJson = await roleRes.json().catch(() => null);

  // RPC: get roles assigned in DB (get_my_roles) — safer and returns role names
      let rpcRoles = null;
      try {
        // client-side RPC should be executed with the browser client which already has auth state
        const { data: rpcData, error: rpcError } = await sb.rpc('get_my_roles');
        if (rpcError) rpcRoles = { error: rpcError.message || String(rpcError) };
        else rpcRoles = rpcData || [];
      } catch (e) {
        rpcRoles = { error: e?.message || String(e) };
      }

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

      // call debug endpoint that uses service-role and RPCs (requires Authorization)
      let debugInfo = null;
      try {
        const dbgRes = await fetch('/api/debug/user-roles', { credentials: 'same-origin' });
        debugInfo = await dbgRes.json().catch(() => null);
      } catch (e) {
        debugInfo = { error: e?.message || String(e) };
      }

  setDiagResult({ session: sess, roleEndpoint: roleJson, anonRoles, rpcRoles, debugInfo });
    } catch (e) {
      setDiagError(e?.message || String(e));
    }
    setDiagLoading(false);
  };

  // On mount, check effective role via server endpoint and cache it locally
  React.useEffect(() => {
    let mounted = true;
    const checkRole = async () => {
      try {
        const sb = createBrowserClient();
  const { data: sessData } = await sb.auth.getSession();
  const sess = (sessData || {}).session || null;
  const res = await fetch('/api/user/role', { credentials: 'same-origin' });
        const json = await res.json().catch(() => null);
        if (!mounted) return;
        if (json && json.role) setEffectiveRole(String(json.role).toUpperCase());
      } catch (e) {
        // ignore — diagnostics button can be used
      }
    };
    checkRole();
    return () => { mounted = false; };
  }, []);

  // Prefer server-detected effectiveRole (RPC) if available, otherwise fall back to client roles/session
  const roleFromClient = (Array.isArray(roles) && roles.length) ? roles[0] : ((user.role || '') && String(user.role).toUpperCase()) || 'USER';
  const roleNorm = effectiveRole || roleFromClient || 'USER';
  // Debug info panel at the left of the sidebar for troubleshooting
  const debugPanel = (
      <div className="ml-3 text-xs text-gray-500">
        <div>status: {String(isLoading)}</div>
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
          <div className="mt-1"><strong>/api/debug/user-roles:</strong> {JSON.stringify(diagResult.debugInfo)}</div>
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
        <div>status: {String(isLoading)}</div>
        <div>id: {user.id}</div>
        <div>email: {user.email || '—'}</div>
        <div>role: {(user.role || '').toString()}</div>
      </div>
      {debugPanel}
    </div>
  );
}

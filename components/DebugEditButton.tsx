// components/DebugEditButton.tsx
'use client';

import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { useEditContext } from './EditContext';

export default function DebugEditButton() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const editContext = useEditContext();

  // Показываем отладочную информацию только в development
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <div className="fixed top-4 left-4 z-50 bg-black bg-opacity-80 text-white p-4 rounded-lg text-xs max-w-sm">
      <h3 className="font-bold mb-2">🐛 EditButton Debug:</h3>
      
      <div className="space-y-1">
        <div><strong>Session status:</strong> {status}</div>
        <div><strong>User role:</strong> {session?.user?.role || 'undefined'}</div>
        <div><strong>User email:</strong> {session?.user?.email || 'undefined'}</div>
        <div><strong>Pathname:</strong> {pathname}</div>
      </div>
      
      <div className="mt-3">
        <strong>Edit Context:</strong>
        <pre className="mt-1 text-xs">
          {JSON.stringify(editContext, null, 2)}
        </pre>
      </div>
      
      <div className="mt-3">
        <div><strong>Should show EditButton:</strong> {
          session?.user?.role === 'ADMIN' ? '✅ YES' : '❌ NO'
        }</div>
      </div>
    </div>
  );
}
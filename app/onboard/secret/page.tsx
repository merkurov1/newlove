"use client";
import { useEffect, useState } from "react";
import { createClient as createBrowserClient } from '@/lib/supabase-browser';
const supabase = createBrowserClient();

export default function OnboardSecretPage() {
  // Hide this debug page in production
  if (process.env.NODE_ENV === 'production') {
    return <div style={{ color: 'red', margin: 40, fontSize: 22 }}>Not Found</div>;
  }

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoading(false);
    });
  }, []);

  if (loading) return <div>Загрузка...</div>;
  if (!user) return <div style={{color:'red',margin:40,fontSize:22}}>Доступ запрещён: только для пользователей Supabase!</div>;
  return (
    <div style={{ maxWidth: 500, margin: "40px auto", padding: 24, border: "1px solid #eee", borderRadius: 12 }}>
      <h1 style={{ fontSize: 28, marginBottom: 16 }}>Supabase Secret (Onboard)</h1>
      <div style={{ color: '#2a2', fontWeight: 600, marginBottom: 16 }}>Доступ разрешён только для пользователей Supabase!</div>
      <pre style={{ background: '#f8f8f8', padding: 12, borderRadius: 8 }}>{JSON.stringify(user, null, 2)}</pre>
    </div>
  );
}

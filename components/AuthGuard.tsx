// components/AuthGuard.tsx (бывший PasswordGuard.tsx)

"use client";
import { useState, useEffect } from "react";
import ModernLoginModal from "./ModernLoginModal";
import { createClient as createBrowserClient } from '@/lib/supabase-browser';
const supabase = createBrowserClient();

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    const getUser = async () => {
      setLoading(true);
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
      setLoading(false);
    };
    getUser();
    const { data: listener } = supabase.auth.onAuthStateChange(() => getUser());
    return () => { listener?.subscription.unsubscribe(); };
  }, []);

  if (loading) {
    return <p>Проверка доступа...</p>;
  }

  if (!user) {
    return (
      <>
        <div style={{ textAlign: "center", marginTop: 48 }}>
          <h1>Доступ ограничен</h1>
          <p>Пожалуйста, войдите, чтобы просмотреть этот контент.</p>
          <button onClick={() => setModalOpen(true)} style={{ padding: 10, borderRadius: 8, fontWeight: 600, fontSize: 16 }}>Войти</button>
        </div>
        <ModernLoginModal open={modalOpen} onClose={() => setModalOpen(false)} />
      </>
    );
  }

  return <>{children}</>;
}

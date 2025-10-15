// components/LoginButton.tsx

"use client";
import { useState } from "react";
import ModernLoginModal from "./ModernLoginModal";
import Image from "next/image";
import { useAuth } from '@/components/AuthContext';

export default function LoginButton() {
  const [modalOpen, setModalOpen] = useState(false);
  const { session, signOut } = useAuth() as any;

  if (session?.user) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        {session.user?.image && (
          <Image
            src={session.user.image}
            alt={session.user.name || "User avatar"}
            width={32}
            height={32}
            style={{ borderRadius: "50%" }}
          />
        )}
        <span>{session.user?.name || session.user?.email}</span>
        <button onClick={async () => { if (signOut) await signOut(); window.location.reload(); }}>Выйти</button>
      </div>
    );
  }

  const handleOpen = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('login_redirect_path', window.location.pathname + window.location.search);
    }
    setModalOpen(true);
  };

  return (
    <>
      <button onClick={handleOpen} style={{ padding: 10, borderRadius: 8, fontWeight: 600, fontSize: 16 }}>
        Войти
      </button>
      {modalOpen && <ModernLoginModal onClose={() => setModalOpen(false)} />}
    </>
  );
}

// components/LoginButton.tsx


"use client";
import { useState, useEffect } from "react";
import ModernLoginModal from "./ModernLoginModal";
import { createClient as createBrowserClient } from '@/lib/supabase-browser';
import Image from "next/image";

const supabase = createBrowserClient();

export default function LoginButton() {
  const [modalOpen, setModalOpen] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
    };
    getUser();
    const { data: listener } = supabase.auth.onAuthStateChange(() => getUser());
    return () => { listener?.subscription.unsubscribe(); };
  }, []);

  if (user) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        {user.user_metadata?.image && (
          <Image
            src={user.user_metadata.image}
            alt={user.user_metadata.name || "User avatar"}
            width={32}
            height={32}
            style={{ borderRadius: "50%" }}
          />
        )}
        <span>{user.user_metadata?.name || user.email}</span>
        <button onClick={async () => { await supabase.auth.signOut(); setUser(null); }}>Выйти</button>
      </div>
    );
  }

  // Web3 login button (single action, no modal)
  const handleWeb3 = async () => {
    await supabase.auth.signInWithOAuth({ provider: "web3" as any });
  };
  return (
    <button onClick={handleWeb3} style={{ padding: 10, borderRadius: 8, fontWeight: 600, fontSize: 16, background: '#222', color: '#fff' }}>
      Web3
    </button>
  );
}

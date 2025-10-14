"use client";
import { useState } from "react";
import { createClient as createBrowserClient } from '@/lib/supabase-browser';
const supabase = createBrowserClient();

export default function ModernLoginModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleGoogle = async () => {
    setLoading("google");
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google" });
    if (error) setError(error.message);
    setLoading(null);
  };

  const handleWeb3 = async () => {
    setLoading("web3");
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({ provider: "web3" as any });
    if (error) setError(error.message);
    setLoading(null);
  };

  const handleEmail = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading("email");
    setError(null);
    const form = e.target as HTMLFormElement;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value;
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) setError(error.message);
    setLoading(null);
  };

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", background: "rgba(0,0,0,0.5)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center"
    }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 32, minWidth: 340, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 24, right: 32, fontSize: 24, background: "none", border: "none", cursor: "pointer" }}>&times;</button>
        <h2 style={{ textAlign: "center", fontSize: 28, marginBottom: 24 }}>Вход в аккаунт</h2>
        <button onClick={handleGoogle} disabled={loading === "google"} style={{ width: "100%", padding: 14, marginBottom: 12, background: "#4285F4", color: "#fff", fontWeight: 600, border: 0, borderRadius: 8, fontSize: 18 }}>
          {loading === "google" ? "Вход через Google..." : "Войти через Google"}
        </button>
        <a
          href="/onboard"
          style={{
            display: 'block',
            width: '100%',
            padding: 14,
            marginBottom: 12,
            background: '#222',
            color: '#fff',
            fontWeight: 600,
            border: 0,
            borderRadius: 8,
            fontSize: 18,
            textAlign: 'center',
            textDecoration: 'none',
            cursor: 'pointer'
          }}
        >
          Войти через Onboard (Web3)
        </a>
        <form onSubmit={handleEmail} style={{ marginTop: 12 }}>
          <input name="email" type="email" placeholder="Email" required style={{ width: "100%", padding: 12, fontSize: 16, borderRadius: 8, border: "1px solid #ddd", marginBottom: 8 }} />
          <button type="submit" disabled={loading === "email"} style={{ width: "100%", padding: 12, background: "#00B386", color: "#fff", fontWeight: 600, border: 0, borderRadius: 8, fontSize: 18 }}>
            {loading === "email" ? "Отправка ссылки..." : "Войти по email"}
          </button>
        </form>
        {error && <div style={{ color: "red", marginTop: 16 }}>{error}</div>}
      </div>
    </div>
  );
}

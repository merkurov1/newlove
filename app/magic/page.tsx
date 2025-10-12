"use client";
import { useState } from "react";
import { Magic } from "magic-sdk";
import { useRouter } from "next/navigation";

export default function MagicLoginPage() {
  const [email, setEmail] = useState("");
  const [user, setUser] = useState<any>(null);
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true);
    setError("");
    try {
      const magic = new Magic("pk_live_355ECE579B16040C");
      await magic.auth.loginWithEmailOTP({ email });
      const didToken = await magic.user.getIdToken();
      // Отправляем DID Token на API-роут
      const res = await fetch("/api/magic-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ didToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка логина");
      setUser(data.user);
      // Редирект на главную или защищённую страницу
      router.push("/");
    } catch (e: any) {
      setError(e && typeof e === 'object' && 'message' in e ? (e as any).message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: "40px auto", padding: 24, border: "1px solid #eee", borderRadius: 12 }}>
      <h1 style={{ fontSize: 28, marginBottom: 16 }}>Magic Login</h1>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        style={{ width: "100%", padding: 8, marginBottom: 16, fontSize: 16 }}
      />
      <button
        onClick={handleLogin}
        disabled={loading || !email}
        style={{ width: "100%", padding: 12, fontSize: 18, background: "#6851ff", color: "#fff", border: "none", borderRadius: 8 }}
      >
        {loading ? "Вход..." : "Login with Magic"}
      </button>
      {error && <div style={{ color: "red", marginTop: 16 }}>{error}</div>}
      {user && (
        <pre style={{ marginTop: 24, background: "#f8f8f8", padding: 12, borderRadius: 8 }}>{JSON.stringify(user, null, 2)}</pre>
      )}
      {/* После логина пользователь будет редиректнут */}
    </div>
  );
}

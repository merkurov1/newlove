"use client";
import { useState } from "react";
import { Magic } from "magic-sdk";
import { signIn, useSession } from "next-auth/react";

export default function MagicLoginPage() {
  const [email, setEmail] = useState("");
  const [user, setUser] = useState<any>(null);
  const { data: session, status } = useSession();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true);
    setError("");
    try {
      const magic = new Magic("pk_live_355ECE579B16040C");
      await magic.auth.loginWithEmailOTP({ email });
      const didToken = await magic.user.getIdToken();
      // NextAuth signIn
      const res = await signIn("magic", { didToken, redirect: false });
      if (res?.error) throw new Error(res.error);
      const metadata = await magic.user.getInfo();
      setUser(metadata);
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
      {session && (
        <div style={{ marginTop: 24, color: '#2a2', fontWeight: 600 }}>
          <div>✅ NextAuth session active</div>
          <pre style={{ background: '#f8f8f8', padding: 8, borderRadius: 8 }}>{JSON.stringify(session, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

"use client";
import { useState } from "react";
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function SupabaseAuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignUp() {
    setLoading(true);
    setError("");
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) setError(error.message);
    else setUser(data.user);
    setLoading(false);
  }

  async function handleSignIn() {
    setLoading(true);
    setError("");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    else setUser(data.user);
    setLoading(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setUser(null);
  }

  // Проверка сессии
  async function checkSession() {
    const { data } = await supabase.auth.getSession();
    setUser(data.session?.user || null);
  }

  return (
    <div style={{ maxWidth: 400, margin: "40px auto", padding: 24, border: "1px solid #eee", borderRadius: 12 }}>
      <h1 style={{ fontSize: 28, marginBottom: 16 }}>Supabase Auth</h1>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        style={{ width: "100%", padding: 8, marginBottom: 8, fontSize: 16 }}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        style={{ width: "100%", padding: 8, marginBottom: 16, fontSize: 16 }}
      />
      <button onClick={handleSignUp} disabled={loading || !email || !password} style={{ width: "100%", padding: 10, marginBottom: 8 }}>
        {loading ? "Регистрация..." : "Зарегистрироваться"}
      </button>
      <button onClick={handleSignIn} disabled={loading || !email || !password} style={{ width: "100%", padding: 10, marginBottom: 8 }}>
        {loading ? "Вход..." : "Войти"}
      </button>
      <button onClick={checkSession} style={{ width: "100%", padding: 10, marginBottom: 8 }}>
        Проверить сессию
      </button>
      {user && (
        <>
          <div style={{ margin: '16px 0', color: '#2a2' }}>Вы вошли как: {user.email}</div>
          <button onClick={handleSignOut} style={{ width: "100%", padding: 10, background: '#eee' }}>Выйти</button>
          <div style={{ marginTop: 16, fontSize: 13, color: '#333', background: '#f8f8f8', padding: 12, borderRadius: 8 }}>
            <b>user:</b> <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{JSON.stringify(user, null, 2)}</pre>
          </div>
          <div style={{ marginTop: 16, color: '#2a2', fontWeight: 600 }}>Доступ к закрытым разделам разрешён!</div>
        </>
      )}
      {error && <div style={{ color: "red", marginTop: 16 }}>{error}</div>}
    </div>
  );
}

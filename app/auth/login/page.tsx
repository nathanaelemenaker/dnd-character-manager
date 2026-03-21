// app/auth/login/page.tsx
'use client';

import { useState } from 'react';

export default function AuthLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(''); // Replace TODO server-side when you add hashing
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include', // important so cookies set on response are accepted by the browser
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      // Cookies set by the API response (HttpOnly) → redirect
      window.location.href = '/characters';
    } catch (e: any) {
      setErr(e?.message ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: '2rem auto', display: 'grid', gap: '1rem' }}>
      <h1>Login</h1>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: '0.5rem' }}>
        <label>
          <div>Email</div>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: '100%', padding: '0.5rem' }}
          />
        </label>
        <label>
          <div>Password</div>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%', padding: '0.5rem' }}
          />
        </label>
        <button type="submit" disabled={loading} style={{ padding: '0.6rem 0.8rem' }}>
          {loading ? 'Logging in…' : 'Login'}
        </button>
        {err && <div style={{ color: 'crimson' }}>Error: {err}</div>}
      </form>
    </div>
  );
}
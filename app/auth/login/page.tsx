'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function AuthLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      window.location.href = '/characters';
    } catch (e: any) {
      setErr(e?.message ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: '3rem auto' }}>
      <div className="panel">
        <div className="panel-header" style={{ justifyContent: 'center', fontSize: 13, letterSpacing: 2, padding: '10px 20px' }}>
          ✦ Enter the Realm ✦
        </div>
        <div className="panel-body" style={{ padding: '28px 32px 32px' }}>
          <form onSubmit={onSubmit} style={{ display: 'grid', gap: 18, maxWidth: 'none' }}>
            <div>
              <div className="field-label" style={{ marginBottom: 4 }}>Email</div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  border: '1.5px solid var(--border-light)',
                  borderRadius: 3,
                  background: 'var(--parchment)',
                  color: 'var(--ink)',
                  fontFamily: 'var(--font-body)',
                  fontSize: 14,
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <div className="field-label" style={{ marginBottom: 4 }}>Password</div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  border: '1.5px solid var(--border-light)',
                  borderRadius: 3,
                  background: 'var(--parchment)',
                  color: 'var(--ink)',
                  fontFamily: 'var(--font-body)',
                  fontSize: 14,
                  boxSizing: 'border-box',
                }}
              />
            </div>
            {err && (
              <div style={{ color: 'var(--red)', fontSize: 13, fontStyle: 'italic' }}>
                {err}
              </div>
            )}
            <button type="submit" disabled={loading} className="ink-btn" style={{ width: '100%', marginTop: 4 }}>
              {loading ? 'Entering…' : 'Enter'}
            </button>
          </form>
          <div style={{ marginTop: 20, textAlign: 'center', fontSize: 12, color: 'var(--border)', fontStyle: 'italic' }}>
            New adventurer?{' '}
            <Link href="/auth/register" style={{ color: 'var(--gold)' }}>Create an account</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

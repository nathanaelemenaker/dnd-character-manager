'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });
    setLoading(false);
    if (res.ok) {
      setMsg('Registered successfully. You may now log in.');
    } else {
      setMsg('Registration failed. That email may already be in use.');
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: '3rem auto' }}>
      <div className="panel">
        <div className="panel-header" style={{ justifyContent: 'center', fontSize: 13, letterSpacing: 2, padding: '10px 20px' }}>
          ✦ Join the Party ✦
        </div>
        <div className="panel-body" style={{ padding: '28px 32px 32px' }}>
          <form onSubmit={onSubmit} style={{ display: 'grid', gap: 18, maxWidth: 'none' }}>
            <div>
              <div className="field-label" style={{ marginBottom: 4 }}>Name</div>
              <input
                placeholder="Your adventurer name"
                value={name}
                onChange={e => setName(e.target.value)}
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
              <div className="field-label" style={{ marginBottom: 4 }}>Email</div>
              <input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
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
                onChange={e => setPassword(e.target.value)}
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
            {msg && (
              <div style={{
                fontSize: 13,
                fontStyle: 'italic',
                color: msg.startsWith('Registered') ? '#2e7d32' : 'var(--red)',
              }}>
                {msg}
              </div>
            )}
            <button type="submit" disabled={loading} className="ink-btn" style={{ width: '100%', marginTop: 4 }}>
              {loading ? 'Registering…' : 'Create Account'}
            </button>
          </form>
          <div style={{ marginTop: 20, textAlign: 'center', fontSize: 12, color: 'var(--border)', fontStyle: 'italic' }}>
            Already have an account?{' '}
            <Link href="/auth/login" style={{ color: 'var(--gold)' }}>Log in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

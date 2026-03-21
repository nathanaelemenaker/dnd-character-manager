'use client';

import Link from 'next/link';
import React from 'react';

type MeResponse = { email: string } | null;

export default function Navbar() {
  const [user, setUser] = React.useState<MeResponse>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (!alive) return;
        if (res.ok) {
          const data = (await res.json()) as MeResponse;
          setUser(data);
        } else {
          setUser(null);
        }
      } catch {
        setUser(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const onLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {
      // ignore
    } finally {
      window.location.replace('/');
    }
  };

  return (
    <header
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        padding: '10px 16px',
        borderBottom: '1px solid #e3e3e3',
        position: 'sticky',
        top: 0,
        background: '#fff',
        zIndex: 10,
      }}
    >
      <strong>D&D 5e Character Manager</strong>
      <nav style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Link href="/">Home</Link>
        <Link href="/homebrew">Homebrew</Link>

        {loading ? (
          <span style={{ opacity: 0.6 }}>…</span>
        ) : user ? (
          <>
            <Link href="/characters">Characters</Link>
            <button
              onClick={onLogout}
              style={{
                border: '1px solid #ccc',
                background: '#fafafa',
                padding: '4px 10px',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              Logout
            </button>
          </>
        ) : (
          <>
            <Link href="/auth/login">Login</Link>
            <Link href="/auth/register">Register</Link>
          </>
        )}
      </nav>
    </header>
  );
}

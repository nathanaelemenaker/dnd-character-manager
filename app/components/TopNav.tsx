'use client';
// app/components/TopNav.tsx
import Link from 'next/link';
import { useState, useEffect } from 'react';
import LogoutButton from './LogoutButton';
import AdminPanel from './AdminPanel';
import ImpersonationBanner from './ImpersonationBanner';

type MeResponse = {
  userId: string;
  email: string;
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN';
  isImpersonating: boolean;
  actorId: string;
} | null;

export default function TopNav() {
  const [me, setMe] = useState<MeResponse>(null);
  const [loading, setLoading] = useState(true);
  const [showAdmin, setShowAdmin] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  // Initialize theme from localStorage on mount
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('dnd-theme') : null;
    const isDark = saved === 'dark';
    setDarkMode(isDark);
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, []);

  function toggleTheme() {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
    localStorage.setItem('dnd-theme', next ? 'dark' : 'light');
  }

  useEffect(() => {
    let alive = true;
    fetch('/api/auth/me', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (alive) setMe(data); })
      .catch(() => { if (alive) setMe(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const isAdmin = me && (me.role === 'ADMIN' || me.role === 'SUPER_ADMIN');

  return (
    <>
      {me?.isImpersonating && (
        <ImpersonationBanner
          targetEmail={me.email}
          onExit={() => setMe(null)}
        />
      )}

      <header style={{
        borderBottom: '2px solid var(--gold)',
        padding: '0 0.75rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        height: 44,
        position: 'sticky',
        top: me?.isImpersonating ? '2.5rem' : 0,
        background: '#1a1a1a',
        zIndex: 10,
        minWidth: 0,
      }}>
        <Link href="/" style={{
          textDecoration: 'none',
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: 15,
          letterSpacing: '0.5px',
          color: 'var(--gold-light)',
          flexShrink: 0,
        }}>
          D&amp;D Sheet
        </Link>

        <div style={{ width: '1px', height: 18, background: 'var(--border)', flexShrink: 0 }} />

        {me && (
          <nav style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
            <Link href="/characters" style={{
              fontFamily: 'var(--font-display)',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.5px',
              color: '#c8b99a',
              textDecoration: 'none',
              padding: '0 8px',
              lineHeight: '42px',
              borderBottom: '2px solid transparent',
              transition: 'color 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => { (e.target as HTMLElement).style.color = 'var(--gold-light)'; (e.target as HTMLElement).style.borderBottomColor = 'var(--gold)'; }}
            onMouseLeave={e => { (e.target as HTMLElement).style.color = '#c8b99a'; (e.target as HTMLElement).style.borderBottomColor = 'transparent'; }}
            >Characters</Link>
            <Link href="/campaigns" style={{
              fontFamily: 'var(--font-display)',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.5px',
              color: '#c8b99a',
              textDecoration: 'none',
              padding: '0 8px',
              lineHeight: '42px',
              borderBottom: '2px solid transparent',
              transition: 'color 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => { (e.target as HTMLElement).style.color = 'var(--gold-light)'; (e.target as HTMLElement).style.borderBottomColor = 'var(--gold)'; }}
            onMouseLeave={e => { (e.target as HTMLElement).style.color = '#c8b99a'; (e.target as HTMLElement).style.borderBottomColor = 'transparent'; }}
            >Campaigns</Link>
          </nav>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden', flexShrink: 0 }}>
            <button
              onClick={() => darkMode && toggleTheme()}
              title="Daylight mode"
              style={{
                background: !darkMode ? 'var(--gold)' : 'transparent',
                color: !darkMode ? '#1a1a1a' : '#7a6a50',
                border: 'none',
                padding: '3px 8px',
                cursor: darkMode ? 'pointer' : 'default',
                fontSize: 11,
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                letterSpacing: '0.5px',
                lineHeight: 1.6,
              }}
            >☀ Day</button>
            <button
              onClick={() => !darkMode && toggleTheme()}
              title="Candlelight mode"
              style={{
                background: darkMode ? 'var(--gold)' : 'transparent',
                color: darkMode ? '#1a1a1a' : '#7a6a50',
                border: 'none',
                padding: '3px 8px',
                cursor: !darkMode ? 'pointer' : 'default',
                fontSize: 11,
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                letterSpacing: '0.5px',
                lineHeight: 1.6,
              }}
            >🕯 Dark</button>
          </div>

          {!loading && isAdmin && (
            <>
              <span
                title={`Role: ${me.role} — tap to open Admin Panel`}
                onClick={() => setShowAdmin(true)}
                style={{
                  fontSize: 10,
                  padding: '2px 6px',
                  borderRadius: 999,
                  background: me.role === 'SUPER_ADMIN' ? 'rgba(139,26,26,0.3)' : 'rgba(11,99,206,0.2)',
                  color: me.role === 'SUPER_ADMIN' ? '#ffaaaa' : '#7ec8ff',
                  border: `1px solid ${me.role === 'SUPER_ADMIN' ? '#8b1a1a' : '#0b63ce'}`,
                  cursor: 'pointer',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  letterSpacing: '0.5px',
                }}
              >
                {me.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin'}
              </span>

              <button
                onClick={() => setShowAdmin(true)}
                className="ink-btn ghost topnav-admin-btn"
                style={{ fontSize: 11, padding: '3px 8px', minHeight: 'unset', flexShrink: 0, whiteSpace: 'nowrap' }}
              >
                Admin Panel
              </button>
            </>
          )}

          {!loading && me ? (
            <>
              <span className="topnav-email" style={{
                fontSize: 11,
                color: '#7a6a50',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
                fontStyle: 'italic',
              }}>
                {me.email}
              </span>
              <LogoutButton />
            </>
          ) : !loading ? (
            <>
              <Link href="/auth/login" style={{ textDecoration: 'none' }}>
                <button className="ink-btn" style={{ fontSize: 11, padding: '4px 12px', minHeight: 'unset' }}>Login</button>
              </Link>
              <Link href="/auth/register" style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: '#c8b99a', textDecoration: 'none', letterSpacing: '0.5px' }}>Register</Link>
            </>
          ) : null}
        </div>
      </header>

      <style>{`
        @media (max-width: 600px) {
          .topnav-admin-btn { display: none !important; }
          .topnav-email { display: none !important; }
        }
      `}</style>

      {showAdmin && me && isAdmin && (
        <AdminPanel
          currentUserRole={me.role}
          onClose={() => setShowAdmin(false)}
        />
      )}
    </>
  );
}

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
        borderBottom: '1px solid var(--border-light, #e5e5e5)',
        padding: '0.5rem 0.75rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        position: 'sticky',
        top: me?.isImpersonating ? '2.5rem' : 0,
        background: '#fff',
        zIndex: 10,
        minWidth: 0,
      }}>
        <Link href="/" style={{ textDecoration: 'none', color: 'inherit', fontWeight: 600, flexShrink: 0 }}>
          D&D Sheet
        </Link>

        <nav style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
          <Link href="/characters">Characters</Link>
          <Link href="/campaigns">Campaigns</Link>
        </nav>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          {!loading && isAdmin && (
            <>
              {/* Role badge — always visible, clicking opens admin panel */}
              <span
                title={`Role: ${me.role} — tap to open Admin Panel`}
                onClick={() => setShowAdmin(true)}
                style={{
                  fontSize: 11,
                  padding: '2px 6px',
                  borderRadius: 999,
                  background: me.role === 'SUPER_ADMIN' ? '#fff0f0' : '#ecf5ff',
                  color: me.role === 'SUPER_ADMIN' ? '#8b1a1a' : '#0b63ce',
                  border: `1px solid ${me.role === 'SUPER_ADMIN' ? '#f5c6c6' : '#d5e9ff'}`,
                  cursor: 'pointer',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                {me.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin'}
              </span>

              {/* "Admin Panel" button — hidden on mobile */}
              <button
                onClick={() => setShowAdmin(true)}
                className="topnav-admin-btn"
                style={{
                  fontSize: 12,
                  padding: '3px 8px',
                  border: '1px solid #ccc',
                  borderRadius: 6,
                  background: '#fafafa',
                  cursor: 'pointer',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                Admin Panel
              </button>
            </>
          )}

          {!loading && me ? (
            <>
              {/* Email — hidden on mobile */}
              <span className="topnav-email" style={{
                fontSize: 12,
                color: '#666',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
              }}>
                {me.email}
              </span>
              <LogoutButton />
            </>
          ) : !loading ? (
            <>
              <Link href="/auth/login">Login</Link>
              <Link href="/auth/register">Register</Link>
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

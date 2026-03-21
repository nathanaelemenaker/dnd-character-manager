// app/components/TopNav.tsx
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { isAdminUser } from '@/lib/admin';
import LogoutButton from './LogoutButton';

export default async function TopNav() {
  const session = getSession();
  const email = session?.email ?? null;
  const isAdmin = isAdminUser(session?.userId, email);

  return (
    <header
      style={{
        borderBottom: '1px solid #e5e5e5',
        padding: '0.5rem 0.75rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        position: 'sticky',
        top: 0,
        background: '#fff',
        zIndex: 10,
      }}
    >
      <Link href="/" style={{ textDecoration: 'none', color: 'inherit', fontWeight: 600 }}>
        D&D Sheet
      </Link>

      <nav style={{ display: 'flex', gap: '0.75rem' }}>
        <Link href="/characters">Characters</Link>
        {isAdmin && <Link href="/admin/items">Admin</Link>}
      </nav>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        {isAdmin && (
          <span
            title="You have admin permissions"
            style={{
              fontSize: 12,
              padding: '2px 6px',
              borderRadius: 999,
              background: '#ecf5ff',
              color: '#0b63ce',
              border: '1px solid #d5e9ff',
            }}
          >
            Admin
          </span>
        )}

        {email ? (
          <>
            <span style={{ fontSize: 12, color: '#666' }}>{email}</span>
            <LogoutButton />
          </>
        ) : (
          <>
            <Link href="/auth/login">Login</Link>
            <Link href="/auth/register">Register</Link>
          </>
        )}
      </div>
    </header>
  );
}
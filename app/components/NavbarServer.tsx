
// app/components/NavbarServer.tsx
import Link from 'next/link';
import { cookies } from 'next/headers';

async function getUserFromSession() {
  const cookieStore = cookies();
  const cookieHeader = cookieStore.toString();
  if (!cookieHeader) return null;
  const me = await fetch('http://127.0.0.1:3000/api/auth/me', {
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  });
  if (!me.ok) return null;
  try { return await me.json(); } catch { return null; }
}

export default async function NavbarServer() {
  const user = await getUserFromSession();
  return (
    <header
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: 12, padding: '10px 16px', borderBottom: '1px solid #e3e3e3',
        position: 'sticky', top: 0, background: '#fff', zIndex: 10,
      }}
    >
      <strong>D&D 5e Character Manager</strong>
      <nav style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Link href="/">Home</Link>
        <Link href="/homebrew">Homebrew</Link>
        {user ? (
          <>
            <Link href="/characters">Characters</Link>
            <form action="/api/auth/logout" method="post">
              <button type="submit" style={{ border: '1px solid #ccc', background: '#fafafa', padding: '4px 10px', borderRadius: 6, cursor: 'pointer' }}>Logout</button>
            </form>
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

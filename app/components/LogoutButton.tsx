// app/components/LogoutButton.tsx
'use client';

export default function LogoutButton() {
  async function onLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {
      // ignore errors; we'll still navigate away
    } finally {
      // Use a hard navigation so SSR re-runs with cleared cookies
      window.location.replace('/');
    }
  }

  return (
    <button onClick={onLogout} style={{ padding: '0.35rem 0.6rem' }}>
      Logout
    </button>
  );
}
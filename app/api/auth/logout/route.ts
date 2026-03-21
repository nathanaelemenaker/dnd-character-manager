// app/api/auth/logout/route.ts
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Clears all known auth/session cookies and returns { ok: true }.
 * Adjust names here if you add/remove cookies in the future.
 */
export async function POST() {
  const headers = new Headers();

  // Helper to append Set-Cookie headers that expire immediately
  function expireCookie(name: string) {
    headers.append(
      'Set-Cookie',
      `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
    );
  }

  // Clear any cookie the app might use for auth/session
  expireCookie('dnd_user_id');
  expireCookie('session_email');
  expireCookie('session'); // historical
  // If you previously experimented with next-auth, clear those too:
  expireCookie('next-auth.session-token');
  expireCookie('__Secure-next-auth.session-token');

  // Prevent caches from serving stale pages after logout
  headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  headers.set('Pragma', 'no-cache');

  return new NextResponse(JSON.stringify({ ok: true }), { status: 200, headers });
}

// Optional convenience for GET /api/auth/logout in a browser
export async function GET() {
  return POST();
}
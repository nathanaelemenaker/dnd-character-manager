// app/lib/auth.ts
import { cookies } from 'next/headers';

export type Session = { userId: string; email?: string } | null;

/**
 * Extracts session from HttpOnly cookies:
 *  - dnd_user_id: required (Prisma String cuid())
 *  - session_email: optional
 *
 * Returns null if no valid userId.
 */
export function getSession(): { userId: string; email?: string } | null {
  const jar = cookies();

  const rawUserId = jar.get('dnd_user_id')?.value ?? '';
  const userId = rawUserId.trim();
  if (!userId) return null;

  const rawEmail = jar.get('session_email')?.value ?? '';
  const email = rawEmail.trim();

  return email ? { userId, email } : { userId };
}
// lib/admin.ts
import { getSession } from '@/lib/auth';

export function isAdminUser(userId?: string, email?: string | null) {
  const list = (process.env.ADMIN_USER_IDS ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (userId && list.includes(userId)) return true;

  const domain = (process.env.ADMIN_EMAIL_DOMAIN ?? '').trim().toLowerCase();
  if (domain && email && email.toLowerCase().endsWith(`@${domain}`)) return true;

  return false;
}

export function requireAdmin() {
  const s = getSession();
  if (!s) return { ok: false as const, code: 401 };
  if (!isAdminUser(s.userId, s.email ?? null)) return { ok: false as const, code: 403 };
  return { ok: true as const, session: s };
}
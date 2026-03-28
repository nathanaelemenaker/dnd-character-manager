// lib/admin.ts
// Role logic now lives in lib/auth.ts. This file is kept for backward
// compatibility with any routes that import isAdminUser / requireAdmin directly.
export { requireAdmin, requireSuperAdmin, hasRole, resolveRole } from '@/lib/auth';

import { resolveRole } from '@/lib/auth';
import type { UserRole } from '@prisma/client';

/** Convenience check without a DB call — used in TopNav for UI-only decisions. */
export function isAdminUser(userId?: string, email?: string | null): boolean {
  if (!userId) return false;

  const ids = (process.env.ADMIN_USER_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.includes(userId)) return true;

  const domain = (process.env.ADMIN_EMAIL_DOMAIN ?? '').trim().toLowerCase();
  if (domain && email && email.toLowerCase().endsWith(`@${domain}`)) return true;

  return false;
}

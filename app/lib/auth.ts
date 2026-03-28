// lib/auth.ts
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import type { UserRole } from '@prisma/client';

export type Session = {
  userId: string;
  email: string;
  role: UserRole;
  isImpersonating: boolean;
  actorId: string; // the real logged-in user (same as userId unless impersonating)
} | null;

// ── Role helpers ──────────────────────────────────────────────────────────────

const ROLE_RANK: Record<UserRole, number> = { USER: 0, ADMIN: 1, SUPER_ADMIN: 2 };

export function hasRole(userRole: UserRole, required: UserRole): boolean {
  return ROLE_RANK[userRole] >= ROLE_RANK[required];
}

/** SUPER_ADMIN is always determined by env var, never the DB column. */
export function resolveRole(userId: string, dbRole: UserRole): UserRole {
  const ids = (process.env.ADMIN_USER_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.includes(userId)) return 'SUPER_ADMIN';

  // Email-domain shortcut still supported for ADMIN-level access
  // (checked separately in isAdminUser for backward compat)
  return dbRole;
}

// ── Session reading ───────────────────────────────────────────────────────────

/**
 * Reads the active session from cookies.
 * If an admin has started impersonation, returns the impersonated user's
 * identity for data operations, with actorId pointing at the real admin.
 */
export async function getSession(): Promise<Session> {
  const jar = cookies();
  const userId = jar.get('dnd_user_id')?.value?.trim();
  if (!userId) return null;

  // Load the real (actor) user from DB
  const actor = await prisma.user.findUnique({
    where: { id: userId, deletedAt: null },
    select: { id: true, email: true, role: true },
  });
  if (!actor) return null;

  const actorRole = resolveRole(actor.id, actor.role);

  // Check for impersonation cookie (only valid if actor is ADMIN+)
  const impersonateId = jar.get('impersonate')?.value?.trim();
  if (impersonateId && hasRole(actorRole, 'ADMIN')) {
    const target = await prisma.user.findUnique({
      where: { id: impersonateId, deletedAt: null },
      select: { id: true, email: true, role: true },
    });
    if (target) {
      return {
        userId: target.id,
        email: target.email,
        role: resolveRole(target.id, target.role),
        isImpersonating: true,
        actorId: actor.id,
      };
    }
  }

  return {
    userId: actor.id,
    email: actor.email,
    role: actorRole,
    isImpersonating: false,
    actorId: actor.id,
  };
}

/**
 * Synchronous session read — only userId + email from cookies, no DB call.
 * Use this where you don't need role (e.g. TopNav quick check, /api/auth/me).
 */
export function getSessionFast(): { userId: string; email: string } | null {
  const jar = cookies();
  const userId = jar.get('dnd_user_id')?.value?.trim();
  const email = jar.get('session_email')?.value?.trim();
  if (!userId || !email) return null;
  return { userId, email };
}

// ── Route guards ──────────────────────────────────────────────────────────────

export async function requireSession(): Promise<NonNullable<Session>> {
  const s = await getSession();
  if (!s) throw new Response('Unauthorized', { status: 401 });
  return s;
}

export async function requireAdmin(): Promise<NonNullable<Session>> {
  const s = await getSession();
  if (!s) throw new Response('Unauthorized', { status: 401 });
  // Use actorRole for admin checks — impersonated identity doesn't grant admin
  const actorRole = resolveRole(s.actorId, s.role);
  if (!hasRole(actorRole, 'ADMIN')) throw new Response('Forbidden', { status: 403 });
  return s;
}

export async function requireSuperAdmin(): Promise<NonNullable<Session>> {
  const s = await getSession();
  if (!s) throw new Response('Unauthorized', { status: 401 });
  if (!hasRole(s.role, 'SUPER_ADMIN')) throw new Response('Forbidden', { status: 403 });
  return s;
}

/**
 * Verifies the session user can access a character.
 * Admins can access any character; regular users only their own.
 */
export async function requireCharacterAccess(characterOwnerId: string): Promise<NonNullable<Session>> {
  const s = await getSession();
  if (!s) throw new Response('Unauthorized', { status: 401 });
  // Admin bypass uses the real actor's role, not the impersonated user
  const actorRole = resolveRole(s.actorId, s.role);
  if (hasRole(actorRole, 'ADMIN')) return s;
  if (s.userId !== characterOwnerId) throw new Response('Forbidden', { status: 403 });
  return s;
}

// ── Cookie helpers ────────────────────────────────────────────────────────────

const COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/',
};

export function setAuthCookies(res: { cookies: { set: Function } }, userId: string, email: string) {
  res.cookies.set('dnd_user_id', userId, COOKIE_OPTS);
  res.cookies.set('session_email', email, COOKIE_OPTS);
}

export function clearAuthCookies(res: { cookies: { set: Function } }) {
  const expire = { ...COOKIE_OPTS, maxAge: 0 };
  res.cookies.set('dnd_user_id', '', expire);
  res.cookies.set('session_email', '', expire);
  res.cookies.set('impersonate', '', expire);
}

export function setImpersonateCookie(res: { cookies: { set: Function } }, targetId: string) {
  res.cookies.set('impersonate', targetId, COOKIE_OPTS);
}

export function clearImpersonateCookie(res: { cookies: { set: Function } }) {
  res.cookies.set('impersonate', '', { ...COOKIE_OPTS, maxAge: 0 });
}

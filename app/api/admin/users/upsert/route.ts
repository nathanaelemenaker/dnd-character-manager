// app/api/admin/users/upsert/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

/**
 * POST body accepts one of:
 *  { id, email, name?, hashedPassword? }
 *  { email, name?, hashedPassword? }  // id will be created
 * If id exists -> update; else create. Email must be unique.
 */
export async function POST(req: NextRequest) {
  const gate = requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.code === 401 ? 'unauthorized' : 'forbidden' }, { status: gate.code });

  const b = await req.json().catch(() => null);
  if (!b || (!b.id && !b.email)) {
    return NextResponse.json({ error: 'provide_id_or_email' }, { status: 400 });
  }

  const id = b.id ? String(b.id) : undefined;
  const email = String(b.email ?? '').trim();
  if (!email) return NextResponse.json({ error: 'email_required' }, { status: 400 });

  const data = {
    email,
    name: b.name ?? null,
    hashedPassword: (b.hashedPassword && String(b.hashedPassword).trim()) || '!',
  };

  try {
    let user;
    if (id) {
      // Try update by id; if not found, create with specified id
      user = await prisma.user
        .update({ where: { id }, data })
        .catch(async () => prisma.user.create({ data: { id, ...data } }));
    } else {
      // Upsert by email
      user = await prisma.user.upsert({
        where: { email },
        update: data,
        create: data,
      });
    }

    return NextResponse.json(
      { ok: true, user: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt } },
      { status: 200 }
    );
  } catch (e) {
    console.error('POST /api/admin/users/upsert failed', e);
    return NextResponse.json({ error: 'upsert_failed' }, { status: 500 });
  }
}
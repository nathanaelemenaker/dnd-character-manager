// app/api/admin/items/check-srdkey/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

function normalizeSrdKey(input: string) {
  const s = (input ?? '').trim().toLowerCase();
  if (!s) return '';
  return s.replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '');
}

export async function GET(req: NextRequest) {
  const gate = requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.code === 401 ? 'unauthorized' : 'forbidden' }, { status: gate.code });

  const srdKeyRaw = req.nextUrl.searchParams.get('key') ?? '';
  const srdKey = normalizeSrdKey(srdKeyRaw);
  if (!srdKey) return NextResponse.json({ error: 'invalid_key' }, { status: 400 });

  const row = await prisma.itemDefinition.findUnique({ where: { srdKey }, select: { id: true } });
  return NextResponse.json({ exists: !!row }, { status: 200 });
}
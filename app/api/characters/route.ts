// app/api/characters/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function clampInt(n: unknown, min: number, max: number, d: number) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return d;
  return Math.max(min, Math.min(max, v));
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const items = await prisma.character.findMany({
      where: { ownerId: session.userId },
      orderBy: [{ updatedAt: 'desc' }],
      select: {
        id: true, name: true, level: true, ruleset: true, createdAt: true, updatedAt: true,
      },
    });
    return NextResponse.json({ items }, { status: 200 });
  } catch (e) {
    console.error('GET /characters error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const body = await req.json().catch(() => null);
    const rawName = (body?.name ?? '').toString().trim();
    const name = rawName || 'New Character';

    const rawRuleset = (body?.ruleset ?? '').toString().trim();
    const ruleset: 'SRD_2014' | 'SRD_2024' = rawRuleset === 'SRD_2024' ? 'SRD_2024' : 'SRD_2014';

    const level = clampInt(body?.level, 1, 20, 1);

    const created = await prisma.character.create({
      data: { ownerId: session.userId, name, ruleset, level },
      select: {
        id: true, name: true, level: true, ruleset: true, createdAt: true, updatedAt: true,
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e: any) {
    console.error('POST /characters error', e?.code ?? e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

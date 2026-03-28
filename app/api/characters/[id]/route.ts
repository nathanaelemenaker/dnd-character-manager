// app/api/characters/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type Ruleset = 'SRD_2014' | 'SRD_2024';
const ALLOWED_RULESETS: Ruleset[] = ['SRD_2014', 'SRD_2024'];

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export async function GET(
  _request: NextRequest,
  context: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id } = context.params;

  try {
    const character = await prisma.character.findFirst({
      where: { id, ownerId: session.userId },
      select: {
        id: true,
        name: true,
        level: true,
        ruleset: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!character) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    return NextResponse.json(character, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id } = context.params;

  try {
    const existing = await prisma.character.findFirst({
      where: { id, ownerId: session.userId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      ruleset?: Ruleset;
      level?: number;
    };

    const data: { name?: string; ruleset?: Ruleset; level?: number } = {};

    if (typeof body.name !== 'undefined') {
      const name = String(body.name ?? '').trim();
      if (!name) {
        return NextResponse.json({ error: 'invalid_name' }, { status: 400 });
      }
      data.name = name;
    }

    if (typeof body.ruleset !== 'undefined') {
      const r = String(body.ruleset) as Ruleset;
      if (!ALLOWED_RULESETS.includes(r)) {
        return NextResponse.json({ error: 'invalid_ruleset' }, { status: 400 });
      }
      data.ruleset = r;
    }

    if (typeof body.level !== 'undefined') {
      const lvl = Number.isFinite(Number(body.level)) ? clamp(Number(body.level), 1, 20) : undefined;
      if (typeof lvl === 'undefined') {
        return NextResponse.json({ error: 'invalid_level' }, { status: 400 });
      }
      data.level = lvl;
    }

    if (!('name' in data) && !('ruleset' in data) && !('level' in data)) {
      return NextResponse.json({ error: 'no_fields' }, { status: 400 });
    }

    const updated = await prisma.character.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        level: true,
        ruleset: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(updated, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id } = context.params;

  try {
    const existing = await prisma.character.findFirst({
      where: { id, ownerId: session.userId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    await prisma.character.delete({ where: { id } });

    // No content response is fine here
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
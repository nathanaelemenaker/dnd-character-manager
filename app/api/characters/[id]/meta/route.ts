// app/api/characters/[id]/meta/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function clampInt(n: unknown, min: number, max: number, def: number): number {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return def;
  return Math.max(min, Math.min(max, v));
}

const META_SELECT = {
  race: true, background: true, alignment: true, xp: true,
  ac: true, speed: true,
  hpCurrent: true, hpMax: true, hpTemp: true,
  inspiration: true, currency: true, bio: true, deathSaves: true,
  conditions: true,
  updatedAt: true,
} as const;

async function ensureOwner(characterId: string, userId: string) {
  const c = await prisma.character.findFirst({
    where: { id: characterId, ownerId: userId },
    select: { id: true },
  });
  return !!c;
}

export async function GET(
  _req: NextRequest,
  context: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const ok = await ensureOwner(context.params.id, session.userId);
  if (!ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  try {
    const c = await prisma.character.findUnique({
      where: { id: context.params.id },
      select: META_SELECT,
    });
    return NextResponse.json(c, { status: 200 });
  } catch (e) {
    console.error('GET /meta error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

/**
 * PUT /api/characters/[id]/meta
 *
 * Optimistic concurrency: client sends { _updatedAt: "<ISO>" } with every write.
 * If the server's updatedAt is more than 2 seconds newer, we return 409 with
 * the current data so the client can silently refresh instead of overwriting.
 */
export async function PUT(
  req: NextRequest,
  context: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const characterId = context.params.id;
  const ok = await ensureOwner(characterId, session.userId);
  if (!ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  try {
    const body = await req.json().catch(() => ({}));

    // ── Optimistic concurrency check ─────────────────────────────────────
    if (body._updatedAt) {
      const clientTs = new Date(body._updatedAt).getTime();
      if (!isNaN(clientTs)) {
        const current = await prisma.character.findUnique({
          where: { id: characterId },
          select: { updatedAt: true, ...META_SELECT },
        });
        if (!current) return NextResponse.json({ error: 'not_found' }, { status: 404 });
        const serverTs = new Date(current.updatedAt).getTime();
        // If server is more than 2s newer than what client knew about → conflict
        if (serverTs - clientTs > 2000) {
          console.log(`[meta] Conflict detected for ${characterId}: server=${current.updatedAt.toISOString()} client=${body._updatedAt}`);
          return NextResponse.json({ error: 'conflict', current }, { status: 409 });
        }
      }
    }

    // ── Build update payload ──────────────────────────────────────────────
    const data: Record<string, unknown> = {};

    if (typeof body.race === 'string')       data.race       = body.race.slice(0, 100);
    if (typeof body.background === 'string') data.background = body.background.slice(0, 100);
    if (typeof body.alignment === 'string')  data.alignment  = body.alignment.slice(0, 60);
    if (body.xp !== undefined)    data.xp    = clampInt(body.xp, 0, 9_999_999, 0);
    if (body.ac !== undefined)    data.ac    = clampInt(body.ac, 0, 99, 10);
    if (body.speed !== undefined) data.speed = clampInt(body.speed, 0, 999, 30);
    if (body.hpCurrent !== undefined) data.hpCurrent = clampInt(body.hpCurrent, 0, 9999, 0);
    if (body.hpMax !== undefined)     data.hpMax     = clampInt(body.hpMax, 1, 9999, 1);
    if (body.hpTemp !== undefined)    data.hpTemp    = clampInt(body.hpTemp, 0, 9999, 0);
    if (typeof body.inspiration === 'boolean') data.inspiration = body.inspiration;

    if (body.currency && typeof body.currency === 'object') {
      const cur: Record<string, number> = {};
      for (const k of ['cp', 'sp', 'ep', 'gp', 'pp']) {
        cur[k] = clampInt((body.currency as any)[k], 0, 9_999_999, 0);
      }
      data.currency = cur;
    }

    if (body.bio && typeof body.bio === 'object') {
      const allowed = ['age','height','weight','eyes','skin','hair',
        'backstory','personalityTraits','ideals','bonds','flaws'];
      const bio: Record<string, string> = {};
      for (const k of allowed) {
        if (typeof (body.bio as any)[k] === 'string') {
          bio[k] = ((body.bio as any)[k] as string).slice(0, 4000);
        }
      }
      data.bio = bio;
    }

    if (body.deathSaves && typeof body.deathSaves === 'object') {
      data.deathSaves = {
        successes: clampInt((body.deathSaves as any).successes, 0, 3, 0),
        failures:  clampInt((body.deathSaves as any).failures,  0, 3, 0),
      };
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'no_fields' }, { status: 400 });
    }

    const updated = await prisma.character.update({
      where: { id: characterId },
      data,
      select: META_SELECT,
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (e) {
    console.error('PUT /meta error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

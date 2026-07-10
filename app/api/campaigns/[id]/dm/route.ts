import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, hasRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/**
 * POST /api/campaigns/[id]/dm
 * DM-only: apply HP delta and/or condition changes to a character in this campaign.
 * Body: { characterId, hpDelta?, conditionOp?, conditions? }
 *   hpDelta: negative = damage (temp HP absorbed first), positive = heal
 *   conditionOp: 'add' | 'remove' | 'set' (default 'set')
 *   conditions: string[]
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const isAdmin = hasRole(session.role, 'ADMIN');
    if (!isAdmin) {
      const membership = await prisma.campaignMember.findUnique({
        where: { campaignId_userId: { campaignId: params.id, userId: session.userId } },
      });
      if (!membership || membership.role !== 'DM') {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
      }
    }

    const body = await req.json().catch(() => ({}));
    const { characterId, hpDelta, conditionOp, conditions } = body;

    if (!characterId || typeof characterId !== 'string') {
      return NextResponse.json({ error: 'characterId required' }, { status: 400 });
    }

    // Verify the character belongs to a PLAYER member of this campaign
    const member = await prisma.campaignMember.findFirst({
      where: { campaignId: params.id, characterId, role: 'PLAYER' },
    });
    if (!member) {
      return NextResponse.json({ error: 'character not in campaign' }, { status: 404 });
    }

    const character = await prisma.character.findUnique({
      where: { id: characterId },
      select: { hpCurrent: true, hpMax: true, hpTemp: true, conditions: true },
    });
    if (!character) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const data: Record<string, unknown> = {};

    if (typeof hpDelta === 'number' && Number.isFinite(hpDelta) && hpDelta !== 0) {
      let { hpCurrent, hpMax, hpTemp } = character;
      if (hpDelta < 0) {
        const dmg = Math.abs(hpDelta);
        if (hpTemp > 0) {
          const absorbed = Math.min(hpTemp, dmg);
          hpTemp = hpTemp - absorbed;
          hpCurrent = clamp(hpCurrent - (dmg - absorbed), 0, hpMax);
        } else {
          hpCurrent = clamp(hpCurrent - dmg, 0, hpMax);
        }
      } else {
        hpCurrent = clamp(hpCurrent + hpDelta, 0, hpMax);
      }
      data.hpCurrent = hpCurrent;
      data.hpTemp = hpTemp;
    }

    if (Array.isArray(conditions)) {
      const current = (character.conditions as string[]) ?? [];
      let next: string[];
      if (conditionOp === 'add') {
        next = [...new Set([...current, ...conditions])];
      } else if (conditionOp === 'remove') {
        next = current.filter((c: string) => !conditions.includes(c));
      } else {
        next = conditions;
      }
      data.conditions = next;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'nothing_to_update' }, { status: 400 });
    }

    const updated = await prisma.character.update({
      where: { id: characterId },
      data,
      select: {
        hpCurrent: true, hpMax: true, hpTemp: true,
        conditions: true, updatedAt: true,
        spellsKnown: {
          where: { prepared: true },
          select: { id: true, spellName: true, srdData: true },
        },
      },
    });

    const concentrationSpells = updated.spellsKnown.filter(
      (s) => (s.srdData as Record<string, unknown>)?.concentration === true
    );

    return NextResponse.json({
      hpCurrent: updated.hpCurrent,
      hpMax: updated.hpMax,
      hpTemp: updated.hpTemp,
      conditions: updated.conditions,
      updatedAt: updated.updatedAt.toISOString(),
      concentrating: concentrationSpells.length > 0,
      concentrationSpells: concentrationSpells.map((s) => ({ id: s.id, name: s.spellName })),
    });
  } catch (e) {
    console.error('POST /campaigns/[id]/dm error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

// app/api/characters/[id]/skills/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const SKILL_ABILITIES: Record<string, string> = {
  'Acrobatics': 'DEX', 'Animal Handling': 'WIS', 'Arcana': 'INT',
  'Athletics': 'STR', 'Deception': 'CHA', 'History': 'INT',
  'Insight': 'WIS', 'Intimidation': 'CHA', 'Investigation': 'INT',
  'Medicine': 'WIS', 'Nature': 'WIS', 'Perception': 'WIS',
  'Performance': 'CHA', 'Persuasion': 'CHA', 'Religion': 'INT',
  'Sleight of Hand': 'DEX', 'Stealth': 'DEX', 'Survival': 'WIS',
};

async function ensureOwner(characterId: string, userId: string) {
  const c = await prisma.character.findFirst({
    where: { id: characterId, ownerId: userId },
    select: { id: true },
  });
  return !!c;
}

/**
 * GET /api/characters/[id]/skills
 * Returns { skills: { [name]: { ability, proficiency } } }
 * Merges DB rows with the full skill list (defaults to 0 for any not yet saved).
 */
export async function GET(
  _req: NextRequest,
  context: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const ok = await ensureOwner(context.params.id, session.userId);
  if (!ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  try {
    const rows = await prisma.characterSkill.findMany({
      where: { characterId: context.params.id },
      select: { skillName: true, proficiency: true },
    });

    const stored = Object.fromEntries(rows.map((r) => [r.skillName, r.proficiency]));

    const skills: Record<string, { ability: string; proficiency: number }> = {};
    for (const [name, ability] of Object.entries(SKILL_ABILITIES)) {
      skills[name] = { ability, proficiency: stored[name] ?? 0 };
    }

    return NextResponse.json({ skills }, { status: 200 });
  } catch (e) {
    console.error('GET /skills error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

/**
 * PUT /api/characters/[id]/skills
 * Body: { skills: { [name]: 0 | 1 | 2 } }
 * Upserts only the skills present in the body.
 */
export async function PUT(
  req: NextRequest,
  context: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const ok = await ensureOwner(context.params.id, session.userId);
  if (!ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  try {
    const body = await req.json().catch(() => ({}));
    const incoming = body?.skills ?? {};

    if (typeof incoming !== 'object' || Array.isArray(incoming)) {
      return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
    }

    const upserts = Object.entries(incoming)
      .filter(([name]) => name in SKILL_ABILITIES)
      .map(([name, prof]) => {
        const proficiency = Math.max(0, Math.min(2, Math.floor(Number(prof))));
        return prisma.characterSkill.upsert({
          where: { characterId_skillName: { characterId: context.params.id, skillName: name } },
          update: { proficiency },
          create: { characterId: context.params.id, skillName: name, proficiency },
        });
      });

    if (upserts.length === 0) {
      return NextResponse.json({ error: 'no_valid_skills' }, { status: 400 });
    }

    await prisma.$transaction(upserts);

    // Return full merged state
    const rows = await prisma.characterSkill.findMany({
      where: { characterId: context.params.id },
      select: { skillName: true, proficiency: true },
    });
    const stored = Object.fromEntries(rows.map((r) => [r.skillName, r.proficiency]));
    const skills: Record<string, { ability: string; proficiency: number }> = {};
    for (const [name, ability] of Object.entries(SKILL_ABILITIES)) {
      skills[name] = { ability, proficiency: stored[name] ?? 0 };
    }

    return NextResponse.json({ skills }, { status: 200 });
  } catch (e) {
    console.error('PUT /skills error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

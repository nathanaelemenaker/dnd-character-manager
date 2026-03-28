// app/api/admin/characters/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdmin();
  } catch (e: any) {
    return NextResponse.json({ error: 'forbidden' }, { status: e?.status ?? 403 });
  }

  const characters = await prisma.character.findMany({
    select: {
      id: true,
      name: true,
      level: true,
      race: true,
      ruleset: true,
      updatedAt: true,
      owner: { select: { id: true, email: true, name: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  return NextResponse.json({ characters });
}

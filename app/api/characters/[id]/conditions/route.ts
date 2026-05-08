// app/api/characters/[id]/conditions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const char = await prisma.character.findFirst({
    where: { id: params.id, ownerId: session.userId },
    select: { id: true },
  });
  if (!char) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const { conditions } = await req.json();
  if (!Array.isArray(conditions)) return NextResponse.json({ error: 'invalid' }, { status: 400 });

  await prisma.character.update({
    where: { id: params.id },
    data: { conditions: conditions as any },
  });

  return NextResponse.json({ ok: true });
}

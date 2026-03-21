// app/api/admin/items/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export async function DELETE(_req: NextRequest, context: { params: { id: string } }) {
  const gate = requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.code === 401 ? 'unauthorized' : 'forbidden' }, { status: gate.code });

  try {
    await prisma.itemDefinition.delete({ where: { id: context.params.id } });
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: 'delete_failed' }, { status: 500 });
  }
}
``
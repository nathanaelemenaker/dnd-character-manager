// app/api/admin/ping/route.ts
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const gate = requireAdmin();
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, error: gate.code === 401 ? 'unauthorized' : 'forbidden' },
      { status: gate.code }
    );
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
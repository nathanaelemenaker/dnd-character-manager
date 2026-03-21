// app/api/admin/sync/items/dnd5e/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const gate = requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.code === 401 ? 'unauthorized' : 'forbidden' }, { status: gate.code });

  const url = new URL(req.url);
  const ruleset = url.searchParams.get('ruleset') ?? 'SRD_2014';

  const target = `http://127.0.0.1:3000/api/dev/sync/items/dnd5e?ruleset=${encodeURIComponent(ruleset)}`;

  const r = await fetch(target, {
    method: 'POST',
    headers: { Cookie: `dnd_user_id=${gate.session.userId}` },
  });

  const j = await r.json().catch(() => ({}));
  return NextResponse.json(j, { status: r.status });
}
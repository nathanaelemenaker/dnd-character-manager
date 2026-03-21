// app/api/admin/sync/items/dnd5e/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const gate = requireAdmin();
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, error: gate.code === 401 ? 'unauthorized' : 'forbidden' },
      { status: gate.code }
    );
  }

  try {
    const url = new URL(req.url);
    const ruleset = url.searchParams.get('ruleset') ?? 'SRD_2014';

    // Forward to dev sync route on the same server
    const target = `http://127.0.0.1:3000/api/dev/sync/items/dnd5e?ruleset=${encodeURIComponent(ruleset)}`;
    const r = await fetch(target, {
      method: 'POST',
      // Pass both cookies in case your getSession() expects email
      headers: {
        Cookie: [
          `dnd_user_id=${gate.session.userId}`,
          gate.session.email ? `session_email=${encodeURIComponent(gate.session.email)}` : '',
        ].filter(Boolean).join('; '),
        Accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
      },
    });

    const ctype = r.headers.get('content-type') || '';
    let body: any = null;
    try {
      body = ctype.includes('application/json') ? await r.json() : await r.text();
    } catch {
      body = null;
    }

    // Always return JSON so admin UI can show something meaningful
    return NextResponse.json(
      { ok: r.ok, status: r.status, contentType: ctype, body },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: 'proxy_failed', message: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}

// app/api/admin/sync/items/open5e/route.ts
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
    const docSlug = url.searchParams.get('docSlug') ?? '';
    const limit = url.searchParams.get('limit') ?? '100';
    const maxPages = url.searchParams.get('maxPages') ?? '50';

    const target =
      `http://127.0.0.1:3000/api/dev/sync/items/open5e?ruleset=${encodeURIComponent(ruleset)}` +
      (docSlug ? `&docSlug=${encodeURIComponent(docSlug)}` : '') +
      `&limit=${limit}&maxPages=${maxPages}`;

    const r = await fetch(target, {
      method: 'POST',
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
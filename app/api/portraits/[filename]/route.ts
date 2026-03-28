// app/api/portraits/[filename]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

type Params = { params: { filename: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  // Sanitize filename — only allow alphanumeric, hyphens, underscores, dots
  const filename = params.filename.replace(/[^a-zA-Z0-9._-]/g, '');
  if (!filename.endsWith('.webp')) {
    return new NextResponse('Not found', { status: 404 });
  }

  const filepath = path.join(process.cwd(), 'public', 'uploads', 'portraits', filename);
  if (!existsSync(filepath)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const buffer = await readFile(filepath);
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/lib/prisma';
import { getSession, hasRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string; sessionId: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const isAdmin = hasRole(session.role, 'ADMIN');
    const membership = await prisma.campaignMember.findUnique({
      where: { campaignId_userId: { campaignId: params.id, userId: session.userId } },
    });
    if (!isAdmin && !membership) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const log = await prisma.sessionLog.findUnique({
      where: { id: params.sessionId, campaignId: params.id },
      select: {
        sessionNumber: true,
        title: true,
        generatedOutput: true,
        rawTranscript: true,
        campaign: { select: { name: true } },
      },
    });
    if (!log) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const output = log.generatedOutput as Record<string, unknown> | null;
    let context = '';

    if (output) {
      const parts: string[] = [];
      if (output.sessionTitle) parts.push(`Current generated title: ${output.sessionTitle}`);
      if (output.summary) parts.push(`Summary: ${output.summary}`);
      if (output.epicMoment) parts.push(`Epic moment: ${output.epicMoment}`);
      if (Array.isArray(output.openThreads) && output.openThreads.length)
        parts.push(`Open threads: ${output.openThreads.join(', ')}`);
      if (output.quoteOfTheSession) parts.push(`Quote of the session: ${output.quoteOfTheSession}`);
      context = parts.join('\n');
    } else if (log.rawTranscript) {
      // First 2000 chars of transcript as a fallback
      context = `Raw transcript excerpt:\n${log.rawTranscript.slice(0, 2000)}`;
    }

    if (!context) {
      return NextResponse.json({ error: 'no_content' }, { status: 422 });
    }

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: `You are generating session title suggestions for a D&D campaign called "${log.campaign.name}", Session ${log.sessionNumber}.

${context}

Generate exactly 5 creative, evocative session titles. Titles should be punchy (3–7 words), capture the feel of what happened, and sound like a chapter heading from a fantasy novel or epic bard's tale. Vary the style — some dramatic, some witty, some ominous.

Respond with ONLY a JSON array of 5 strings, no explanation, no markdown. Example format:
["Title One", "Title Two", "Title Three", "Title Four", "Title Five"]`,
        },
      ],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : '';
    let suggestions: string[] = [];
    try {
      suggestions = JSON.parse(raw);
    } catch {
      // Try to extract array from response if there's extra text
      const match = raw.match(/\[[\s\S]*\]/);
      if (match) suggestions = JSON.parse(match[0]);
    }

    if (!Array.isArray(suggestions) || suggestions.length === 0) {
      return NextResponse.json({ error: 'parse_error' }, { status: 500 });
    }

    return NextResponse.json({ suggestions: suggestions.slice(0, 5) });
  } catch (e) {
    console.error('POST suggest-title error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

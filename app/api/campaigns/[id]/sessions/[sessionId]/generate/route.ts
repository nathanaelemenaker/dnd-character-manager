import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/lib/prisma';
import { getSession, hasRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function buildCampaignSystemPrompt(campaign: {
  name: string;
  description: string | null;
  members: Array<{
    role: string;
    user: { name: string | null; email: string };
    character: {
      name: string;
      level: number;
      classes: Array<{ classKey: string; level: number }>;
    } | null;
  }>;
}): string {
  const dm = campaign.members.find(m => m.role === 'DM');
  const players = campaign.members.filter(m => m.role === 'PLAYER');

  const partyLines = players.map(m => {
    const playerName = m.user.name ?? m.user.email;
    if (!m.character) return `  - ${playerName} (no character linked)`;
    const classStr = m.character.classes.map(c => `${c.classKey} ${c.level}`).join('/');
    return `  - ${playerName} plays ${m.character.name} (Level ${m.character.level} ${classStr})`;
  });

  return `You are an expert D&D 5e session chronicler. Analyze the raw session transcript and produce a structured JSON document capturing the key events of the session.

Campaign: ${campaign.name}${campaign.description ? `\nDescription: ${campaign.description}` : ''}
DM: ${dm ? (dm.user.name ?? dm.user.email) : 'Unknown'}

Party:
${partyLines.join('\n')}

You must respond with ONLY a valid JSON object — no markdown, no code fences, no preamble. The JSON must have exactly this structure:

{
  "summary": "A 2-4 paragraph narrative summary of what happened this session, written in an engaging chronicle style.",
  "combatLog": [
    {
      "title": "Short name for this encounter",
      "location": "Where it took place",
      "outcome": "victory | defeat | fled | mixed | avoided",
      "enemies": ["Enemy name", "..."],
      "highlights": ["Notable moments, critical hits, clever tactics, dramatic moments", "..."],
      "casualties": ["Any deaths or major injuries, or empty array if none"]
    }
  ],
  "partyStatus": [
    {
      "characterName": "Character's name",
      "playerName": "Player's name",
      "hpNotes": "Any HP changes, healing, or notable damage taken this session",
      "notableActions": "Key decisions, roleplay moments, or combat actions",
      "itemsAcquired": ["Item names, or empty array"],
      "levelUp": false,
      "xpOrMilestones": "Any XP gained or milestone achievements"
    }
  ]
}

If there were no combat encounters, return an empty array for combatLog. Include one partyStatus entry per party member even if they had minimal activity.`;
}

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

    const sessionLog = await prisma.sessionLog.findUnique({
      where: { id: params.sessionId, campaignId: params.id },
    });
    if (!sessionLog) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const campaign = await prisma.campaign.findUnique({
      where: { id: params.id },
      include: {
        members: {
          include: {
            user: { select: { name: true, email: true } },
            character: {
              select: {
                name: true, level: true,
                classes: { select: { classKey: true, level: true } },
              },
            },
          },
        },
      },
    });
    if (!campaign) return NextResponse.json({ error: 'campaign_not_found' }, { status: 404 });

    const systemPrompt = buildCampaignSystemPrompt(campaign);

    const message = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 4096,
      thinking: { type: 'adaptive' },
      system: [
        {
          type: 'text',
          text: systemPrompt,
          // @ts-ignore — cache_control is a valid beta field
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Session #${sessionLog.sessionNumber}${sessionLog.title ? ` — ${sessionLog.title}` : ''}\n\nHere is the raw session transcript:\n\n<transcript>\n${sessionLog.rawTranscript}\n</transcript>`,
        },
      ],
    });

    const textBlock = message.content.find(b => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'no_text_response' }, { status: 502 });
    }

    let generatedOutput: unknown;
    try {
      generatedOutput = JSON.parse(textBlock.text);
    } catch {
      console.error('Claude returned non-JSON:', textBlock.text.slice(0, 200));
      return NextResponse.json({ error: 'invalid_json_from_claude' }, { status: 502 });
    }

    const updated = await prisma.sessionLog.update({
      where: { id: params.sessionId },
      data: { generatedOutput: generatedOutput as any },
    });

    return NextResponse.json({ session: updated, generatedOutput });
  } catch (e) {
    console.error('POST generate error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

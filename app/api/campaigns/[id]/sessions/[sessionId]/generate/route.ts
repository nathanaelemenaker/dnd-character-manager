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
  notes: string;
  members: Array<{
    role: string;
    guestName: string | null;
    guestCharacterName: string | null;
    user: { name: string | null; email: string } | null;
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
    const playerName = m.guestName ?? m.user?.name ?? m.user?.email ?? 'Unknown';
    if (m.guestName) {
      const charName = m.guestCharacterName ?? 'unknown character';
      return `  - ${playerName} plays ${charName} (guest — no account yet)`;
    }
    if (!m.character) return `  - ${playerName} (no character linked)`;
    const classStr = m.character.classes.map(c => `${c.classKey} ${c.level}`).join('/');
    return `  - ${playerName} plays ${m.character.name} (Level ${m.character.level} ${classStr})`;
  });

  const notesSection = campaign.notes.trim()
    ? `\nCampaign Notes & Context:\n${campaign.notes.trim()}\n`
    : '';

  return `You are the official chronicler of ${campaign.name}${campaign.description ? ` — ${campaign.description}` : ''}. You write with the voice of a bard who was at the table for every moment — dramatic, colorful, and always ready to call out a heroic deed or a spectacular blunder. Your chronicles are what the players read before next session, so make them worth reading.

DM: ${dm ? (dm.guestName ?? dm.user?.name ?? dm.user?.email ?? 'Unknown') : 'Unknown'}

The Party:
${partyLines.join('\n')}
${notesSection}
Tone & Style:
- Write as if recounting a legend — vivid, exciting, opinionated
- Use proper D&D vocabulary (spell names, class abilities, conditions) when referenced in the transcript
- If something was funny, chaotic, or gloriously dumb, let that energy show
- Combat highlights should read like a sports announcer calling the play, not a police report
- Even factual fields should have a voice — avoid dry bullet points

You must respond with ONLY valid JSON — no markdown, no code fences, no preamble. The JSON must have exactly this structure:

{
  "sessionTitle": "A punchy, evocative title for this session — like a chapter heading or episode title. E.g., 'The Burning of Ashveil' or 'Three Kobolds and a Bad Idea'",
  "summary": "3–5 paragraphs written like a passage a bard would perform at a tavern. Be dramatic, specific, and vivid. Reference actual character names, places, and decisions from the transcript. Don't say 'the party fought enemies' — say who did what and why it mattered.",
  "epicMoment": "One paragraph, written cinematically, describing the single most dramatic or memorable moment of the session. No hedging — pick the best one and make it sing.",
  "combatLog": [
    {
      "title": "Short name for this encounter",
      "location": "Where it took place",
      "outcome": "victory | defeat | fled | mixed | avoided",
      "enemies": ["Enemy names"],
      "highlights": ["Each highlight is one vivid, exciting sentence — e.g., 'Kira opened with a Fireball that dropped three goblins and set the barn on fire, which nobody had planned for.'"],
      "casualties": ["Deaths or major injuries, or empty array"]
    }
  ],
  "partyStatus": [
    {
      "characterName": "Character's name",
      "playerName": "Player's name",
      "sessionMVP": false,
      "hpNotes": "HP changes — be specific where possible (e.g., 'dropped to 4 HP after the ogre's club, healed back to 22 by Mira's Prayer of Healing')",
      "notableActions": "What defined this character this session — key decisions, roleplay moments, big swings whether they landed or not",
      "itemsAcquired": ["Item names, or empty array"],
      "levelUp": false,
      "xpOrMilestones": "XP gained or milestone achievements"
    }
  ],
  "openThreads": [
    "Unresolved plot hooks, mysteries, looming threats, or open questions from this session — things the party should remember going into next time. 3–5 strings."
  ],
  "quoteOfTheSession": "The most memorable, funny, or dramatic thing said at the table. Attribute it: '\"I cast Fireball... into the tavern.\" — Kira'"
}

Rules:
- Set sessionMVP: true for exactly one party member — the one with the most impactful or memorable session
- If there were no combat encounters, return combatLog as an empty array
- Include one partyStatus entry per party member even if they had minimal activity
- openThreads should only include things clearly present in the transcript — do not invent plot
- quoteOfTheSession: if no clear memorable quote exists, use the most interesting thing said
- Use character names (not player names) as the primary identifier in narrative sections`;
}

function buildUserMessage(
  sessionLog: { sessionNumber: number; title: string | null; rawTranscript: string; corrections: string | null },
  previousSessions: Array<{ sessionNumber: number; title: string | null; generatedOutput: unknown }>
): string {
  const parts: string[] = [];

  if (previousSessions.length > 0) {
    parts.push('Previous Session Context (for continuity — do not re-summarize, use for background only):');
    for (const prev of previousSessions) {
      const output = prev.generatedOutput as { summary?: string } | null;
      const title = prev.title ? ` — ${prev.title}` : '';
      if (output?.summary) {
        parts.push(`\nSession #${prev.sessionNumber}${title}:\n${output.summary}`);
      }
    }
    parts.push('');
  }

  const sessionHeader = `Session #${sessionLog.sessionNumber}${sessionLog.title ? ` — ${sessionLog.title}` : ''}`;
  parts.push(`${sessionHeader}\n\nHere is the raw session transcript:\n\n<transcript>\n${sessionLog.rawTranscript}\n</transcript>`);

  if (sessionLog.corrections?.trim()) {
    parts.push(`\nDM Corrections — apply these throughout the entire generated output:\n${sessionLog.corrections.trim()}`);
  }

  return parts.join('\n');
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

    // Pull the 3 most recent prior sessions that have generated output
    const previousSessions = await prisma.sessionLog.findMany({
      where: {
        campaignId: params.id,
        sessionNumber: { lt: sessionLog.sessionNumber },
        generatedOutput: { not: null },
      },
      orderBy: { sessionNumber: 'desc' },
      take: 3,
      select: { sessionNumber: true, title: true, generatedOutput: true },
    });
    // Reverse so they're oldest → newest for the prompt
    previousSessions.reverse();

    const systemPrompt = buildCampaignSystemPrompt(campaign);
    const userMessage = buildUserMessage(sessionLog, previousSessions);

    const message = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 8192,
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
        { role: 'user', content: userMessage },
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

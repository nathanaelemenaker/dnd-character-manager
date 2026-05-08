import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SPELL_PROMPT = (name: string) => `
You are a D&D 5e rules expert. Look up the spell "${name}" from any official D&D 5e sourcebook
(including Xanathar's Guide, Tasha's Cauldron, Fizban's Treasury, Strixhaven, etc.).

Return ONLY a valid JSON object with these exact fields — no markdown, no explanation, just the JSON:
{
  "name": "exact spell name",
  "level": 0,
  "school": "one of: Abjuration, Conjuration, Divination, Enchantment, Evocation, Illusion, Necromancy, Transmutation",
  "castingTime": "e.g. 1 action",
  "range": "e.g. 60 feet",
  "duration": "e.g. Instantaneous",
  "ritual": false,
  "concentration": false,
  "components": "e.g. V, S, M (a pinch of sulfur)",
  "classes": "comma-separated class names e.g. Wizard, Sorcerer",
  "desc": "full spell description text"
}

If you don't recognize this as an official D&D 5e spell, return: {"error": "not_found"}
`.trim();

const ITEM_PROMPT = (name: string) => `
You are a D&D 5e rules expert. Look up the magic item or equipment "${name}" from any official
D&D 5e sourcebook (DMG, Xanathar's Guide, Tasha's Cauldron, etc.).

Return ONLY a valid JSON object with these exact fields — no markdown, no explanation, just the JSON:
{
  "name": "exact item name",
  "type": "e.g. Weapon, Armor, Wondrous Item, Ring, Staff, Wand, Rod, Potion, Scroll",
  "rarity": "one of: Common, Uncommon, Rare, Very Rare, Legendary, Artifact, or empty string for mundane",
  "requiresAttunement": false,
  "weight": 0,
  "cost": "e.g. 15 gp or empty string",
  "damage": "e.g. 1d8 piercing or empty string",
  "armorClass": "e.g. 14 + Dex or empty string",
  "desc": "full item description including all properties and mechanics"
}

If you don't recognize this as an official D&D 5e item, return: {"error": "not_found"}
`.trim();

const FEAT_PROMPT = (name: string) => `
You are a D&D 5e rules expert. Look up the feat, class feature, or racial trait "${name}" from any
official D&D 5e sourcebook (PHB, Xanathar's Guide, Tasha's Cauldron, etc.).

Return ONLY a valid JSON object with these exact fields — no markdown, no explanation, just the JSON:
{
  "name": "exact feat/feature name",
  "source": "e.g. Feat, Fighter 1, Ranger: Beast Master 3, PHB",
  "prereq": "prerequisite or empty string",
  "desc": "full description of all the feat/feature's benefits and mechanics"
}

If you don't recognize this as an official D&D 5e feat or class feature, return: {"error": "not_found"}
`.trim();

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const { type, name } = await req.json();

    if (!name?.trim() || !['spell', 'item', 'feat'].includes(type)) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }

    const prompt = type === 'spell' ? SPELL_PROMPT(name.trim()) : type === 'feat' ? FEAT_PROMPT(name.trim()) : ITEM_PROMPT(name.trim());

    const message = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content
      .filter(b => b.type === 'text')
      .map(b => (b as any).text)
      .join('');

    // Strip any accidental markdown fences
    const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ error: 'parse_error' }, { status: 502 });
    }

    if (parsed.error === 'not_found') {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    return NextResponse.json({ result: parsed, source: 'claude' });
  } catch (e: any) {
    console.error('[Claude SRD lookup error]', e?.message ?? e);
    return NextResponse.json({ error: 'internal_error', message: e?.message }, { status: 500 });
  }
}

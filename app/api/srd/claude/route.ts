// app/api/srd/claude/route.ts
// Claude AI lookup for D&D 5e content not in the SRD databases.
// Results are cached in the ClaudeCache table so every unique lookup
// only ever calls the API once. Pass force:true to regenerate.

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Cache key helpers ─────────────────────────────────────────────────────────
function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function guideKey(type: 'subclass_guide' | 'race_guide', ...parts: string[]) {
  return parts.map(slugify).join('-');
}

// ── Prompts ───────────────────────────────────────────────────────────────────

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

const MONSTER_PROMPT = (name: string) => `
You are a D&D 5e rules expert. Look up the monster or NPC "${name}" from any official D&D 5e
sourcebook (Monster Manual, Volo's Guide, Mordenkainen's, Tasha's, etc.).

Return ONLY a valid JSON object with these exact fields — no markdown, no explanation, just the JSON:
{
  "name": "exact monster name",
  "type": "e.g. Undead, Humanoid, Beast, Dragon, Fiend, Aberration",
  "size": "Tiny, Small, Medium, Large, Huge, or Gargantuan",
  "cr": "challenge rating as string, e.g. 1/4 or 5",
  "ac": 15,
  "hp": "e.g. 45 (7d8 + 14)",
  "speed": "e.g. 30 ft., fly 60 ft.",
  "str": 16, "dex": 12, "con": 14, "int": 10, "wis": 11, "cha": 8,
  "saves": "e.g. Con +4, Wis +2 or empty string",
  "skills": "e.g. Perception +4, Stealth +3 or empty string",
  "damageImmunities": "e.g. Fire, Poison or empty string",
  "damageResistances": "e.g. Bludgeoning, Piercing from nonmagical attacks or empty string",
  "conditionImmunities": "e.g. Charmed, Frightened or empty string",
  "senses": "e.g. Darkvision 60 ft., passive Perception 14",
  "languages": "e.g. Common, Draconic or —",
  "actions": "full text of Actions section",
  "traits": "full text of special traits/abilities",
  "legendaryActions": "full text of legendary actions or empty string",
  "source": "sourcebook and page, e.g. Monster Manual p. 317"
}

If you don't recognize this as an official D&D 5e monster or NPC, return: {"error": "not_found"}
`.trim();

// Always return full level 1–20 progression regardless of current level.
// The client highlights "received so far" based on character level.
const SUBCLASS_GUIDE_PROMPT = (className: string, subclassName: string) => `
You are a D&D 5e rules expert. List ALL subclass features for the ${className} (${subclassName})
subclass from levels 1 through 20. For each feature, give its level, name, and a clear description
of what it does mechanically.

Format your response as plain text (no JSON, no markdown headers), like this:
Level 3 — [Feature Name]
[Description of what it does]

Level 6 — [Feature Name]
[Description]

...and so on. Be concise but complete. Include all features from level 1 through level 20.
`.trim();

const RACE_GUIDE_PROMPT = (raceName: string) => `
You are a D&D 5e rules expert. List all racial traits for a ${raceName} character from any official
D&D 5e sourcebook (PHB, Mordenkainen's, Volo's Guide, etc.).

Format your response as plain text (no JSON, no markdown headers), like this:
[Trait Name]
[Description of what it does mechanically]

[Next Trait Name]
[Description]

Be concise but complete. Include all traits including subraces if applicable.
`.trim();

// ── DB cache helpers ──────────────────────────────────────────────────────────

async function cacheGet(type: string, key: string) {
  try {
    return await prisma.claudeCache.findUnique({
      where: { type_cacheKey: { type, cacheKey: key } },
    });
  } catch { return null; }
}

async function cacheSet(type: string, key: string, name: string, data: object) {
  try {
    await prisma.claudeCache.upsert({
      where: { type_cacheKey: { type, cacheKey: key } },
      create: { type, cacheKey: key, name, data: data as any },
      update: { name, data: data as any, updatedAt: new Date() },
    });
  } catch (e) {
    console.error('[ClaudeCache] save failed:', e);
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { type, force } = body;

    const VALID_TYPES = ['spell', 'item', 'feat', 'monster', 'subclass_guide', 'race_guide'];
    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }

    // ── Guide types (prose text responses) ───────────────────────────────────
    if (type === 'subclass_guide') {
      const { className, subclassName } = body;
      if (!className || !subclassName) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });

      const key = guideKey('subclass_guide', className, subclassName);

      if (!force) {
        const cached = await cacheGet('subclass_guide', key);
        if (cached) {
          const row = cached.data as any;
          return NextResponse.json({ result: { text: row.text }, source: 'cache', cachedAt: cached.updatedAt });
        }
      }

      const message = await client.messages.create({
        model: 'claude-opus-4-7',
        max_tokens: 2048,
        messages: [{ role: 'user', content: SUBCLASS_GUIDE_PROMPT(className, subclassName) }],
      });
      const text = message.content.filter(b => b.type === 'text').map(b => (b as any).text).join('');
      await cacheSet('subclass_guide', key, `${className} — ${subclassName}`, { text });
      return NextResponse.json({ result: { text }, source: 'claude' });
    }

    if (type === 'race_guide') {
      const { raceName } = body;
      if (!raceName) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });

      const key = slugify(raceName);

      if (!force) {
        const cached = await cacheGet('race_guide', key);
        if (cached) {
          const row = cached.data as any;
          return NextResponse.json({ result: { text: row.text }, source: 'cache', cachedAt: cached.updatedAt });
        }
      }

      const message = await client.messages.create({
        model: 'claude-opus-4-7',
        max_tokens: 1536,
        messages: [{ role: 'user', content: RACE_GUIDE_PROMPT(raceName) }],
      });
      const text = message.content.filter(b => b.type === 'text').map(b => (b as any).text).join('');
      await cacheSet('race_guide', key, raceName, { text });
      return NextResponse.json({ result: { text }, source: 'claude' });
    }

    // ── Structured JSON lookups (spell / item / feat / monster) ──────────────
    const { name } = body;
    if (!name?.trim()) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });

    const key = slugify(name.trim());

    if (!force) {
      const cached = await cacheGet(type, key);
      if (cached) {
        return NextResponse.json({ result: cached.data, source: 'cache', cachedAt: cached.updatedAt });
      }
    }

    const prompt =
      type === 'spell'   ? SPELL_PROMPT(name.trim()) :
      type === 'feat'    ? FEAT_PROMPT(name.trim()) :
      type === 'monster' ? MONSTER_PROMPT(name.trim()) :
      ITEM_PROMPT(name.trim());

    const message = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const rawText = message.content
      .filter(b => b.type === 'text')
      .map(b => (b as any).text)
      .join('');

    // Strip any accidental markdown fences
    const cleaned = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ error: 'parse_error' }, { status: 502 });
    }

    if (parsed.error === 'not_found') {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    // Save to DB cache — auto-saves regardless of what the user does next.
    // The result is now available to everyone without another Claude call.
    await cacheSet(type, key, parsed.name ?? name.trim(), parsed);

    return NextResponse.json({ result: parsed, source: 'claude' });
  } catch (e: any) {
    console.error('[Claude SRD lookup error]', e?.message ?? e);
    return NextResponse.json({ error: 'internal_error', message: e?.message }, { status: 500 });
  }
}

// app/characters/[id]/ItemAbilities.tsx
// Auto-parses item descriptions for key abilities, displays them in various contexts.
'use client';

import { useState } from 'react';

export interface InventoryItem {
  id: string;
  equipped: boolean;
  attuned: boolean;
  quantity: number;
  itemDef: {
    id: string;
    name: string;
    type: string | null;
    rarity: string | null;
    requiresAttunement: boolean | null;
    keyAbilities: string | null;
    text: string | null;
    weight: number | null;
  };
}

// ── Auto-parser ───────────────────────────────────────────────────────────────
export function parseKeyAbilities(text: string | null, name?: string | null): string {
  // Check name for self-describing bonuses like "Wand of the War Mage +1"
  const nameBonus: string[] = [];
  if (name) {
    const namePlusMatch = name.match(/\+(\d+)\s*$/);
    if (namePlusMatch) {
      const bonus = namePlusMatch[1];
      // Infer what the bonus applies to from item name keywords
      const lower = name.toLowerCase();
      if (lower.includes('wand') || lower.includes('staff') || lower.includes('rod')) {
        nameBonus.push(`+${bonus} spell attack rolls`);
      } else if (lower.includes('sword') || lower.includes('axe') || lower.includes('bow') ||
                 lower.includes('weapon') || lower.includes('dagger') || lower.includes('mace')) {
        nameBonus.push(`+${bonus} attack & damage rolls`);
      } else if (lower.includes('armor') || lower.includes('shield') || lower.includes('plate') ||
                 lower.includes('mail') || lower.includes('leather')) {
        nameBonus.push(`+${bonus} AC`);
      } else if (lower.includes('ring') || lower.includes('amulet') || lower.includes('cloak')) {
        nameBonus.push(`+${bonus} bonus`);
      } else {
        nameBonus.push(`+${bonus} bonus`);
      }
    }
  }

  if (!text && nameBonus.length) return nameBonus.join(' · ');
  if (!text) return '';

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const abilities: string[] = [];

  // Patterns to extract
  const patterns = [
    // +X bonus to attack/damage/spell/AC
    /\+(\d+)\s+bonus\s+to\s+([\w\s,/]+?)(?:\s+(?:roll|check|save)s?)?(?:\.|,|$)/gi,
    // grants a +X bonus
    /grants?\s+(?:a\s+)?\+(\d+)\s+(?:bonus\s+to\s+)?([\w\s]+?)(?:\.|,|$)/gi,
    // X charges
    /has\s+(\d+)\s+charges?/gi,
    // regains Xd6+X charges
    /regains?\s+(\d+d\d+(?:\s*[+-]\s*\d+)?)\s+(?:expended\s+)?charges?/gi,
    // resistance to X damage
    /(?:have|gain|you have)\s+resistance\s+to\s+([\w\s,]+?)\s+damage/gi,
    // immunity to X
    /immunity\s+to\s+([\w\s]+?)(?:\s+damage)?(?:\.|,|$)/gi,
    // advantage on X
    /advantage\s+on\s+([\w\s()]+?)\s+(?:saving\s+throws?|checks?|rolls?|attacks?)/gi,
    // +X to AC
    /\+(\d+)\s+(?:bonus\s+to\s+)?(?:your\s+)?(?:armor\s+class|AC)/gi,
    // speed increase
    /speed\s+(?:increases?|is\s+increased)\s+by\s+(\d+)/gi,
    // while holding/wielding/wearing — capture short feature name
    /^([\w\s]+(?:Form|Strike|Sense|Sight|Step|Ward|Armor|Shield|Aura|Breath))(?:\.|:|\s*$)/gm,
  ];

  const fullText = text;

  // Extract +X bonuses
  const bonusMatches = fullText.matchAll(/\+(\d+)\s+bonus\s+to\s+([\w\s,/&]+?)(?:\s+roll|\s+check|\s+save|\.|,|;|$)/gi);
  for (const m of bonusMatches) {
    const bonus = m[1];
    const what = m[2].trim().replace(/\s+/g, ' ');
    if (what.length < 60) abilities.push(`+${bonus} to ${what}`);
  }

  // Charges
  const chargeMatch = fullText.match(/has\s+(\d+)\s+charges?/i);
  if (chargeMatch) {
    abilities.push(`${chargeMatch[1]} charges`);
    const rechargeMatch = fullText.match(/regains?\s+([\d+d\s]+(?:at\s+dawn)?)/i);
    if (rechargeMatch) abilities.push(`recharges: ${rechargeMatch[1].trim().slice(0, 30)}`);
  }

  // Resistance
  const resistMatches = fullText.matchAll(/resistance\s+to\s+([\w\s,]+?)\s+damage/gi);
  for (const m of resistMatches) {
    const type = m[1].trim();
    if (type.length < 50) abilities.push(`Resistance: ${type} damage`);
  }

  // Advantage
  const advMatches = fullText.matchAll(/advantage\s+on\s+([\w\s()]+?)\s+(?:saving throws?|checks?|rolls?|attacks?)/gi);
  for (const m of advMatches) {
    const what = m[1].trim();
    if (what.length < 40) abilities.push(`Advantage: ${what}`);
  }

  // Named abilities (capitalized phrases that look like feature names)
  // Look for bold markdown or title lines
  const boldMatches = fullText.matchAll(/\*\*([\w][^\*]{2,40})\*\*/g);
  for (const m of boldMatches) {
    const name = m[1].trim();
    if (!name.match(/^\d/) && name.length < 50) abilities.push(name);
  }

  // Named section headers (e.g. "Tree Form." or "Spells." at start of sentence)
  const headerMatches = fullText.matchAll(/(?:^|\.\s+)([A-Z][a-zA-Z\s]{2,30})\.(?:\s+(?:While|You|When|As|The))/gm);
  for (const m of headerMatches) {
    const name = m[1].trim();
    if (!abilities.includes(name) && name.split(' ').length <= 4) abilities.push(name);
  }

  // Deduplicate and limit
  const seen = new Set<string>();
  return [...nameBonus, ...abilities]
    .filter(a => {
      const key = a.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return a.length > 2 && a.length < 80;
    })
    .slice(0, 8)
    .join(' · ');
}

// ── Rarity color ──────────────────────────────────────────────────────────────
function rarityColor(rarity: string | null): string {
  switch (rarity) {
    case 'Legendary': return '#b8860b';
    case 'Very Rare': return '#7b3fa0';
    case 'Rare':      return '#1a6b9a';
    case 'Uncommon':  return '#2e7d32';
    default:          return 'var(--border)';
  }
}

// ── Key Abilities Editor (inline in inventory expanded view) ──────────────────
export function KeyAbilitiesEditor({ item, onSave }: {
  item: InventoryItem;
  onSave: (itemId: string, keyAbilities: string) => Promise<void>;
}) {
  const parsed = parseKeyAbilities(item.itemDef.text, item.itemDef.name);
  const current = item.itemDef.keyAbilities ?? parsed;
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(current);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await onSave(item.id, val);
    setSaving(false);
    setEditing(false);
  }

  if (!editing) {
    return (
      <div style={{ marginTop: 6 }}>
        {current ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <div style={{ fontSize: 11, color: 'var(--ink)', lineHeight: 1.5,
              background: 'rgba(201,162,39,0.08)', border: '1px solid var(--gold)',
              borderRadius: 3, padding: '3px 7px', flex: 1 }}>
              ✦ {current}
            </div>
            <button onClick={() => { setVal(current); setEditing(true); }}
              style={{ fontSize: 10, color: 'var(--gold)', background: 'none',
                border: 'none', cursor: 'pointer', flexShrink: 0, fontStyle: 'italic' }}>
              edit
            </button>
          </div>
        ) : (
          <button onClick={() => { setVal(parsed || ''); setEditing(true); }}
            style={{ fontSize: 11, color: 'var(--gold)', background: 'none',
              border: 'none', cursor: 'pointer', fontStyle: 'italic' }}>
            + add key abilities
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ fontSize: 10, color: 'var(--border)', fontStyle: 'italic', marginBottom: 3 }}>
        Auto-parsed from description — edit to summarize key abilities:
      </div>
      <textarea
        value={val}
        onChange={e => setVal(e.target.value)}
        rows={2}
        style={{ width: '100%', resize: 'vertical', fontFamily: 'var(--font-body)',
          fontSize: 12, padding: '4px 6px' }}
        placeholder="+2 attack & damage · +2 spell attack · 10 charges · Tree Form"
        autoFocus
      />
      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <button className="ink-btn" style={{ fontSize: 11 }}
          onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button className="ink-btn ghost" style={{ fontSize: 11 }}
          onClick={() => setEditing(false)}>
          Cancel
        </button>
        {parsed && val !== parsed && (
          <button className="ink-btn ghost" style={{ fontSize: 11 }}
            onClick={() => setVal(parsed)}>
            Reset to auto
          </button>
        )}
      </div>
    </div>
  );
}

// ── Active Item Effects panel (top of Inventory tab) ─────────────────────────
export function ActiveItemEffects({ inventory }: { inventory: InventoryItem[] }) {
  const equipped = inventory.filter(i => i.equipped);
  if (!equipped.length) return null;

  return (
    <div style={{ background: 'var(--section-bg)', border: '1.5px solid var(--gold)',
      borderRadius: 4, marginBottom: 10, overflow: 'hidden' }}>
      <div style={{ background: 'var(--ink)', color: 'var(--gold-light)',
        fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700,
        letterSpacing: 1.5, textTransform: 'uppercase', padding: '5px 10px' }}>
        Active Item Effects
      </div>
      <div style={{ padding: 8 }}>
        {equipped.map(it => {
          const abilities = it.itemDef.keyAbilities || parseKeyAbilities(it.itemDef.text, it.itemDef.name);
          if (!abilities) return null;
          return (
            <div key={it.id} style={{ display: 'flex', gap: 8, padding: '4px 0',
              borderBottom: '0.5px solid var(--parchment-dark)', alignItems: 'flex-start' }}>
              <div style={{ flexShrink: 0 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 11,
                  fontWeight: 600, color: 'var(--ink)' }}>{it.itemDef.name}</div>
                {it.itemDef.rarity && (
                  <div style={{ fontSize: 9, color: rarityColor(it.itemDef.rarity),
                    fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                    {it.itemDef.rarity}
                    {it.attuned ? ' · ✦' : ''}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-light)', lineHeight: 1.5, flex: 1 }}>
                {abilities}
              </div>
            </div>
          );
        })}
        {equipped.every(it => !(it.itemDef.keyAbilities || parseKeyAbilities(it.itemDef.text))) && (
          <div style={{ fontSize: 11, color: 'var(--border)', fontStyle: 'italic' }}>
            No ability summaries yet — expand an item to add them.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Overview card (compact, for Overview tab) ─────────────────────────────────
export function EquippedItemsCard({ inventory, onNavigate }: {
  inventory: InventoryItem[];
  onNavigate: () => void;
}) {
  const equipped = inventory.filter(i => i.equipped);
  if (!equipped.length) return null;

  return (
    <div style={{ background: 'var(--section-bg)', border: '1.5px solid var(--border-light)',
      borderRadius: 4, overflow: 'hidden', marginBottom: 10 }}>
      <div onClick={onNavigate}
        style={{ background: 'var(--ink)', color: 'var(--gold-light)',
          fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700,
          letterSpacing: 1.5, textTransform: 'uppercase', padding: '5px 10px',
          cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
        Equipped Items <span style={{ fontWeight: 400 }}>›</span>
      </div>
      <div style={{ padding: 8 }}>
        {equipped.map(it => {
          const abilities = it.itemDef.keyAbilities || parseKeyAbilities(it.itemDef.text, it.itemDef.name);
          return (
            <div key={it.id} style={{ padding: '3px 0',
              borderBottom: '0.5px solid var(--parchment-dark)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 11,
                  fontWeight: 600 }}>{it.itemDef.name}</span>
                {it.itemDef.rarity && (
                  <span style={{ fontSize: 9, color: rarityColor(it.itemDef.rarity),
                    fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                    {it.itemDef.rarity}
                  </span>
                )}
                {it.attuned && (
                  <span style={{ fontSize: 9, color: '#7b3fa0',
                    fontFamily: 'var(--font-display)', fontWeight: 700 }}>✦</span>
                )}
              </div>
              {abilities && (
                <div style={{ fontSize: 10, color: 'var(--ink-light)',
                  lineHeight: 1.4, marginTop: 1 }}>
                  {abilities}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Combat bonuses (for Combat tab) ──────────────────────────────────────────
const COMBAT_PATTERNS = [
  /\+\d+\s+(?:bonus\s+to\s+)?(?:attack|damage|spell attack|spell save DC|AC|armor class)/i,
  /resistance\s+to/i,
  /advantage\s+on\s+(?:attack|saving)/i,
  /extra\s+\d+d\d+/i,
  /immunity\s+to/i,
];

function isCombatRelevant(abilities: string): boolean {
  return COMBAT_PATTERNS.some(p => p.test(abilities));
}

export function CombatItemBonuses({ inventory }: { inventory: InventoryItem[] }) {
  const relevant = inventory.filter(it => {
    if (!it.equipped) return false;
    const abilities = it.itemDef.keyAbilities || parseKeyAbilities(it.itemDef.text, it.itemDef.name);
    return abilities && isCombatRelevant(abilities);
  });

  if (!relevant.length) return null;

  return (
    <div style={{ background: 'var(--section-bg)', border: '1.5px solid var(--border-light)',
      borderRadius: 4, overflow: 'hidden', marginBottom: 10 }}>
      <div style={{ background: 'var(--ink)', color: 'var(--gold-light)',
        fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700,
        letterSpacing: 1.5, textTransform: 'uppercase', padding: '5px 10px' }}>
        Item Bonuses Active
      </div>
      <div style={{ padding: '6px 10px' }}>
        {relevant.map(it => {
          const abilities = it.itemDef.keyAbilities || parseKeyAbilities(it.itemDef.text, it.itemDef.name);
          return (
            <div key={it.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline',
              padding: '2px 0', fontSize: 11 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 10,
                fontWeight: 700, color: 'var(--border)', flexShrink: 0,
                minWidth: 80 }}>{it.itemDef.name}</span>
              <span style={{ color: 'var(--ink-light)' }}>{abilities}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

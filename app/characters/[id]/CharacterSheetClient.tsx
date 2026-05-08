// app/characters/[id]/CharacterSheetClient.tsx
'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import LevelUpModal, { LevelUpResult } from './LevelUpModal';
import {
  KeyAbilitiesEditor, ActiveItemEffects, EquippedItemsCard,
  CombatItemBonuses, parseKeyAbilities,
} from './ItemAbilities';
import ClassGuideTab from './ClassGuideTab';
import styles from './sheet.module.css';

// ── Types ──────────────────────────────────────────────────────────────────
type Ruleset   = 'SRD_2014' | 'SRD_2024';
type AbilityKey = 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';
type ProfLevel  = 0 | 1 | 2;

export interface CharacterProp {
  id: string; name: string; level: number; ruleset: Ruleset;
  race: string; background: string; alignment: string; xp: number;
  ac: number; speed: number;
  hpCurrent: number; hpMax: number; hpTemp: number;
  inspiration: boolean;
  portrait?: string | null;
  currency: Record<string, number>;
  bio: Record<string, string>;
  deathSaves: { successes: number; failures: number };
  updatedAt?: string;
}

interface ItemDef {
  id: string; srdKey: string | null; name: string; type: string | null;
  weight: number | null; rarity: string | null;
  requiresAttunement: boolean | null; keyAbilities: string | null; text: string | null;
}
interface InventoryItem {
  id: string; quantity: number; attuned: boolean; equipped: boolean;
  notes: string | null; containerId: string | null; itemDef: ItemDef;
}
interface Spell {
  id?: string; name: string; level: number; school: string; prepared: boolean;
  castingTime: string; range: string; duration: string;
  ritual: boolean; concentration: boolean; components: string; classes: string; desc: string;
}
interface Feature { id?: string; name: string; source: string; desc: string; }
interface CharClass { id?: string; name: string; subclass: string; subclassNotes?: string; level: number; hitDie: number; }
interface SpellSlot { level: number; max: number; used: number; }

interface SheetState {
  name: string; race: string; background: string; alignment: string;
  xp: number; level: number; ruleset: Ruleset;
  classes: CharClass[];
  portrait: string | null;
  abilities: Record<AbilityKey, number>;
  hp: { current: number; max: number; temp: number };
  deathSaves: { successes: number; failures: number };
  ac: number; speed: number; proficiencyBonus: number; inspiration: boolean;
  skills: Record<string, { ability: AbilityKey; prof: ProfLevel }>;
  saves: Record<AbilityKey, boolean>;
  spellSlots: SpellSlot[];
  spells: Spell[];
  inventory: InventoryItem[];
  currency: Record<string, number>;
  features: Feature[];
  bio: Record<string, string>;
  _updatedAt: string; // ISO timestamp from server for concurrency control
}

type Action =
  | { type: 'SET'; payload: Partial<SheetState> }
  | { type: 'SET_ABILITY'; key: AbilityKey; value: number }
  | { type: 'TOGGLE_SAVE'; key: AbilityKey }
  | { type: 'CYCLE_SKILL'; name: string }
  | { type: 'ADJUST_HP'; delta: number }
  | { type: 'TOGGLE_DS'; kind: 'success' | 'failure'; idx: number }
  | { type: 'TOGGLE_SLOT'; level: number; idx: number }
  | { type: 'ADD_SLOT'; level: number }
  | { type: 'ADD_SPELL'; spell: Spell }
  | { type: 'REMOVE_SPELL'; id: string }
  | { type: 'TOGGLE_PREPARED'; id: string }
  | { type: 'ADD_INVENTORY'; item: InventoryItem }
  | { type: 'UPDATE_INVENTORY'; id: string; patch: Partial<InventoryItem> }
  | { type: 'REMOVE_INVENTORY'; id: string }
  | { type: 'ADD_FEATURE'; feature: Feature }
  | { type: 'REMOVE_FEATURE'; id: string }
  | { type: 'SET_CLASSES'; classes: CharClass[] }
  | { type: 'LONG_REST' }
  | { type: 'SHORT_REST' }
  | { type: 'SET_UPDATED_AT'; ts: string };

function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }
function profBonusForLevel(level: number) { return Math.ceil(level / 4) + 1; }
const SKILL_ABILITIES: Record<string, AbilityKey> = {
  'Acrobatics':'DEX','Animal Handling':'WIS','Arcana':'INT','Athletics':'STR',
  'Deception':'CHA','History':'INT','Insight':'WIS','Intimidation':'CHA',
  'Investigation':'INT','Medicine':'WIS','Nature':'WIS','Perception':'WIS',
  'Performance':'CHA','Persuasion':'CHA','Religion':'INT',
  'Sleight of Hand':'DEX','Stealth':'DEX','Survival':'WIS',
};

function buildInitialState(
  c: CharacterProp,
  abilities: Record<AbilityKey, number>,
  skillMap: Record<string, number>,
  saveMap: Record<string, boolean>,
  classes: CharClass[],
  spells: Spell[],
  slots: SpellSlot[],
  inventory: InventoryItem[],
  features: Feature[],
): SheetState {
  const skills: SheetState['skills'] = {};
  for (const [name, ability] of Object.entries(SKILL_ABILITIES)) {
    skills[name] = { ability, prof: (clamp(skillMap[name] ?? 0, 0, 2) as ProfLevel) };
  }
  const saves = { STR: false, DEX: false, CON: false, INT: false, WIS: false, CHA: false } as Record<AbilityKey, boolean>;
  for (const k of Object.keys(saves) as AbilityKey[]) saves[k] = saveMap[k] ?? false;

  return {
    name: c.name, race: c.race, background: c.background, alignment: c.alignment,
    xp: c.xp, level: c.level, ruleset: c.ruleset,
    classes: classes.length > 0 ? classes : [{ name: 'Fighter', subclass: '', level: c.level, hitDie: 10 }],
    portrait: c.portrait ?? null,
    abilities,
    hp: { current: c.hpCurrent, max: c.hpMax, temp: c.hpTemp },
    deathSaves: c.deathSaves,
    ac: c.ac, speed: c.speed, proficiencyBonus: profBonusForLevel(c.level),
    inspiration: c.inspiration,
    skills, saves, spellSlots: slots, spells, inventory, features,
    currency: c.currency,
    bio: c.bio,
    _updatedAt: c.updatedAt ?? new Date().toISOString(),
  };
}

function reducer(state: SheetState, action: Action): SheetState {
  switch (action.type) {
    case 'SET': return { ...state, ...action.payload };
    case 'SET_ABILITY': return { ...state, abilities: { ...state.abilities, [action.key]: clamp(action.value, 1, 30) } };
    case 'TOGGLE_SAVE': return { ...state, saves: { ...state.saves, [action.key]: !state.saves[action.key] } };
    case 'CYCLE_SKILL': {
      const sk = state.skills[action.name];
      if (!sk) return state;
      return { ...state, skills: { ...state.skills, [action.name]: { ...sk, prof: ((sk.prof + 1) % 3) as ProfLevel } } };
    }
    case 'ADJUST_HP': return { ...state, hp: { ...state.hp, current: clamp(state.hp.current + action.delta, 0, state.hp.max) } };
    case 'TOGGLE_DS': {
      const ds = { ...state.deathSaves };
      const k = action.kind === 'success' ? 'successes' : 'failures';
      ds[k] = ds[k] > action.idx ? action.idx : action.idx + 1;
      return { ...state, deathSaves: ds };
    }
    case 'TOGGLE_SLOT': return { ...state, spellSlots: state.spellSlots.map((s) => s.level === action.level ? { ...s, used: action.idx < s.used ? action.idx : action.idx + 1 } : s) };
    case 'ADD_SLOT': return { ...state, spellSlots: state.spellSlots.map((s) => s.level === action.level ? { ...s, max: s.max + 1 } : s) };
    case 'ADD_SPELL': return { ...state, spells: [...state.spells, action.spell] };
    case 'REMOVE_SPELL': return { ...state, spells: state.spells.filter((s) => s.id !== action.id) };
    case 'TOGGLE_PREPARED': return { ...state, spells: state.spells.map((s) => s.id === action.id ? { ...s, prepared: !s.prepared } : s) };
    case 'ADD_INVENTORY': return { ...state, inventory: [action.item, ...state.inventory] };
    case 'UPDATE_INVENTORY': return { ...state, inventory: state.inventory.map((it) => it.id === action.id ? { ...it, ...action.patch } : it) };
    case 'REMOVE_INVENTORY': return { ...state, inventory: state.inventory.filter((it) => it.id !== action.id) };
    case 'ADD_FEATURE': return { ...state, features: [...state.features, action.feature] };
    case 'REMOVE_FEATURE': return { ...state, features: state.features.filter((f) => f.id !== action.id) };
    case 'SET_CLASSES': return { ...state, classes: action.classes };
    case 'LONG_REST': return { ...state, hp: { ...state.hp, current: state.hp.max, temp: 0 }, deathSaves: { successes: 0, failures: 0 }, spellSlots: state.spellSlots.map((s) => ({ ...s, used: 0 })) };
    case 'SHORT_REST': return { ...state, deathSaves: { successes: 0, failures: 0 } };
    case 'SET_UPDATED_AT': return { ...state, _updatedAt: action.ts };
    default: return state;
  }
}

function fmtMod(n: number) { return (n >= 0 ? '+' : '') + n; }

// ── Debounced save hook ────────────────────────────────────────────────────
// Uses a stable ref so the fn is always current and timer never resets on re-render.
function useDebounced<T>(fn: (val: T) => Promise<unknown> | void, delay: number) {
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback((val: T) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fnRef.current(val), delay);
  }, [delay]);
}

// ── Main component ────────────────────────────────────────────────────────
export default function CharacterSheetClient({
  character, initialAbilities, initialSkills, initialSaves,
  initialClasses, initialSpells, initialSlots, initialInventory, initialFeatures,
}: {
  character: CharacterProp;
  initialAbilities: Record<AbilityKey, number>;
  initialSkills: Record<string, number>;
  initialSaves: Record<string, boolean>;
  initialClasses: CharClass[];
  initialSpells: Spell[];
  initialSlots: SpellSlot[];
  initialInventory: InventoryItem[];
  initialFeatures: Feature[];
}) {
  const router = useRouter();
  const cid = character.id;
  const [state, dispatch] = useReducer(reducer, buildInitialState(
    character, initialAbilities, initialSkills, initialSaves,
    initialClasses, initialSpells, initialSlots, initialInventory, initialFeatures,
  ));
  const [tab, setTab] = useState('overview');
  const [hpDelta, setHpDelta] = useState(1);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const prevLevelRef = useRef(state.level);

  // ── Re-fetch on page focus / visibility restore ───────────────────────
  // Prevents a stale tab from clobbering newer data when it wakes up.
  useEffect(() => {
    async function refreshMeta() {
      try {
        const res = await fetch(`/api/characters/${cid}/meta`, {
          credentials: 'include',
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (!res.ok) return;
        const d = await res.json();
        dispatch({ type: 'SET', payload: {
          race: d.race ?? '',
          background: d.background ?? '',
          alignment: d.alignment ?? '',
          xp: d.xp ?? 0,
          ac: d.ac ?? 10,
          speed: d.speed ?? 30,
          hp: { current: d.hpCurrent ?? 0, max: d.hpMax ?? 1, temp: d.hpTemp ?? 0 },
          inspiration: d.inspiration ?? false,
          currency: d.currency ?? { cp:0,sp:0,ep:0,gp:0,pp:0 },
          bio: d.bio ?? {},
          deathSaves: d.deathSaves ?? { successes: 0, failures: 0 },
          _updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : new Date().toISOString(),
        }});
      } catch { /* silently ignore */ }
    }
    function onVisible() {
      if (document.visibilityState === 'visible') refreshMeta();
    }
    function onFocus() { refreshMeta(); }
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, [cid]);

  // ── Detect level-up ───────────────────────────────────────────────────
  useEffect(() => {
    if (state.level > prevLevelRef.current) {
      setShowLevelUp(true);
    }
    prevLevelRef.current = state.level;
  }, [state.level]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const mods = useMemo(() => {
    const out = {} as Record<AbilityKey, number>;
    (['STR','DEX','CON','INT','WIS','CHA'] as AbilityKey[]).forEach((k) => { out[k] = Math.floor((state.abilities[k] - 10) / 2); });
    return out;
  }, [state.abilities]);

  function skillMod(name: string) {
    const sk = state.skills[name];
    if (!sk) return 0;
    return mods[sk.ability] + (sk.prof === 1 ? state.proficiencyBonus : sk.prof === 2 ? state.proficiencyBonus * 2 : 0);
  }
  function saveMod(ab: AbilityKey) { return mods[ab] + (state.saves[ab] ? state.proficiencyBonus : 0); }
  const totalWeight = useMemo(() => state.inventory.reduce((s, i) => s + (i.itemDef.weight ?? 0) * i.quantity, 0), [state.inventory]);
  const hpPct = clamp(Math.round((state.hp.current / state.hp.max) * 100), 0, 100);
  const abs: AbilityKey[] = ['STR','DEX','CON','INT','WIS','CHA'];

  // ── API helpers ───────────────────────────────────────────────────────────
  const api = useCallback(async (path: string, method: string, body?: unknown) => {
    const res = await fetch(`/api/characters/${cid}${path}`, {
      method, credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    // 409 = stale client — silently refresh from server data
    if (res.status === 409) {
      try {
        const { current } = await res.json();
        if (current) {
          dispatch({ type: 'SET', payload: {
            race: current.race ?? '',
            background: current.background ?? '',
            alignment: current.alignment ?? '',
            xp: current.xp ?? 0,
            ac: current.ac ?? 10,
            speed: current.speed ?? 30,
            hp: { current: current.hpCurrent ?? 0, max: current.hpMax ?? 1, temp: current.hpTemp ?? 0 },
            inspiration: current.inspiration ?? false,
            currency: current.currency ?? { cp:0,sp:0,ep:0,gp:0,pp:0 },
            bio: current.bio ?? {},
            deathSaves: current.deathSaves ?? { successes: 0, failures: 0 },
            _updatedAt: current.updatedAt ? new Date(current.updatedAt).toISOString() : new Date().toISOString(),
          }});
        }
      } catch { /* ignore */ }
      return res;
    }
    if (!res.ok && res.status !== 204) console.error(`API ${method} ${path} failed:`, res.status);
    // On successful meta save, update our local updatedAt reference
    if (res.ok && path === '/meta' && method === 'PUT') {
      try {
        const d = await res.clone().json();
        if (d.updatedAt) dispatch({ type: 'SET_UPDATED_AT', ts: new Date(d.updatedAt).toISOString() });
      } catch { /* ignore */ }
    }
    return res;
  }, [cid, dispatch]);

  // ── Debounced saves ───────────────────────────────────────────────────────
  // Each gets its own timer so they don't cancel each other out.
  const saveMetaHp      = useDebounced((data: unknown) => api('/meta', 'PUT', data), 400);
  const saveMetaCombat  = useDebounced((data: unknown) => api('/meta', 'PUT', data), 600);
  const saveMetaBio     = useDebounced((data: unknown) => api('/meta', 'PUT', data), 800);
  const saveMetaCurrency= useDebounced((data: unknown) => api('/meta', 'PUT', data), 600);
  const saveMetaDs      = useDebounced((data: unknown) => api('/meta', 'PUT', data), 300);
  // Convenience wrapper — auto-routes to the right debounced fn based on keys.
  // Injects _updatedAt so the server can detect stale writes.
  const stateRef = useRef(state);
  stateRef.current = state;
  const saveMeta = useCallback((data: Record<string, unknown>) => {
    const payload = { ...data, _updatedAt: stateRef.current._updatedAt };
    const keys = Object.keys(data);
    if (keys.some(k => ['hpCurrent','hpMax','hpTemp'].includes(k))) return saveMetaHp(payload);
    if (keys.some(k => ['ac','speed'].includes(k))) return saveMetaCombat(payload);
    if (keys.some(k => ['deathSaves'].includes(k))) return saveMetaDs(payload);
    if (keys.some(k => ['currency'].includes(k))) return saveMetaCurrency(payload);
    return saveMetaBio(payload);
  }, [saveMetaHp, saveMetaCombat, saveMetaBio, saveMetaCurrency, saveMetaDs]);
  const saveAbil   = useDebounced((data: unknown) => api('/abilities', 'PUT', { abilities: data }), 600);
  const saveSkills = useDebounced((data: unknown) => api('/skills', 'PUT', { skills: data }), 600);
  const saveSaves  = useDebounced((data: unknown) => api('/saves', 'PUT', { saves: data }), 600);
  const saveSlots  = useDebounced((data: unknown) => api('/spells', 'PUT', { slots: data }), 600);

  // ── Dispatchers with side-effects ─────────────────────────────────────────

  function setAbility(key: AbilityKey, value: number) {
    const clamped = clamp(Math.floor(value), 1, 30);
    dispatch({ type: 'SET_ABILITY', key, value: clamped });
    saveAbil({ ...state.abilities, [key]: clamped });
  }

  function toggleSave(key: AbilityKey) {
    const next = !state.saves[key];
    dispatch({ type: 'TOGGLE_SAVE', key });
    saveSaves({ ...state.saves, [key]: next });
  }

  function cycleSkill(name: string) {
    const sk = state.skills[name];
    if (!sk) return;
    const next = ((sk.prof + 1) % 3) as ProfLevel;
    dispatch({ type: 'CYCLE_SKILL', name });
    saveSkills({ ...Object.fromEntries(Object.entries(state.skills).map(([k, v]) => [k, v.prof])), [name]: next });
  }

  function adjustHP(delta: number) {
    const next = clamp(state.hp.current + delta, 0, state.hp.max);
    dispatch({ type: 'ADJUST_HP', delta });
    saveMeta({ hpCurrent: next });
  }

  function toggleDS(kind: 'success' | 'failure', idx: number) {
    const ds = { ...state.deathSaves };
    const k = kind === 'success' ? 'successes' : 'failures';
    ds[k] = ds[k] > idx ? idx : idx + 1;
    dispatch({ type: 'TOGGLE_DS', kind, idx });
    saveMeta({ deathSaves: ds });
  }

  function toggleSlot(level: number, idx: number) {
    const slot = state.spellSlots.find((s) => s.level === level);
    if (!slot) return;
    const used = idx < slot.used ? idx : idx + 1;
    dispatch({ type: 'TOGGLE_SLOT', level, idx });
    saveSlots(state.spellSlots.map((s) => s.level === level ? { ...s, used } : s));
  }

  function addSlot(level: number) {
    const slot = state.spellSlots.find((s) => s.level === level);
    if (!slot) return;
    dispatch({ type: 'ADD_SLOT', level });
    saveSlots(state.spellSlots.map((s) => s.level === level ? { ...s, max: s.max + 1 } : s));
  }

  async function fixSlots(correctSlots: SpellSlot[]) {
    // Merge expected slots into current — preserve used counts, update max
    const merged = state.spellSlots.map(s => {
      const fix = correctSlots.find(f => f.level === s.level);
      return fix ? { ...s, max: fix.max } : s;
    });
    // Add any slot levels that don't exist yet
    for (const fix of correctSlots) {
      if (!merged.find(s => s.level === fix.level)) {
        merged.push({ level: fix.level, max: fix.max, used: 0 });
      }
    }
    // Zero out any levels that shouldn't exist
    const finalSlots = merged.map(s => {
      const expected = correctSlots.find(f => f.level === s.level);
      return expected ? s : { ...s, max: 0 };
    });
    dispatch({ type: 'SET', payload: { spellSlots: finalSlots } });
    await api('/spells', 'PUT', { slots: finalSlots });
  }

  async function addSpell(spell: Omit<Spell, 'id'>) {
    const res = await api('/spells', 'POST', spell);
    if (res.ok) {
      const saved = await res.json();
      dispatch({ type: 'ADD_SPELL', spell: { ...spell, id: saved.id } });
    }
  }

  async function removeSpell(id: string) {
    dispatch({ type: 'REMOVE_SPELL', id });
    await api(`/spells?spellId=${id}`, 'DELETE');
  }

  async function togglePrepared(id: string) {
    const spell = state.spells.find((s) => s.id === id);
    if (!spell) return;
    dispatch({ type: 'TOGGLE_PREPARED', id });
    await api('/spells', 'PUT', { spellId: id, prepared: !spell.prepared });
  }

  async function longRest() {
    dispatch({ type: 'LONG_REST' });
    await api('/meta', 'PUT', { hpCurrent: state.hp.max, hpTemp: 0, deathSaves: { successes: 0, failures: 0 } });
    await api('/spells', 'PUT', { slots: state.spellSlots.map((s) => ({ ...s, used: 0 })) });
  }

  function shortRest() {
    dispatch({ type: 'SHORT_REST' });
    saveMeta({ deathSaves: { successes: 0, failures: 0 } });
  }

  async function addInventoryFromSrd(srdKey: string, name: string, extra?: {
    type?: string; rarity?: string; weight?: number;
    requiresAttunement?: boolean; desc?: string;
    damage?: string; armorClass?: string; cost?: string;
  }) {
    const res = await api('/inventory', 'POST', {
      srdKey, name, quantity: 1,
      customType: extra?.type,
      customRarity: extra?.rarity,
      customWeight: extra?.weight,
      customRequiresAttunement: extra?.requiresAttunement,
      customDesc: extra?.desc,
    });
    if (res.ok) { const item = await res.json(); dispatch({ type: 'ADD_INVENTORY', item }); }
  }

  async function addCustomInventory(name: string, extra?: { type?: string; rarity?: string; weight?: number; requiresAttunement?: boolean; desc?: string }) {
    const res = await api("/inventory", "POST", { name, quantity: 1, customType: extra?.type, customRarity: extra?.rarity, customWeight: extra?.weight, customRequiresAttunement: extra?.requiresAttunement, customDesc: extra?.desc });
    if (res.ok) { const item = await res.json(); dispatch({ type: 'ADD_INVENTORY', item }); }
  }

  async function saveKeyAbilities(invId: string, keyAbilities: string) {
    // Update local state
    dispatch({ type: 'UPDATE_INVENTORY', id: invId, patch: {
      itemDef: { ...state.inventory.find((i) => i.id === invId)?.itemDef, keyAbilities: keyAbilities || null }
    } as any });
    await api(`/inventory/${invId}/itemdef`, 'PATCH', { keyAbilities });
  }

  async function patchInventory(id: string, patch: Partial<InventoryItem> & { requiresAttunement?: boolean }) {
    // requiresAttunement lives on ItemDefinition, not InventoryItem
    if ('requiresAttunement' in patch) {
      const { requiresAttunement, ...rest } = patch;
      // Update local state
      dispatch({ type: 'UPDATE_INVENTORY', id, patch: { itemDef: { ...state.inventory.find(i => i.id === id)?.itemDef, requiresAttunement: requiresAttunement ?? false } } as any });
      await api(`/inventory/${id}/attunement`, 'PUT', { requiresAttunement });
      if (Object.keys(rest).length > 0) await api(`/inventory/${id}`, 'PATCH', rest);
      return;
    }
    dispatch({ type: 'UPDATE_INVENTORY', id, patch });
    await api(`/inventory/${id}`, 'PATCH', patch);
  }

  async function deleteInventory(id: string) {
    dispatch({ type: 'REMOVE_INVENTORY', id });
    await api(`/inventory/${id}`, 'DELETE');
  }

  async function addFeature(f: Omit<Feature, 'id'>) {
    const res = await api('/features', 'POST', f);
    if (res.ok) { const saved = await res.json(); dispatch({ type: 'ADD_FEATURE', feature: { ...f, id: saved.id } }); }
  }

  async function removeFeature(id: string) {
    dispatch({ type: 'REMOVE_FEATURE', id });
    await api(`/features?featureId=${id}`, 'DELETE');
  }

  async function saveClasses(classes: CharClass[]) {
    dispatch({ type: 'SET_CLASSES', classes });
    await api('/classes', 'PUT', { classes: classes.map((c) => ({ classKey: c.name, subclassKey: c.subclass || null, subclassNotes: (c as any).subclassNotes || null, level: c.level, hitDie: c.hitDie })) });
  }

  async function saveCharacterMeta(patch: { name?: string; level?: number; ruleset?: Ruleset }) {
    await api('', 'PUT', patch);
    if (patch.level) dispatch({ type: 'SET', payload: { level: patch.level, proficiencyBonus: profBonusForLevel(patch.level) } });
    // Only refresh for ruleset changes — refreshing on level change kills the level-up modal
    if (patch.ruleset) router.refresh();
  }

  async function deleteCharacter() {
    if (!confirm('Delete this character? This cannot be undone.')) return;
    await api('', 'DELETE');
    router.push('/characters');
  }

  // ── Level-up apply ───────────────────────────────────────────────────────
  const conMod = Math.floor((state.abilities.CON - 10) / 2);

  async function handleLevelUpConfirm(result: LevelUpResult, classesUsed?: CharClass[]) {
    setShowLevelUp(false);
    const newHpMax = state.hp.max + result.hpIncrease;
    const newHpCurrent = state.hp.current + result.hpIncrease;

    const baseClasses = classesUsed ?? state.classes;
    let updatedClasses = baseClasses;
    if (result.newSubclass) {
      updatedClasses = updatedClasses.map((c) =>
        c.name === result.newSubclass!.className ? { ...c, subclass: result.newSubclass!.subclassName } : c
      );
    }

    // Apply ASI choices to abilities
    let newAbilities = { ...state.abilities };
    if (result.asiChoices?.length) {
      result.asiChoices.forEach(({ ability, increase }) => {
        const k = ability as keyof typeof newAbilities;
        newAbilities[k] = Math.min(20, (newAbilities[k] ?? 10) + increase);
      });
      await api('/abilities', 'PUT', { abilities: newAbilities });
    }

    dispatch({ type: 'SET', payload: {
      hp: { ...state.hp, max: newHpMax, current: newHpCurrent },
      proficiencyBonus: result.proficiencyBonus,
      spellSlots: result.newSlots,
      classes: updatedClasses,
      abilities: newAbilities,
    }});

    await api('/meta', 'PUT', { hpMax: newHpMax, hpCurrent: newHpCurrent, _updatedAt: state._updatedAt });
    await api('/spells', 'PUT', { slots: result.newSlots });
    await api('/classes', 'PUT', { classes: updatedClasses.map((c) => ({ classKey: c.name, subclassKey: c.subclass || null, subclassNotes: (c as any).subclassNotes || null, level: c.level, hitDie: c.hitDie })) });

    // Auto-add new class features to the Features tab (skip duplicates)
    const existingNames = new Set(state.features.map((f: any) => f.name.toLowerCase()));
    for (const classFeatures of result.newFeatures) {
      for (const feat of classFeatures.features) {
        if (!feat.name || existingNames.has(feat.name.toLowerCase())) continue;
        // Skip generic ASI entry — not a real feature
        if (feat.name.toLowerCase().includes('ability score improvement')) continue;
        const res = await api('/features', 'POST', {
          name: feat.name,
          source: `${classFeatures.className} ${updatedClasses.find(c => c.name === classFeatures.className)?.level ?? ''}`,
          desc: feat.desc || '',
        });
        if (res.ok) {
          const saved = await res.json();
          dispatch({ type: 'ADD_FEATURE', feature: { name: feat.name, source: `${classFeatures.className} ${updatedClasses.find(c => c.name === classFeatures.className)?.level ?? ''}`, desc: feat.desc || '', id: saved.id } });
          existingNames.add(feat.name.toLowerCase());
        }
      }
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const tabProps = { state, dispatch, mods, abs, hpDelta, setHpDelta, hpPct, setTab, totalWeight, skillMod, saveMod, adjustHP, toggleDS, toggleSave, cycleSkill, toggleSlot, addSlot, fixSlots, addSpell, removeSpell, togglePrepared, longRest, shortRest, addInventoryFromSrd, addCustomInventory, patchInventory, deleteInventory, saveKeyAbilities, addFeature, removeFeature, saveClasses, saveCharacterMeta, deleteCharacter, saveMeta, setShowLevelUp };

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.charName}>{state.name}</div>
          <div className={styles.charMeta}>
            Level {state.level} {state.race || 'Unknown'} · {state.classes.map((c) => c.name).join(' / ')}
          </div>
        </div>
        <div className={styles.rulesetToggle}>
          <button className={`${styles.rulesetBtn} ${state.ruleset === 'SRD_2014' ? styles.active : ''}`} onClick={() => { dispatch({ type: 'SET', payload: { ruleset: 'SRD_2014' } }); saveCharacterMeta({ ruleset: 'SRD_2014' }); }}>2014</button>
          <button className={`${styles.rulesetBtn} ${state.ruleset === 'SRD_2024' ? styles.active : ''}`} onClick={() => { dispatch({ type: 'SET', payload: { ruleset: 'SRD_2024' } }); saveCharacterMeta({ ruleset: 'SRD_2024' }); }}>2024</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <a href="/characters" style={{
            fontFamily: 'var(--font-display)', fontSize: 9, fontWeight: 700,
            letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--gold)',
            textDecoration: 'none', padding: '4px 8px',
            border: '1px solid var(--gold)', borderRadius: 2,
            opacity: 0.8,
          }}>
            ← Roster
          </a>
          <button
            onClick={() => window.print()}
            title="Export to PDF"
            style={{
              fontFamily: 'var(--font-display)', fontSize: 9, fontWeight: 700,
              letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--gold-light)',
              background: 'none', border: '1px solid var(--gold-light)', borderRadius: 2,
              padding: '4px 8px', cursor: 'pointer', opacity: 0.8,
            }}
          >
            PDF
          </button>
        </div>
      </div>

      <nav className={styles.nav}>
        {['overview','abilities','combat','skills','spells','inventory','features','notes','campaigns','class guide','bio'].map((t) => (
          <button key={t} className={`${styles.navBtn} ${tab === t ? styles.navActive : ''}`} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>

      <div className={styles.content}>
        {tab === 'overview'    && <OverviewTab   {...tabProps} />}
        {tab === 'abilities'   && <AbilitiesTab  {...tabProps} setAbility={setAbility} />}
        {tab === 'combat'      && <CombatTab     {...tabProps} />}
        {tab === 'skills'      && <SkillsTab     {...tabProps} />}
        {tab === 'spells'      && <SpellsTab     {...tabProps} />}
        {tab === 'inventory'   && <InventoryTab  {...tabProps} />}
        {tab === 'features'    && <FeaturesTab   {...tabProps} />}
        {tab === 'notes'       && <NotesTab characterId={cid} />}
        {tab === 'campaigns'   && <CampaignsTab characterId={cid} />}
        {tab === 'bio'         && <BioTab        {...tabProps} />}
        {tab === 'class guide' && <ClassGuideTab classes={state.classes} currentLevel={state.level} saveClasses={saveClasses} />}
      </div>

      {showLevelUp && (() => {
        // Sync class levels to character level for single-class characters,
        // or use the levels from Bio > Classes for multiclass.
        const totalClassLevels = state.classes.reduce((s, c) => s + c.level, 0);
        const classesForModal = state.classes.length === 1
          ? [{ ...state.classes[0], level: state.level }]
          : totalClassLevels === state.level
            ? state.classes
            : [{ ...state.classes[0], level: state.level }]; // fallback
        return (
          <LevelUpModal
            characterName={state.name}
            newLevel={state.level}
            classes={classesForModal}
            currentSlots={state.spellSlots}
            conMod={conMod}
            abilities={state.abilities}
            onConfirm={(result) => handleLevelUpConfirm(result, classesForModal)}
            onClose={() => setShowLevelUp(false)}
          />
        );
      })()}
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────
function HPBlock({ state, adjustHP, toggleDS, hpDelta, setHpDelta, hpPct, dispatch, saveMeta }: any) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, alignItems: 'center' }}>
      <div style={{ textAlign: 'center' }}><div className="field-label">Current HP</div><div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: 'var(--red)', lineHeight: 1 }}>{state.hp.current}</div></div>
      <div style={{ textAlign: 'center' }}>
        <div className="field-label">Temp HP</div>
        <input type="number" min={0} value={state.hp.temp} onChange={(e) => { const v = Math.max(0, parseInt(e.target.value) || 0); dispatch({ type: 'SET', payload: { hp: { ...state.hp, temp: v } } }); saveMeta({ hpTemp: v }); }} style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--gold)', width: 60, textAlign: 'center', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-light)', outline: 'none' }} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <div className="field-label">Max HP</div>
        <input type="number" min={1} value={state.hp.max} onChange={(e) => { const v = Math.max(1, parseInt(e.target.value) || 1); dispatch({ type: 'SET', payload: { hp: { ...state.hp, max: v } } }); saveMeta({ hpMax: v }); }} style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--ink-light)', width: 60, textAlign: 'center', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-light)', outline: 'none' }} />
      </div>
      <div className="hp-bar-wrap" style={{ gridColumn: '1/-1' }}><div className="hp-bar-fill" style={{ width: hpPct + '%' }} /></div>
      <div style={{ gridColumn: '1/3', display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
        <button className="ink-btn" style={{ width: 28, height: 28, padding: 0, fontSize: 18 }} onClick={() => adjustHP(-hpDelta)}>−</button>
        <input type="number" min={1} value={hpDelta} onChange={(e) => setHpDelta(parseInt(e.target.value) || 1)} style={{ width: 52, textAlign: 'center', padding: '3px 4px' }} />
        <button className="ink-btn" style={{ width: 28, height: 28, padding: 0, fontSize: 18 }} onClick={() => adjustHP(hpDelta)}>+</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {(['success','failure'] as const).map((kind) => (
          <div key={kind} style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 9, fontWeight: 700, color: kind === 'success' ? '#2e7d32' : 'var(--red)', width: 40 }}>{kind === 'success' ? 'Success' : 'Failure'}</div>
            {[0,1,2].map((i) => <div key={i} className={`ds-pip ${kind} ${i < (kind === 'success' ? state.deathSaves.successes : state.deathSaves.failures) ? 'filled' : ''}`} onClick={() => toggleDS(kind, i)} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Overview ──────────────────────────────────────────────────────────────
function OverviewTab({ state, dispatch, mods, hpDelta, setHpDelta, hpPct, setTab, totalWeight, adjustHP, toggleDS, saveMeta, toggleSlot, longRest, setShowLevelUp }: any) {
  const init = mods['DEX'];
  return (
    <>
      <div className="panel">
        <div className="panel-header" onClick={() => setTab('bio')} style={{ cursor: 'pointer' }}>Character Info <span style={{ marginLeft: 'auto' }}>›</span></div>
        <div className="panel-body">
          <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr 1fr', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div onClick={() => setTab('bio')} style={{ width: 72, height: 72, borderRadius: '50%', border: '2.5px solid var(--gold)', background: 'var(--parchment-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, cursor: 'pointer', overflow: 'hidden' }}>
                {state.portrait ? <img src={state.portrait} alt="portrait" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🧝'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--border)', fontStyle: 'italic' }}>tap to edit</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 8px' }}>
              {[['Name', state.name], ['Race', state.race || '—'], ['Background', state.background || '—'], ['Alignment', state.alignment || '—']].map(([l, v]) => (
                <div key={l as string}><div className="field-label">{l}</div><div style={{ fontSize: 13, fontWeight: 600, borderBottom: '1px solid var(--border-light)', paddingBottom: 1 }}>{v}</div></div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 8px' }}>
              {[['Level', state.level], ['Prof.', '+'+state.proficiencyBonus], ['XP', state.xp.toLocaleString()], ['Ruleset', state.ruleset]].map(([l, v]) => (
                <div key={l as string}><div className="field-label">{l}</div><div style={{ fontSize: 13, fontWeight: 600, borderBottom: '1px solid var(--border-light)', paddingBottom: 1 }}>{v}</div></div>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 6 }}>
            <div className="field-label" style={{ marginBottom: 3 }}>Classes</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {state.classes.map((c: CharClass, i: number) => (
                <span key={i} style={{ background: 'var(--ink)', color: 'var(--gold-light)', fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, padding: '2px 8px', border: '1px solid var(--gold)', borderRadius: 3 }}>
                  {c.name} {c.level}{c.subclass ? ' · ' + c.subclass : ''}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <EquippedItemsCard inventory={state.inventory} onNavigate={() => setTab('inventory')} />
      <div className="panel">
        <div className="panel-header" onClick={() => setTab('combat')} style={{ cursor: 'pointer' }}>Hit Points <span style={{ marginLeft: 'auto' }}>›</span></div>
        <div className="panel-body"><HPBlock state={state} dispatch={dispatch} adjustHP={adjustHP} toggleDS={toggleDS} hpDelta={hpDelta} setHpDelta={setHpDelta} hpPct={hpPct} saveMeta={saveMeta} /></div>
      </div>

      <div className="panel">
        <div className="panel-header" onClick={() => setTab('abilities')} style={{ cursor: 'pointer' }}>Ability Scores <span style={{ marginLeft: 'auto' }}>›</span></div>
        <div className="panel-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 6 }}>
            {(['STR','DEX','CON','INT','WIS','CHA'] as AbilityKey[]).map((ab) => (
              <div key={ab} onClick={() => setTab('abilities')} style={{ background: 'var(--parchment)', border: '1.5px solid var(--border-light)', borderRadius: 4, textAlign: 'center', padding: '5px 3px', cursor: 'pointer' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 8, fontWeight: 700, color: 'var(--border)', textTransform: 'uppercase' }}>{ab}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700 }}>{state.abilities[ab]}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--red)', background: 'var(--parchment-dark)', border: '1px solid var(--border-light)', borderRadius: 2, padding: '0 4px', marginTop: 2, display: 'inline-block' }}>{fmtMod(mods[ab])}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="panel">
          <div className="panel-header" onClick={() => setTab('combat')} style={{ cursor: 'pointer' }}>Combat <span style={{ marginLeft: 'auto' }}>›</span></div>
          <div className="panel-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
              {[['Armor Class', state.ac], ['Initiative', fmtMod(mods['DEX'])], ['Speed', state.speed+'ft'], ['Prof.', '+'+state.proficiencyBonus]].map(([l,v]) => (
                <div key={l as string} style={{ textAlign: 'center', background: 'var(--parchment)', border: '1.5px solid var(--border-light)', borderRadius: 4, padding: '6px 4px' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700 }}>{v}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 8, fontWeight: 700, color: 'var(--border)', textTransform: 'uppercase', marginTop: 2 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="panel">
          <div className="panel-header" onClick={() => setTab('spells')} style={{ cursor: 'pointer' }}>Spell Slots <span style={{ marginLeft: 'auto' }}>›</span></div>
          <div className="panel-body">
            {state.spellSlots.filter((s: SpellSlot) => s.max > 0).length === 0 && <div className="empty-state">No slots configured</div>}
            {state.spellSlots.filter((s: SpellSlot) => s.max > 0).map((s: SpellSlot) => (
              <div key={s.level} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', borderBottom: '0.5px solid var(--parchment-dark)' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, color: 'var(--border)', width: 48, flexShrink: 0 }}>Level {s.level}</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {Array.from({ length: s.max }).map((_, i) => <div key={i} className={`slot-pip ${i < s.used ? 'used' : ''}`} onClick={() => toggleSlot(s.level, i)} />)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
        <div className="panel">
          <div className="panel-header" onClick={() => setTab('inventory')} style={{ cursor: 'pointer' }}>Inventory <span style={{ marginLeft: 'auto' }}>›</span></div>
          <div className="panel-body">
            <div style={{ fontSize: 12, color: 'var(--border)', fontStyle: 'italic', marginBottom: 4 }}>{state.inventory.length} items · {totalWeight.toFixed(1)} lb</div>
            {state.inventory.slice(0, 4).map((it: InventoryItem) => (
              <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 0', borderBottom: '0.5px solid var(--parchment-dark)', fontSize: 12 }}>
                <span style={{ fontWeight: 600, flex: 1 }}>{it.itemDef.name}</span>
                {it.equipped && <span style={{ fontFamily: 'var(--font-display)', fontSize: 9, fontWeight: 700, color: 'var(--gold)', border: '1px solid var(--gold)', padding: '0 4px', borderRadius: 2 }}>EQ</span>}
                <span style={{ color: 'var(--border)', fontSize: 11 }}>×{it.quantity}</span>
              </div>
            ))}
            {state.inventory.length > 4 && <div style={{ fontSize: 11, color: 'var(--border)', fontStyle: 'italic', textAlign: 'center', marginTop: 4 }}>+{state.inventory.length - 4} more</div>}
          </div>
        </div>
        <div className="panel">
          <div className="panel-header" onClick={() => setTab('features')} style={{ cursor: 'pointer' }}>Features <span style={{ marginLeft: 'auto' }}>›</span></div>
          <div className="panel-body">
            {state.features.slice(0, 4).map((f: Feature, i: number) => (
              <div key={f.id || i} style={{ padding: '2px 0', borderBottom: '0.5px solid var(--parchment-dark)' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 600 }}>{f.name}</div>
                <div style={{ fontSize: 10, color: 'var(--border)', fontStyle: 'italic' }}>{f.source}</div>
              </div>
            ))}
            {state.features.length === 0 && <div className="empty-state">No features yet</div>}
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 10 }}>
        <div className="panel-header">Quick Actions</div>
        <div className="panel-body" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="ink-btn" onClick={longRest} style={{ fontSize: 12 }}>
            🌙 Long Rest
          </button>
          <button className="ink-btn ghost" onClick={() => setShowLevelUp(true)} style={{ fontSize: 12 }}>
            ⬆ Level Up
          </button>
        </div>
      </div>
    </>
  );
}

// ── Abilities ─────────────────────────────────────────────────────────────
function AbilitiesTab({ state, dispatch, mods, abs, setAbility, toggleSave, saveMod, skillMod }: any) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ background: 'var(--ink)', color: 'var(--gold-light)', border: '1.5px solid var(--gold)', borderRadius: 4, padding: '4px 10px', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700 }}>
          Proficiency Bonus: +{state.proficiencyBonus}
        </span>
      </div>
      <div className="panel">
        <div className="panel-header">Ability Scores</div>
        <div className="panel-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
            {abs.map((ab: AbilityKey) => (
              <div key={ab} style={{ textAlign: 'center', background: 'var(--parchment)', border: '1.5px solid var(--border-light)', borderRadius: 4, padding: '10px 6px' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, color: 'var(--border)', textTransform: 'uppercase', marginBottom: 4 }}>{ab}</div>
                <input type="number" min={1} max={30} value={state.abilities[ab]} onChange={(e) => setAbility(ab, parseInt(e.target.value) || 10)} style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, width: '100%', textAlign: 'center', background: 'transparent', border: 'none', borderBottom: '1.5px solid var(--border-light)', outline: 'none', color: 'var(--ink)', marginBottom: 4 }} />
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--parchment)', background: 'var(--ink)', border: '1px solid var(--gold)', borderRadius: 3, padding: '1px 8px', display: 'inline-block' }}>{fmtMod(mods[ab])}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="panel">
        <div className="panel-header">Saving Throws</div>
        <div className="panel-body">
          {abs.map((ab: AbilityKey) => (
            <div key={ab} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', borderBottom: '0.5px solid var(--parchment-dark)' }}>
              <div className={`prof-pip ${state.saves[ab] ? 'proficient' : ''}`} onClick={() => toggleSave(ab)} />
              <div style={{ fontSize: 12, flex: 1, fontStyle: 'italic' }}>{ab} Saving Throw</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 600, color: 'var(--red)', minWidth: 28, textAlign: 'right' }}>{fmtMod(saveMod(ab))}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="panel">
        <div className="panel-header">Passive Perception</div>
        <div className="panel-body" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 700 }}>{10 + skillMod('Perception')}</div>
          <div style={{ fontSize: 12, color: 'var(--border)', fontStyle: 'italic' }}>10 + Perception modifier</div>
        </div>
      </div>
    </>
  );
}

// ── Combat ────────────────────────────────────────────────────────────────

// ── Combat Stat Bonus System ─────────────────────────────────────────────────

// SRD armor table
const ARMOR_TABLE: Record<string, { base: number; type: 'light'|'medium'|'heavy'; maxDex: number }> = {
  'padded':           { base: 11, type: 'light',  maxDex: 99 },
  'leather':          { base: 11, type: 'light',  maxDex: 99 },
  'studded leather':  { base: 12, type: 'light',  maxDex: 99 },
  'hide':             { base: 12, type: 'medium', maxDex: 2  },
  'chain shirt':      { base: 13, type: 'medium', maxDex: 2  },
  'scale mail':       { base: 14, type: 'medium', maxDex: 2  },
  'breastplate':      { base: 14, type: 'medium', maxDex: 2  },
  'half plate':       { base: 15, type: 'medium', maxDex: 2  },
  'ring mail':        { base: 14, type: 'heavy',  maxDex: 0  },
  'chain mail':       { base: 16, type: 'heavy',  maxDex: 0  },
  'splint':           { base: 17, type: 'heavy',  maxDex: 0  },
  'plate':            { base: 18, type: 'heavy',  maxDex: 0  },
};

interface StatBonus {
  stat: string;       // e.g. "Attack Rolls", "Spell Attack Rolls", "AC"
  bonus: string;      // e.g. "+2", "+1 (ignore half cover)", "16 base"
  source: string;     // item name
  isFormula?: boolean; // true for AC (shows full formula not just bonus)
}

function computeStatBonuses(
  inventory: InventoryItem[],
  classes: CharClass[],
  mods: Record<string, number>,
  currentAc: number,
): StatBonus[] {
  const bonuses: StatBonus[] = [];
  const equipped = inventory.filter(i => i.equipped);
  const dex = mods['DEX'] ?? 0;
  const con = mods['CON'] ?? 0;
  const wis = mods['WIS'] ?? 0;
  const classNames = classes.map(c => c.name.toLowerCase());

  let armorAC: number | null = null;
  let armorName = '';
  let armorBreakdown = '';
  let shieldBonus = 0;

  for (const it of equipped) {
    const name = it.itemDef.name;
    const nameLow = name.toLowerCase();
    const typeLow = (it.itemDef.type ?? '').toLowerCase();
    const text = (it.itemDef.text ?? '') + ' ' + (it.itemDef.keyAbilities ?? '') + ' ' + name;

    // ── Magic bonus from name (e.g. "Longsword +2") ──
    const magicMatch = nameLow.match(/\+(\d+)\s*$/);
    const magicVal = magicMatch ? parseInt(magicMatch[1]) : 0;

    // ── Shield ──
    if (nameLow.includes('shield') || typeLow.includes('shield')) {
      shieldBonus = 2 + magicVal;
      if (magicVal > 0) {
        bonuses.push({ stat: 'Saving Throws', bonus: `+${magicVal}`, source: name });
      }
      continue;
    }

    // ── Armor ──
    let foundArmor = false;
    for (const [armorKey, data] of Object.entries(ARMOR_TABLE)) {
      if (nameLow.includes(armorKey)) {
        foundArmor = true;
        let ac = data.base + magicVal;
        let bd = `${data.base} base`;
        if (data.type === 'light')  { ac += dex; bd += ` + DEX(${dex})`; }
        if (data.type === 'medium') { const d = Math.min(dex, data.maxDex); ac += d; bd += ` + DEX(${d}, max ${data.maxDex})`; }
        if (magicVal > 0) bd += ` + magic(${magicVal})`;
        armorAC = ac; armorName = name; armorBreakdown = bd;
        break;
      }
    }
    if (foundArmor) continue;

    // ── Weapons: attack + damage ──
    const isWeapon = typeLow.includes('weapon') || typeLow === 'sword' || typeLow === 'axe' ||
      typeLow === 'bow' || typeLow === 'dagger' || typeLow === 'mace' || typeLow === 'hammer' ||
      typeLow === 'spear' || typeLow === 'staff' || typeLow === 'club' ||
      ['sword','axe','bow','dagger','mace','hammer','spear','club','rapier','scimitar',
       'longsword','shortsword','greatsword','greataxe','handaxe','quarterstaff','flail',
       'morningstar','trident','lance','pike','halberd','glaive','maul','warhammer']
        .some(w => nameLow.includes(w));

    if (isWeapon && magicVal > 0) {
      bonuses.push({ stat: 'Attack Rolls', bonus: `+${magicVal}`, source: name });
      bonuses.push({ stat: 'Damage Rolls', bonus: `+${magicVal}`, source: name });
      // Don't continue — fall through to catch any extra text bonuses
    }

    // ── Arcane foci / spell attack items ──
    const isSpellFocus = typeLow.includes('wand') || typeLow.includes('rod') ||
      nameLow.includes('wand') || nameLow.includes('rod') ||
      (nameLow.includes('staff') && !isWeapon);

    if (isSpellFocus && magicVal > 0) {
      bonuses.push({ stat: 'Spell Attack Rolls', bonus: `+${magicVal}`, source: name });
      // Don't continue — fall through to text parsing for additional bonuses (e.g. ignore half cover)
    }

    // ── Parse keyAbilities / text for bonus patterns ──
    // +X to spell attack
    const spellAtkMatch = text.match(/\+(\d+).*?spell attack/i);
    if (spellAtkMatch) {
      bonuses.push({ stat: 'Spell Attack Rolls', bonus: `+${spellAtkMatch[1]}`, source: name });
    }
    // +X to attack and damage
    const atkDmgMatch = text.match(/\+(\d+).*?(?:attack and damage|attack & damage)/i);
    if (atkDmgMatch) {
      bonuses.push({ stat: 'Attack Rolls',  bonus: `+${atkDmgMatch[1]}`, source: name });
      bonuses.push({ stat: 'Damage Rolls',  bonus: `+${atkDmgMatch[1]}`, source: name });
    }
    // +X AC
    const acMatch = text.match(/\+(\d+).*?(?:armor class|AC\b)/i);
    if (acMatch && !nameLow.includes('shield')) {
      bonuses.push({ stat: 'AC', bonus: `+${acMatch[1]}`, source: name });
    }
    // +X saving throws
    const saveMatch = text.match(/\+(\d+).*?saving throw/i);
    if (saveMatch) {
      bonuses.push({ stat: 'Saving Throws', bonus: `+${saveMatch[1]}`, source: name });
    }
    // Resistance
    const resistMatch = text.match(/resistance to ([\w\s,]+?) damage/i);
    if (resistMatch) {
      bonuses.push({ stat: 'Damage Resistance', bonus: resistMatch[1].trim(), source: name });
    }
    // Advantage on saves
    const advSaveMatch = text.match(/advantage on ([\w\s]+?) saving throw/i);
    if (advSaveMatch) {
      bonuses.push({ stat: 'Saving Throws', bonus: `Advantage (${advSaveMatch[1].trim()})`, source: name });
    }
    // Speed bonus
    const speedMatch = text.match(/speed (?:increases? by|is) (\d+)/i);
    if (speedMatch) {
      bonuses.push({ stat: 'Speed', bonus: `+${speedMatch[1]} ft`, source: name });
    }
    // Ignore half cover
    if (/ignore half.?cover/i.test(text)) {
      bonuses.push({ stat: 'Spell Attacks', bonus: 'Ignore half cover', source: name });
    }
  }

  // ── AC summary ──
  if (armorAC !== null) {
    const total = armorAC + shieldBonus;
    const bd = shieldBonus > 0 ? `${armorBreakdown} + shield(${shieldBonus})` : armorBreakdown;
    bonuses.unshift({
      stat: 'Armor Class',
      bonus: `${total} (${bd})${currentAc !== total ? ` — current: ${currentAc}` : ''}`,
      source: armorName,
      isFormula: true,
    });
  } else if (shieldBonus > 0) {
    bonuses.unshift({ stat: 'AC', bonus: `+${shieldBonus} from shield`, source: 'Shield', isFormula: false });
  } else if (classNames.includes('barbarian')) {
    const ac = 10 + dex + con;
    bonuses.unshift({ stat: 'Armor Class (Unarmored)', bonus: `${ac} (10 + DEX${dex} + CON${con})`, source: 'Unarmored Defense', isFormula: true });
  } else if (classNames.includes('monk')) {
    const ac = 10 + dex + wis;
    bonuses.unshift({ stat: 'Armor Class (Unarmored)', bonus: `${ac} (10 + DEX${dex} + WIS${wis})`, source: 'Unarmored Defense', isFormula: true });
  }

  // Deduplicate same stat+source combos
  const seen = new Set<string>();
  return bonuses.filter(b => {
    const key = `${b.stat}|${b.source}|${b.bonus}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

function ActiveStatBonuses({ state, mods, onApplyAC }: {
  state: any; mods: Record<string, number>; onApplyAC: (ac: number) => void;
}) {
  const bonuses = computeStatBonuses(state.inventory, state.classes, mods, state.ac);
  if (!bonuses.length) return null;

  // Pull out the AC formula bonus for the apply button
  const acFormula = bonuses.find(b => b.isFormula);
  const acMatch = acFormula?.bonus.match(/^(\d+)/);
  const suggestedAC = acMatch ? parseInt(acMatch[1]) : null;
  const acMismatch = suggestedAC !== null && suggestedAC !== state.ac;

  return (
    <div style={{ background: 'var(--section-bg)', border: '1.5px solid var(--gold)',
      borderRadius: 4, marginBottom: 10, overflow: 'hidden' }}>
      <div style={{ background: 'var(--ink)', color: 'var(--gold-light)',
        fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700,
        letterSpacing: 1.5, textTransform: 'uppercase', padding: '5px 10px' }}>
        Active Stat Bonuses — Equipped Items
      </div>
      <div style={{ padding: '6px 10px' }}>
        {bonuses.map((b, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8,
            padding: '3px 0', borderBottom: '0.5px solid var(--parchment-dark)',
            flexWrap: 'wrap' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700,
              color: 'var(--border)', minWidth: 130, flexShrink: 0, textTransform: 'uppercase',
              letterSpacing: 0.3 }}>
              {b.stat}
            </div>
            <div style={{ fontSize: 12, color: b.isFormula ? 'var(--ink)' : 'var(--red)',
              fontWeight: b.isFormula ? 400 : 700, flex: 1 }}>
              {b.isFormula ? b.bonus : <strong>{b.bonus}</strong>}
            </div>
            <div style={{ fontSize: 10, color: 'var(--border)', fontStyle: 'italic', flexShrink: 0 }}>
              {b.source}
            </div>
            {b.isFormula && acMismatch && b === acFormula && (
              <button className="ink-btn" style={{ fontSize: 10, padding: '1px 8px', flexShrink: 0 }}
                onClick={() => onApplyAC(suggestedAC!)}>
                Apply {suggestedAC}
              </button>
            )}
          </div>
        ))}
        <div style={{ fontSize: 10, color: 'var(--border)', fontStyle: 'italic', marginTop: 4 }}>
          Add these bonuses when making the corresponding rolls.
        </div>
      </div>
    </div>
  );
}


function CombatTab({ state, dispatch, mods, hpDelta, setHpDelta, hpPct, adjustHP, toggleDS, longRest, shortRest, saveMeta }: any) {
  return (
    <>
      <ActiveStatBonuses
        state={state}
        mods={mods}
        onApplyAC={(v) => { dispatch({ type: 'SET', payload: { ac: v } }); saveMeta({ ac: v }); }}
      />
      <div className="panel">
        <div className="panel-header">Combat Statistics</div>
        <div className="panel-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
            {[
              { label: 'Armor Class', val: state.ac, key: 'ac', min: 0, max: 99 },
              { label: 'Speed (ft)', val: state.speed, key: 'speed', min: 0, max: 999 },
            ].map(({ label, val, key, min, max }) => (
              <div key={key} style={{ textAlign: 'center', background: 'var(--parchment)', border: '1.5px solid var(--border-light)', borderRadius: 4, padding: '6px 4px' }}>
                <input type="number" min={min} max={max} value={val} onChange={(e) => { const v = parseInt(e.target.value)||0; dispatch({ type: 'SET', payload: { [key]: v } }); saveMeta({ [key]: v }); }} style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, width: '100%', textAlign: 'center', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-light)', outline: 'none', color: 'var(--ink)' }} />
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 8, fontWeight: 700, color: 'var(--border)', textTransform: 'uppercase', marginTop: 2 }}>{label}</div>
              </div>
            ))}
            <div style={{ textAlign: 'center', background: 'var(--parchment)', border: '1.5px solid var(--border-light)', borderRadius: 4, padding: '6px 4px' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700 }}>{fmtMod(mods['DEX'])}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 8, fontWeight: 700, color: 'var(--border)', textTransform: 'uppercase', marginTop: 2 }}>Initiative</div>
            </div>
            <div style={{ textAlign: 'center', background: 'var(--parchment)', border: '1.5px solid var(--border-light)', borderRadius: 4, padding: '6px 4px' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700 }}>+{state.proficiencyBonus}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 8, fontWeight: 700, color: 'var(--border)', textTransform: 'uppercase', marginTop: 2 }}>Prof. Bonus</div>
            </div>
          </div>
        </div>
      </div>
      <div className="panel">
        <div className="panel-header">Hit Points</div>
        <div className="panel-body">
          <HPBlock state={state} dispatch={dispatch} adjustHP={adjustHP} toggleDS={toggleDS} hpDelta={hpDelta} setHpDelta={setHpDelta} hpPct={hpPct} saveMeta={saveMeta} />
          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
            <button className="ink-btn" onClick={shortRest}>Short Rest</button>
            <button className="ink-btn" onClick={longRest}>Long Rest</button>
          </div>
        </div>
      </div>
      <div className="panel">
        <div className="panel-header">Hit Dice</div>
        <div className="panel-body">
          {state.classes.map((c: CharClass, i: number) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '0.5px solid var(--parchment-dark)' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, flex: 1 }}>{c.name} (d{c.hitDie})</div>
              <div style={{ fontSize: 13, color: 'var(--border)' }}>Lvl {c.level} · {c.level} dice</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ── Skills ────────────────────────────────────────────────────────────────
function SkillsTab({ state, cycleSkill, skillMod }: any) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ background: 'var(--ink)', color: 'var(--gold-light)', border: '1.5px solid var(--gold)', borderRadius: 4, padding: '4px 10px', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700 }}>
          Proficiency Bonus: +{state.proficiencyBonus}
        </span>
        <span style={{ fontSize: 11, color: 'var(--border)', fontStyle: 'italic' }}>Click pip to cycle · saves automatically</span>
      </div>
      <div className="panel">
        <div className="panel-header">Skills</div>
        <div className="panel-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 10px' }}>
            {Object.keys(state.skills).map((sk) => {
              const s = state.skills[sk];
              return (
                <div key={sk} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 0', borderBottom: '0.5px solid var(--parchment-dark)' }}>
                  <div className={`prof-pip ${s.prof === 1 ? 'proficient' : s.prof === 2 ? 'expert' : ''}`} onClick={() => cycleSkill(sk)} />
                  <div style={{ fontSize: 12, flex: 1, fontStyle: 'italic' }}>{sk} <span style={{ fontSize: 10, color: 'var(--border)' }}>({s.ability})</span></div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 600, color: 'var(--red)', minWidth: 28, textAlign: 'right' }}>{fmtMod(skillMod(sk))}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Paste-parser for wikidot / any spell stat block ──────────────────────
function parseSpellText(raw: string): Partial<Spell> {
  const t = raw.trim();
  const lines = t.split('\n').map((l) => l.trim()).filter(Boolean);

  const get = (label: string) => {
    const rx = new RegExp(`${label}[:\\s]+(.+)`, 'i');
    for (const l of lines) {
      const m = l.match(rx);
      if (m) return m[1].trim();
    }
    return '';
  };

  // Name — first non-empty line that isn't a known label
  const knownLabels = /^(casting time|range|components|duration|school|level|classes|source|ritual|concentration)/i;
  const nameLine = lines.find((l) => !knownLabels.test(l)) ?? '';

  // Level — look for "cantrip", "1st-level", "2nd-level", etc.
  let level = 0;
  const levelLine = lines.join(' ').toLowerCase();
  if (levelLine.includes('cantrip')) level = 0;
  else {
    const lm = levelLine.match(/(\d+)(?:st|nd|rd|th)[- ]level/i);
    if (lm) level = parseInt(lm[1]);
  }

  // School
  const schools = ['abjuration','conjuration','divination','enchantment','evocation','illusion','necromancy','transmutation'];
  let school = '';
  for (const l of lines) {
    const found = schools.find((s) => l.toLowerCase().includes(s));
    if (found) { school = found.charAt(0).toUpperCase() + found.slice(1); break; }
  }

  // Ritual / Concentration — look anywhere in text
  const fullText = lines.join(' ').toLowerCase();
  const ritual = fullText.includes('ritual');
  const concentration = fullText.includes('concentration');

  // Description — everything after the stat block lines
  const statLabels = /^(casting time|range|components|duration|classes|source)/i;
  let descStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (statLabels.test(lines[i])) { descStart = i; }
  }
  const desc = descStart >= 0
    ? lines.slice(descStart + 1).join(' ').trim()
    : lines.slice(3).join(' ').trim();

  return {
    name:        nameLine,
    level,
    school,
    castingTime: get('casting time'),
    range:       get('range'),
    components:  get('components'),
    duration:    get('duration'),
    classes:     get('classes'),
    ritual,
    concentration,
    desc,
  };
}

// ── Spells ────────────────────────────────────────────────────────────────

// ── Spell Slot Validator ──────────────────────────────────────────────────
// Non-caster classes that never get spell slots
const NON_CASTERS = new Set(['barbarian','fighter','monk','rogue']);

function SpellSlotValidator({ classes, spellSlots, addSlots, dismissedKeys, onDismiss }: {
  classes: CharClass[];
  spellSlots: SpellSlot[];
  addSlots: (slots: SpellSlot[]) => void;
  dismissedKeys: Set<string>;
  onDismiss: (key: string) => void;
}) {
  const [expected, setExpected] = useState<SpellSlot[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Key changes when class/level changes so we re-validate
  const validationKey = classes.map(c => `${c.name}:${c.level}`).join('|');
  const dismissed = dismissedKeys.has(validationKey);

  useEffect(() => {
    setExpected(null);
    setError(null);

    // Skip multiclass — slot calculation is complex
    if (classes.length > 1) return;
    const cls = classes[0];
    if (!cls?.name) return;

    // Non-casters: warn if they somehow have slots, otherwise stay silent
    if (NON_CASTERS.has(cls.name.toLowerCase())) {
      const hasSlots = spellSlots.some(s => s.max > 0);
      if (hasSlots) setExpected([]); // empty = non-caster should have zero slots
      return;
    }

    setLoading(true);
    fetch(`/api/srd/class?name=${encodeURIComponent(cls.name)}&level=${cls.level}`)
      .then(r => r.ok ? r.json() : Promise.reject('not found'))
      .then(d => {
        const lvData = d.levels?.find((l: any) => l.level === cls.level);
        if (!lvData) { setLoading(false); return; }

        // Class has no spellcasting at this level — treat as non-caster
        if (!lvData.spellSlots) {
          const hasSlots = spellSlots.some(s => s.max > 0);
          if (hasSlots) setExpected([]);
          setLoading(false);
          return;
        }

        const slots: SpellSlot[] = lvData.spellSlots.slots
          .map((max: number, i: number) => ({ level: i + 1, max, used: 0 }))
          .filter((s: SpellSlot) => s.max > 0);

        setExpected(slots);
        setLoading(false);
      })
      .catch(() => { setLoading(false); });
  }, [validationKey]);

  if (loading || dismissed || expected === null) return null;


  const cls = classes[0];
  const isNonCaster = expected.length === 0;

  // Non-caster with slots — special warning
  if (isNonCaster) {
    const activeSlots = spellSlots.filter(s => s.max > 0);
    return (
      <div style={{ marginBottom: 10, padding: 10, background: '#fff0f0', border: '1.5px solid var(--red)', borderRadius: 4, fontSize: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ fontSize: 16, flexShrink: 0 }}>🚫</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
              {cls.name}s Don't Get Spell Slots
            </div>
            <div style={{ color: 'var(--ink-light)', lineHeight: 1.6, marginBottom: 8 }}>
              {cls.name}s are non-spellcasters and do not receive spell slots in the standard rules.
              You currently have {activeSlots.length} slot level{activeSlots.length !== 1 ? 's' : ''} configured
              ({activeSlots.map(s => `${s.max}×L${s.level}`).join(', ')}).
              If this is homebrew or a multiclass build, you can dismiss this warning.
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="ink-btn" style={{ fontSize: 11, background: 'var(--red)', borderColor: 'var(--red)', color: '#fff' }}
                onClick={() => {
                  const zeroed = spellSlots.map(s => ({ ...s, max: 0, used: 0 }));
                  addSlots(zeroed);
                  onDismiss(validationKey);
                }}>
                Clear All Slots
              </button>
              <button className="ink-btn ghost" style={{ fontSize: 11 }} onClick={() => setDismissed(true)}>
                Keep (Homebrew / Multiclass)
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Compare expected vs current for spellcasters
  const mismatches: { level: number; expected: number; current: number }[] = [];
  for (const exp of expected) {
    const cur = spellSlots.find(s => s.level === exp.level);
    if ((cur?.max ?? 0) !== exp.max) {
      mismatches.push({ level: exp.level, expected: exp.max, current: cur?.max ?? 0 });
    }
  }
  // Slots that exist but shouldn't at this level
  for (const cur of spellSlots.filter(s => s.max > 0)) {
    const exp = expected.find(s => s.level === cur.level);
    if (!exp && !mismatches.find(m => m.level === cur.level)) {
      mismatches.push({ level: cur.level, expected: 0, current: cur.max });
    }
  }

  if (!mismatches.length) return null;

  return (
    <div style={{
      marginBottom: 10, padding: 10,
      background: '#fff8e6', border: '1.5px solid var(--gold)',
      borderRadius: 4, fontSize: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ fontSize: 16, flexShrink: 0 }}>⚠️</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
            Spell Slots Don't Match SRD
          </div>
          <div style={{ color: 'var(--ink-light)', lineHeight: 1.6, marginBottom: 6 }}>
            A level {cls.level} {cls.name} should have these spell slots (if not homebrew):
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {expected.map(s => {
              const cur = spellSlots.find(c => c.level === s.level);
              const wrong = (cur?.max ?? 0) !== s.max;
              return (
                <div key={s.level} style={{
                  textAlign: 'center', padding: '4px 8px', borderRadius: 3,
                  background: wrong ? '#fff0c0' : 'var(--parchment)',
                  border: wrong ? '1.5px solid var(--gold)' : '1px solid var(--border-light)',
                }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 8, fontWeight: 700, color: 'var(--border)', textTransform: 'uppercase' }}>Lv {s.level}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: wrong ? 'var(--red)' : 'var(--ink)' }}>{s.max}</div>
                  {wrong && (
                    <div style={{ fontSize: 9, color: 'var(--border)' }}>
                      (have {cur?.max ?? 0})
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="ink-btn" style={{ fontSize: 11 }}
              onClick={() => { addSlots(expected); onDismiss(validationKey); }}>
              Fix Automatically
            </button>
            <button className="ink-btn ghost" style={{ fontSize: 11 }}
              onClick={() => setDismissed(true)}>
              Keep Current (Homebrew)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SpellsTab({ state, toggleSlot, addSlot, fixSlots, addSpell, removeSpell, togglePrepared, longRest }: any) {
  const [searchQ, setSearchQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dismissedSlotWarnings, setDismissedSlotWarnings] = useState<Set<string>>(new Set());
  const [claudeLoading, setClaudeLoading] = useState(false);
  const [claudeError, setClaudeError] = useState('');

  // Custom spell state
  const [showCustom, setShowCustom] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [custom, setCustom] = useState<Partial<Spell>>({
    name: '', level: 0, school: '', castingTime: '', range: '',
    duration: '', components: '', classes: '', ritual: false,
    concentration: false, desc: '',
  });
  const [adding, setAdding] = useState(false);

  function handleParse() {
    if (!pasteText.trim()) return;
    const parsed = parseSpellText(pasteText);
    setCustom((prev) => ({ ...prev, ...parsed }));
  }

  async function handleAddCustom() {
    if (!custom.name?.trim()) return;
    setAdding(true);
    await addSpell({ ...custom, prepared: true });
    setAdding(false);
    setCustom({ name:'', level:0, school:'', castingTime:'', range:'', duration:'', components:'', classes:'', ritual:false, concentration:false, desc:'' });
    setPasteText('');
    setShowCustom(false);
  }

  async function search() {
    if (!searchQ.trim()) return;
    setSearching(true); setResults([]); setSelected(null); setSearched(false); setClaudeError('');
    try {
      const r = await fetch(`/api/srd?type=spells&ruleset=${state.ruleset}&q=${encodeURIComponent(searchQ)}`);
      if (!r.ok) throw new Error(`Search failed: ${r.status}`);
      const d = await r.json();
      setResults(d.results ?? []);
    } catch (e) {
      console.error('Spell search error:', e);
      setResults([]);
    }
    setSearching(false);
    setSearched(true);
  }

  async function askClaude() {
    if (!searchQ.trim()) return;
    setClaudeLoading(true); setClaudeError(''); setSelected(null);
    try {
      const r = await fetch('/api/srd/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'spell', name: searchQ.trim() }),
      });
      if (r.status === 404) { setClaudeError(`Claude doesn't recognize "${searchQ}" as an official D&D 5e spell. Try the custom form below.`); return; }
      if (!r.ok) throw new Error('Claude lookup failed');
      const d = await r.json();
      setSelected({ ...d.result, _source: 'claude' });
    } catch (e: any) {
      setClaudeError(e?.message ?? 'Claude lookup failed');
    } finally {
      setClaudeLoading(false);
    }
  }

  async function handleAdd() {
    if (!selected) return;
    await addSpell({ ...selected, prepared: true });
    setSelected(null); setResults([]); setSearchQ(''); setSearched(false);
  }

  const byLevel: Record<number, Spell[]> = {};
  state.spells.forEach((s: Spell) => { if (!byLevel[s.level]) byLevel[s.level] = []; byLevel[s.level].push(s); });

  const inputStyle = { width: '100%', padding: '4px 6px', fontFamily: 'var(--font-body)', fontSize: 13 };
  const rowStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 } as React.CSSProperties;

  return (
    <>
      <SpellSlotValidator
        classes={state.classes}
        spellSlots={state.spellSlots}
        addSlots={fixSlots}
        dismissedKeys={dismissedSlotWarnings}
        onDismiss={(key) => setDismissedSlotWarnings(prev => new Set([...prev, key]))}
      />
      <div className="panel">
        <div className="panel-header">Spell Slots</div>
        <div className="panel-body">
          {state.spellSlots.map((s: SpellSlot) => (
            <div key={s.level} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '0.5px solid var(--parchment-dark)' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, color: 'var(--border)', width: 52, flexShrink: 0 }}>Level {s.level}</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {s.max > 0 ? Array.from({ length: s.max }).map((_, i) => <div key={i} className={`slot-pip ${i < s.used ? 'used' : ''}`} onClick={() => toggleSlot(s.level, i)} />) : <span style={{ fontSize: 11, color: 'var(--border)', fontStyle: 'italic' }}>—</span>}
              </div>
              <button style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--border)', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => addSlot(s.level)}>+</button>
            </div>
          ))}
          <div style={{ marginTop: 8 }}><button className="ink-btn" onClick={longRest}>Recover All (Long Rest)</button></div>
        </div>
      </div>

      {/* SRD Search */}
      <div className="panel">
        <div className="panel-header">Add Spell from {state.ruleset === 'SRD_2014' ? 'SRD 2014' : 'SRD 2024'}</div>
        <div className="panel-body">
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <input type="text" placeholder="Search spells…" value={searchQ} onChange={(e) => setSearchQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} style={{ flex: 1 }} />
            <button className="ink-btn" onClick={search} disabled={searching}>{searching ? 'Searching…' : 'Search'}</button>
          </div>
          {!selected && results.length > 0 && (
            <div className="results-list">
              {results.map((sp, i) => (
                <div key={i} className="result-item" onClick={() => setSelected(sp)}>
                  <div className="result-name">{sp.name}</div>
                  <div className="result-meta">{sp.level === 0 ? 'Cantrip' : 'Level ' + sp.level} · <span className={`school-${sp.school?.toLowerCase()}`}>{sp.school}</span></div>
                </div>
              ))}
            </div>
          )}
          {!selected && searched && !searching && results.length === 0 && (
            <div style={{ padding: '10px 0' }}>
              <div style={{ fontSize: 12, color: 'var(--border)', fontStyle: 'italic', marginBottom: 8 }}>
                No results in SRD databases for "{searchQ}".
              </div>
              {claudeError ? (
                <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 8, lineHeight: 1.5 }}>{claudeError}</div>
              ) : (
                <button
                  className="ink-btn"
                  style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
                  onClick={askClaude}
                  disabled={claudeLoading}
                >
                  {claudeLoading ? '⏳ Asking Claude…' : '✦ Ask Claude'}
                </button>
              )}
              {claudeLoading && (
                <div style={{ fontSize: 11, color: 'var(--border)', fontStyle: 'italic', marginTop: 6 }}>
                  Claude is looking up "{searchQ}" from its D&D 5e knowledge…
                </div>
              )}
            </div>
          )}
          {selected && (
            <div className="detail-card">
              {selected._source === 'claude' && (
                <div style={{ fontSize: 10, color: 'var(--gold)', fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: 1, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  ✦ SOURCE: CLAUDE — verify details before adding
                </div>
              )}
              <div className="detail-title">{selected.name}</div>
              <div className="detail-subtitle">{selected.level === 0 ? 'Cantrip' : 'Level ' + selected.level} <span className={`school-${selected.school?.toLowerCase()}`}>{selected.school}</span>{selected.ritual ? ' [Ritual]' : ''}{selected.concentration ? ' [Conc.]' : ''}</div>
              <div className="detail-props">
                {selected.castingTime && <div className="detail-prop"><div className="dp-label">Casting Time</div><div className="dp-val">{selected.castingTime}</div></div>}
                {selected.range && <div className="detail-prop"><div className="dp-label">Range</div><div className="dp-val">{selected.range}</div></div>}
                {selected.duration && <div className="detail-prop"><div className="dp-label">Duration</div><div className="dp-val">{selected.duration}</div></div>}
                {selected.components && <div className="detail-prop"><div className="dp-label">Components</div><div className="dp-val">{selected.components}</div></div>}
                {selected.classes && <div className="detail-prop"><div className="dp-label">Classes</div><div className="dp-val">{selected.classes}</div></div>}
              </div>
              {selected.desc && <div className="detail-body">{selected.desc}</div>}
              <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
                <button className="ink-btn" onClick={handleAdd}>Add to Sheet</button>
                <button className="ink-btn ghost" onClick={() => setSelected(null)}>Back</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Custom / Non-SRD Spell */}
      <div className="panel">
        <div className="panel-header" style={{ cursor: 'pointer' }} onClick={() => setShowCustom((v) => !v)}>
          Add Custom / Non-SRD Spell
          <span style={{ marginLeft: 'auto', fontSize: 14 }}>{showCustom ? '▲' : '▼'}</span>
        </div>
        {showCustom && (
          <div className="panel-body">
            {/* Paste area */}
            <div style={{ background: 'var(--parchment)', border: '1.5px solid var(--gold)', borderRadius: 4, padding: 10, marginBottom: 10 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                Paste from wikidot / any site
              </div>
              <div style={{ fontSize: 11, color: 'var(--border)', fontStyle: 'italic', marginBottom: 6 }}>
                Go to dnd5e.wikidot.com, select all the spell text, paste it below, then click Parse. Fields will auto-fill — edit anything that didn't parse correctly.
              </div>
              <textarea
                placeholder={'Example:\nThorn Whip\nTransmutation cantrip\nCasting Time: 1 action\nRange: 30 feet\nComponents: V, S, M (the stem of a plant with thorns)\nDuration: Instantaneous\nClasses: Druid, Artificer\n\nYou create a long, vine-like whip...'}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={7}
                style={{ width: '100%', resize: 'vertical', fontFamily: 'var(--font-body)', fontSize: 12, padding: '6px 8px' }}
              />
              <button className="ink-btn" style={{ marginTop: 6 }} onClick={handleParse} disabled={!pasteText.trim()}>
                Parse Spell Text
              </button>
            </div>

            {/* Editable fields */}
            <div style={{ display: 'grid', gap: 6 }}>
              <div>
                <div className="field-label">Spell Name *</div>
                <input type="text" value={custom.name ?? ''} onChange={(e) => setCustom((p) => ({ ...p, name: e.target.value }))} style={inputStyle} placeholder="e.g. Thorn Whip" />
              </div>
              <div style={rowStyle}>
                <div>
                  <div className="field-label">Level (0 = Cantrip)</div>
                  <input type="number" min={0} max={9} value={custom.level ?? 0} onChange={(e) => setCustom((p) => ({ ...p, level: parseInt(e.target.value) || 0 }))} style={inputStyle} />
                </div>
                <div>
                  <div className="field-label">School</div>
                  <select value={custom.school ?? ''} onChange={(e) => setCustom((p) => ({ ...p, school: e.target.value }))} style={inputStyle}>
                    <option value="">— Select —</option>
                    {['Abjuration','Conjuration','Divination','Enchantment','Evocation','Illusion','Necromancy','Transmutation'].map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={rowStyle}>
                <div>
                  <div className="field-label">Casting Time</div>
                  <input type="text" value={custom.castingTime ?? ''} onChange={(e) => setCustom((p) => ({ ...p, castingTime: e.target.value }))} style={inputStyle} placeholder="1 action" />
                </div>
                <div>
                  <div className="field-label">Range</div>
                  <input type="text" value={custom.range ?? ''} onChange={(e) => setCustom((p) => ({ ...p, range: e.target.value }))} style={inputStyle} placeholder="30 feet" />
                </div>
              </div>
              <div style={rowStyle}>
                <div>
                  <div className="field-label">Duration</div>
                  <input type="text" value={custom.duration ?? ''} onChange={(e) => setCustom((p) => ({ ...p, duration: e.target.value }))} style={inputStyle} placeholder="Instantaneous" />
                </div>
                <div>
                  <div className="field-label">Components</div>
                  <input type="text" value={custom.components ?? ''} onChange={(e) => setCustom((p) => ({ ...p, components: e.target.value }))} style={inputStyle} placeholder="V, S, M (…)" />
                </div>
              </div>
              <div style={rowStyle}>
                <div>
                  <div className="field-label">Classes</div>
                  <input type="text" value={custom.classes ?? ''} onChange={(e) => setCustom((p) => ({ ...p, classes: e.target.value }))} style={inputStyle} placeholder="Druid, Artificer" />
                </div>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', paddingTop: 18 }}>
                  <label style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox" checked={custom.ritual ?? false} onChange={(e) => setCustom((p) => ({ ...p, ritual: e.target.checked }))} />
                    Ritual
                  </label>
                  <label style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox" checked={custom.concentration ?? false} onChange={(e) => setCustom((p) => ({ ...p, concentration: e.target.checked }))} />
                    Concentration
                  </label>
                </div>
              </div>
              <div>
                <div className="field-label">Description</div>
                <textarea value={custom.desc ?? ''} onChange={(e) => setCustom((p) => ({ ...p, desc: e.target.value }))} rows={4} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Spell description…" />
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="ink-btn" onClick={handleAddCustom} disabled={adding || !custom.name?.trim()}>
                  {adding ? 'Adding…' : 'Add to Sheet'}
                </button>
                <button className="ink-btn ghost" onClick={() => { setShowCustom(false); setPasteText(''); setCustom({ name:'', level:0, school:'', castingTime:'', range:'', duration:'', components:'', classes:'', ritual:false, concentration:false, desc:'' }); }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Known Spells */}
      <div className="panel">
        <div className="panel-header">Known Spells ({state.spells.length})</div>
        <div className="panel-body">
          {Object.keys(byLevel).sort((a,b)=>Number(a)-Number(b)).map((lv) => (
            <div key={lv}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, color: 'var(--border)', letterSpacing: 1, margin: '8px 0 3px', textTransform: 'uppercase' }}>{lv === '0' ? 'Cantrips' : 'Level ' + lv + ' Spells'}</div>
              {byLevel[Number(lv)].map((sp: Spell) => (
                <div key={sp.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '5px 0', borderBottom: '0.5px solid var(--parchment-dark)' }}>
                  {Number(lv) > 0 ? <div style={{ width: 10, height: 10, borderRadius: '50%', border: '1.5px solid var(--gold)', cursor: 'pointer', flexShrink: 0, marginTop: 3, background: sp.prepared ? 'var(--gold)' : 'var(--parchment)' }} onClick={() => sp.id && togglePrepared(sp.id)} /> : <div style={{ width: 10, height: 10, flexShrink: 0 }} />}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: expandedId === sp.id ? 'var(--gold)' : 'var(--ink)' }} onClick={() => setExpandedId(expandedId === sp.id ? null : (sp.id || null))}>{sp.name}</span>
                      {sp.ritual && <span className="tag-badge tag-ritual">Ritual</span>}
                      {sp.concentration && <span className="tag-badge tag-conc">Conc.</span>}
                      {sp.school && <span className={`tag-badge tag-school school-${sp.school?.toLowerCase()}`}>{sp.school}</span>}
                    </div>
                    {(sp.castingTime || sp.range || sp.duration) && <div style={{ fontSize: 10, color: 'var(--border)', fontStyle: 'italic', marginTop: 1 }}>{[sp.castingTime && 'Cast: '+sp.castingTime, sp.range && 'Range: '+sp.range, sp.duration && 'Dur: '+sp.duration].filter(Boolean).join(' · ')}</div>}
                    {expandedId === sp.id && sp.desc && <div style={{ fontSize: 12, color: 'var(--ink-light)', lineHeight: 1.5, marginTop: 4, padding: 6, background: 'var(--parchment)', border: '1px solid var(--border-light)', borderRadius: 3 }}>{sp.desc}</div>}
                  </div>
                  <button onClick={() => sp.id && removeSpell(sp.id)} style={{ fontSize: 11, background: 'none', border: 'none', color: 'var(--border)', cursor: 'pointer', padding: '0 4px', flexShrink: 0 }}>✕</button>
                </div>
              ))}
            </div>
          ))}
          {state.spells.length === 0 && <div className="empty-state">No spells known. Search above to add.</div>}
        </div>
      </div>
    </>
  );
}

// ── Item paste parser ─────────────────────────────────────────────────────
function parseItemText(raw: string): Partial<CustomItem> {
  const lines = raw.trim().split('\n').map((l) => l.trim()).filter(Boolean);

  // Name — first line
  const name = lines[0] ?? '';

  // Type + rarity line — e.g. "Staff, rare (requires attunement by a druid)"
  // or "Weapon (quarterstaff), rare (requires attunement)"
  let type = 'Wondrous Item';
  let rarity = '';
  let requiresAttunement = false;

  const rarities = ['common','uncommon','rare','very rare','legendary','artifact'];
  const types = ['weapon','armor','staff','rod','wand','ring','potion','scroll','ammunition','tool','gear','shield','adventuring gear','wondrous item'];

  // Search whole text for attunement (wikidot pages can put it anywhere)
  if (raw.toLowerCase().includes('attunement')) requiresAttunement = true;

  for (const line of lines.slice(0, 6)) {
    const lower = line.toLowerCase();
    // Rarity
    for (const r of rarities) {
      if (lower.includes(r)) { rarity = r.replace(/\b\w/g, (c) => c.toUpperCase()); break; }
    }
    // Type — pick first match
    for (const t of types) {
      if (lower.startsWith(t) || lower.includes(', ' + t) || lower.includes('(' + t)) {
        type = t.replace(/\b\w/g, (c) => c.toUpperCase());
        break;
      }
    }
  }

  // Weight — look for "X lb" pattern anywhere
  let weight = 0;
  const weightMatch = raw.match(/(\d+(?:\.\d+)?)\s*lb/i);
  if (weightMatch) weight = parseFloat(weightMatch[1]);

  // Description — everything from line 2 onward (skip type/rarity header lines)
  // Skip lines that are clearly header-like (short, contain rarity/type keywords)
  const headerEnd = Math.min(lines.length, 3);
  const desc = lines.slice(headerEnd).join('\n').trim() || lines.slice(1).join('\n').trim();

  return { name, type, rarity, weight, requiresAttunement, desc };
}

interface CustomItem {
  name: string;
  type: string;
  rarity: string;
  weight: number;
  requiresAttunement: boolean;
  desc: string;
}


// ── Attunement helpers ────────────────────────────────────────────────────
function AttunementTracker({ inventory }: { inventory: InventoryItem[] }) {
  const attunedItems = inventory.filter((i) => i.attuned);
  const count = attunedItems.length;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '5px 8px',
      background: count >= 3 ? 'rgba(123,63,160,0.08)' : 'var(--parchment-dark)',
      border: count >= 3 ? '1.5px solid #7b3fa0' : '1px solid var(--border-light)',
      borderRadius: 3 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700,
        color: count >= 3 ? '#7b3fa0' : 'var(--border)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Attunement
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {[0,1,2].map(i => (
          <div key={i} style={{ width: 10, height: 10, borderRadius: '50%',
            background: i < count ? '#7b3fa0' : 'var(--parchment)',
            border: `1.5px solid ${i < count ? '#7b3fa0' : 'var(--border-light)'}` }} />
        ))}
      </div>
      <div style={{ fontSize: 11, color: count >= 3 ? '#7b3fa0' : 'var(--border)', fontWeight: count >= 3 ? 700 : 400 }}>
        {count}/3{count >= 3 ? ' — Limit reached' : ''}
      </div>
      {count > 0 && (
        <div style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--border)', fontStyle: 'italic' }}>
          {attunedItems.map((i) => i.itemDef.name).join(', ')}
        </div>
      )}
    </div>
  );
}

function AttunementButton({ item, attunedCount, onToggle, onLimitReached }: {
  item: InventoryItem;
  attunedCount: number;
  onToggle: (id: string, val: boolean) => void;
  onLimitReached: (id: string) => void;
}) {
  const atLimit = !item.attuned && attunedCount >= 3;
  return (
    <button
      onClick={() => atLimit ? onLimitReached(item.id) : onToggle(item.id, !item.attuned)}
      title={atLimit ? 'Attunement limit reached (3/3)' : item.attuned ? 'Un-attune' : 'Attune'}
      style={{ fontSize: 10, padding: '2px 6px', border: '1px solid var(--border-light)', borderRadius: 2,
        background: item.attuned ? '#7b3fa0' : atLimit ? 'var(--parchment-dark)' : 'var(--parchment)',
        color: item.attuned ? '#fff' : atLimit ? 'var(--border-light)' : 'var(--border)',
        fontFamily: 'var(--font-display)', fontWeight: 600, cursor: atLimit ? 'not-allowed' : 'pointer' }}>
      {item.attuned ? '✦ Att' : 'Att?'}
    </button>
  );
}

// ── Inventory ─────────────────────────────────────────────────────────────
function InventoryTab({ state, dispatch, saveMeta, addInventoryFromSrd, addCustomInventory, patchInventory, deleteInventory, saveKeyAbilities, totalWeight }: any) {
  const [searchQ, setSearchQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [attunementWarning, setAttunementWarning] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [claudeLoading, setClaudeLoading] = useState(false);
  const [claudeError, setClaudeError] = useState('');

  // Custom item state
  const [showCustom, setShowCustom] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [custom, setCustom] = useState<CustomItem>({
    name: '', type: 'Wondrous Item', rarity: '', weight: 0,
    requiresAttunement: false, desc: '',
  });

  function handleParse() {
    if (!pasteText.trim()) return;
    const parsed = parseItemText(pasteText);
    setCustom((prev) => ({ ...prev, ...parsed }));
  }

  async function handleAddCustomItem() {
    if (!custom.name.trim()) return;
    setAdding(true);
    // Pass desc as notes since custom items go through the name-lookup path
    // We inject the description into the name so the API can create a placeholder
    await addCustomInventory(custom.name.trim(), custom);
    setAdding(false);
    setCustom({ name: '', type: 'Wondrous Item', rarity: '', weight: 0, requiresAttunement: false, desc: '' });
    setPasteText('');
    setShowCustom(false);
  }

  async function search() {
    if (!searchQ.trim()) return;
    setSearching(true); setResults([]); setSelected(null); setClaudeError(''); setSearched(false);
    try {
      const r = await fetch(`/api/srd?type=items&ruleset=${state.ruleset}&q=${encodeURIComponent(searchQ)}`);
      if (!r.ok) throw new Error(`Search failed: ${r.status}`);
      const d = await r.json();
      setResults(d.results ?? []);
    } catch (e) {
      console.error('Item search error:', e);
      setResults([]);
    }
    setSearching(false);
    setSearched(true);
  }

  async function askClaude() {
    if (!searchQ.trim()) return;
    setClaudeLoading(true); setClaudeError(''); setSelected(null);
    try {
      const r = await fetch('/api/srd/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'item', name: searchQ.trim() }),
      });
      if (r.status === 404) { setClaudeError(`Claude doesn't recognize "${searchQ}" as an official D&D 5e item. Try the custom form below.`); return; }
      if (!r.ok) throw new Error('Claude lookup failed');
      const d = await r.json();
      setSelected({ ...d.result, _source: 'claude' });
    } catch (e: any) {
      setClaudeError(e?.message ?? 'Claude lookup failed');
    } finally {
      setClaudeLoading(false);
    }
  }

  async function handleAdd() {
    if (!selected) return;
    setAdding(true);
    await addInventoryFromSrd(selected.srdKey ?? selected.name, selected.name, {
      type:               selected.type,
      rarity:             selected.rarity,
      weight:             selected.weight,
      requiresAttunement: selected.requiresAttunement,
      desc:               selected.desc,
    });
    setAdding(false);
    setSelected(null); setResults([]); setSearchQ(''); setSearched(false);
  }

  const inputStyle = { width: '100%', padding: '4px 6px', fontFamily: 'var(--font-body)', fontSize: 13 };
  const rowStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 } as React.CSSProperties;

  return (
    <>
      {/* Currency */}
      <div className="panel">
        <div className="panel-header">Currency</div>
        <div className="panel-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6 }}>
            {['cp','sp','ep','gp','pp'].map((c) => (
              <div key={c} style={{ textAlign: 'center', background: 'var(--parchment)', border: '1.5px solid var(--border-light)', borderRadius: 3, padding: '4px 2px' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 9, fontWeight: 700, color: 'var(--border)', textTransform: 'uppercase' }}>{c.toUpperCase()}</div>
                <input type="number" min={0} value={state.currency[c] ?? 0} onChange={(e) => { const v = parseInt(e.target.value)||0; dispatch({ type:'SET', payload:{ currency:{...state.currency,[c]:v} } }); saveMeta({ currency:{...state.currency,[c]:v} }); }} style={{ width: '100%', textAlign: 'center', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-light)', fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, outline: 'none', marginTop: 2 }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <ActiveItemEffects inventory={state.inventory} />
      {/* SRD Search */}
      <div className="panel">
        <div className="panel-header">Add from {state.ruleset === 'SRD_2014' ? 'SRD 2014' : 'SRD 2024'} Database</div>
        <div className="panel-body">
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <input type="text" placeholder="Search equipment by name…" value={searchQ} onChange={(e) => setSearchQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} style={{ flex: 1 }} />
            <button className="ink-btn" onClick={search} disabled={searching}>{searching ? 'Searching…' : 'Search'}</button>
          </div>
          {!selected && results.length > 0 && (
            <div className="results-list">
              {results.map((it, i) => (
                <div key={i} className="result-item" onClick={() => setSelected(it)}>
                  <div className="result-name">{it.name}</div>
                  <div className="result-meta">{it.type} {it.weight ? '· ' + it.weight + ' lb' : ''} {it.cost ? '· ' + it.cost : ''}</div>
                </div>
              ))}
            </div>
          )}
          {!selected && searched && !searching && results.length === 0 && (
            <div style={{ padding: '10px 0' }}>
              <div style={{ fontSize: 12, color: 'var(--border)', fontStyle: 'italic', marginBottom: 8 }}>
                No results in SRD databases for "{searchQ}".
              </div>
              {claudeError ? (
                <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 8, lineHeight: 1.5 }}>{claudeError}</div>
              ) : (
                <button
                  className="ink-btn"
                  style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
                  onClick={askClaude}
                  disabled={claudeLoading}
                >
                  {claudeLoading ? '⏳ Asking Claude…' : '✦ Ask Claude'}
                </button>
              )}
              {claudeLoading && (
                <div style={{ fontSize: 11, color: 'var(--border)', fontStyle: 'italic', marginTop: 6 }}>
                  Claude is looking up "{searchQ}" from its D&D 5e knowledge…
                </div>
              )}
            </div>
          )}
          {selected && (
            <div className="detail-card">
              {selected._source === 'claude' && (
                <div style={{ fontSize: 10, color: 'var(--gold)', fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: 1, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  ✦ SOURCE: CLAUDE — verify details before adding
                </div>
              )}
              <div className="detail-title">{selected.name}</div>
              <div className="detail-subtitle">{selected.type}</div>
              <div className="detail-props">
                {selected.weight != null && <div className="detail-prop"><div className="dp-label">Weight</div><div className="dp-val">{selected.weight} lb</div></div>}
                {selected.cost && <div className="detail-prop"><div className="dp-label">Cost</div><div className="dp-val">{selected.cost}</div></div>}
                {selected.damage && <div className="detail-prop"><div className="dp-label">Damage</div><div className="dp-val">{selected.damage}</div></div>}
                {selected.armorClass && <div className="detail-prop"><div className="dp-label">AC</div><div className="dp-val">{selected.armorClass}</div></div>}
              </div>
              {selected.desc && <div className="detail-body">{selected.desc}</div>}
              <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
                <button className="ink-btn" onClick={handleAdd} disabled={adding}>{adding ? 'Adding…' : 'Add to Inventory'}</button>
                <button className="ink-btn ghost" onClick={() => setSelected(null)}>Back</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Custom / Non-SRD Item */}
      <div className="panel">
        <div className="panel-header" style={{ cursor: 'pointer' }} onClick={() => setShowCustom((v) => !v)}>
          Add Custom / Non-SRD Item
          <span style={{ marginLeft: 'auto', fontSize: 14 }}>{showCustom ? '▲' : '▼'}</span>
        </div>
        {showCustom && (
          <div className="panel-body">
            {/* Paste area */}
            <div style={{ background: 'var(--parchment)', border: '1.5px solid var(--gold)', borderRadius: 4, padding: 10, marginBottom: 10 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                Paste from wikidot / any site
              </div>
              <div style={{ fontSize: 11, color: 'var(--border)', fontStyle: 'italic', marginBottom: 6 }}>
                Go to dnd5e.wikidot.com, select all the item text, paste it below, then click Parse. Fields will auto-fill — edit anything that didn't parse correctly.
              </div>
              <textarea
                placeholder={'Example:\nStaff of the Woodlands\nStaff, rare (requires attunement by a druid)\n\nThis staff can be wielded as a magic quarterstaff that grants a +2 bonus to attack and damage rolls...'}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={6}
                style={{ width: '100%', resize: 'vertical', fontFamily: 'var(--font-body)', fontSize: 12, padding: '6px 8px' }}
              />
              <button className="ink-btn" style={{ marginTop: 6 }} onClick={handleParse} disabled={!pasteText.trim()}>
                Parse Item Text
              </button>
            </div>

            {/* Editable fields */}
            <div style={{ display: 'grid', gap: 6 }}>
              <div>
                <div className="field-label">Item Name *</div>
                <input type="text" value={custom.name} onChange={(e) => setCustom((p) => ({ ...p, name: e.target.value }))} style={inputStyle} placeholder="e.g. Staff of the Woodlands" />
              </div>
              <div style={rowStyle}>
                <div>
                  <div className="field-label">Type</div>
                  <select value={custom.type} onChange={(e) => setCustom((p) => ({ ...p, type: e.target.value }))} style={inputStyle}>
                    {['Weapon','Armor','Shield','Staff','Rod','Wand','Ring','Potion','Scroll','Wondrous Item','Adventuring Gear','Tool','Ammunition','Other'].map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="field-label">Rarity</div>
                  <select value={custom.rarity} onChange={(e) => setCustom((p) => ({ ...p, rarity: e.target.value }))} style={inputStyle}>
                    <option value="">— None —</option>
                    {['Common','Uncommon','Rare','Very Rare','Legendary','Artifact'].map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={rowStyle}>
                <div>
                  <div className="field-label">Weight (lb)</div>
                  <input type="number" min={0} step={0.1} value={custom.weight} onChange={(e) => setCustom((p) => ({ ...p, weight: parseFloat(e.target.value) || 0 }))} style={inputStyle} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', paddingTop: 18 }}>
                  <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox" checked={custom.requiresAttunement} onChange={(e) => setCustom((p) => ({ ...p, requiresAttunement: e.target.checked }))} />
                    Requires Attunement
                  </label>
                </div>
              </div>
              <div>
                <div className="field-label">Description</div>
                <textarea value={custom.desc} onChange={(e) => setCustom((p) => ({ ...p, desc: e.target.value }))} rows={5} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Item description, properties, charges…" />
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="ink-btn" onClick={handleAddCustomItem} disabled={adding || !custom.name.trim()}>
                  {adding ? 'Adding…' : 'Add to Inventory'}
                </button>
                <button className="ink-btn ghost" onClick={() => { setShowCustom(false); setPasteText(''); setCustom({ name: '', type: 'Wondrous Item', rarity: '', weight: 0, requiresAttunement: false, desc: '' }); }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Inventory list */}
      <div className="panel">
        <div className="panel-header">Equipment &amp; Items</div>
        <div className="panel-body">
          {/* Attunement tracker */}
          <AttunementTracker inventory={state.inventory} />
          {/* Attunement limit warning */}
          {attunementWarning && (
            <div style={{ marginBottom: 8, padding: '8px 10px', background: '#fff0f0',
              border: '1.5px solid var(--red)', borderRadius: 4, fontSize: 12,
              display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 16 }}>⚠️</div>
              <div style={{ flex: 1, color: 'var(--ink)' }}>
                <strong>Attunement limit reached.</strong> You can only be attuned to 3 magic items at once (PHB p. 138).
                Un-attune an existing item first.
              </div>
              <button onClick={() => setAttunementWarning(null)}
                style={{ fontSize: 11, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--border)' }}>✕</button>
            </div>
          )}
          <div style={{ fontSize: 12, color: 'var(--border)', fontStyle: 'italic', marginBottom: 6 }}>
            Total: {totalWeight.toFixed(1)} lb · Capacity: {state.abilities.STR * 15} lb
          </div>
          {state.inventory.map((it: InventoryItem) => (
            <div key={it.id} style={{ padding: '6px 0', borderBottom: '0.5px solid var(--parchment-dark)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto auto', gap: 6, alignItems: 'start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <div style={{ fontWeight: 600, fontSize: 13, cursor: 'pointer', color: expandedId === it.id ? 'var(--gold)' : 'var(--ink)' }} onClick={() => setExpandedId(expandedId === it.id ? null : it.id)}>{it.itemDef.name}</div>
                    {it.notes && (
                      <span title={it.notes} style={{ fontSize: 10, color: 'var(--gold)', cursor: 'pointer' }} onClick={() => setExpandedId(expandedId === it.id ? null : it.id)}>📝</span>
                    )}
                    {it.itemDef.rarity && (
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 2, border: '1px solid var(--border-light)', color: it.itemDef.rarity === 'Legendary' ? '#b8860b' : it.itemDef.rarity === 'Very Rare' ? '#7b3fa0' : it.itemDef.rarity === 'Rare' ? '#1a6b9a' : it.itemDef.rarity === 'Uncommon' ? '#2e7d32' : 'var(--border)', background: 'var(--parchment)' }}>
                        {it.itemDef.rarity}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--border)', fontStyle: 'italic' }}>
                    {it.itemDef.type || 'Gear'} · {it.itemDef.weight ?? 0} lb
                    {it.itemDef.requiresAttunement ? ' · Requires attunement' : ''}
                    {it.attuned ? ' · ✦ Attuned' : ''}
                  </div>
                  {expandedId === it.id && (
                    <div style={{ marginTop: 6 }}>
                      <KeyAbilitiesEditor item={it} onSave={saveKeyAbilities} />
                      {it.itemDef.text && (
                        <div style={{ fontSize: 12, color: 'var(--ink-light)', lineHeight: 1.6, padding: 8, background: 'var(--parchment)', border: '1px solid var(--border-light)', borderRadius: 3, whiteSpace: 'pre-wrap', marginBottom: 6, marginTop: 6 }}>
                          {it.itemDef.text}
                        </div>
                      )}
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--border)', cursor: 'pointer', padding: '2px 0' }}>
                        <input
                          type="checkbox"
                          checked={!!it.itemDef.requiresAttunement}
                          onChange={(e) => patchInventory(it.id, { requiresAttunement: e.target.checked })}
                        />
                        Requires Attunement
                      </label>
                      <div style={{ marginTop: 6 }}>
                        <div className="field-label" style={{ marginBottom: 3 }}>Notes</div>
                        <textarea
                          rows={2}
                          value={it.notes ?? ''}
                          onChange={(e) => dispatch({ type: 'UPDATE_INVENTORY', id: it.id, patch: { notes: e.target.value } })}
                          onBlur={(e) => patchInventory(it.id, { notes: e.target.value || null })}
                          placeholder="Personal notes about this item…"
                          style={{ width: '100%', fontFamily: 'var(--font-body)', fontSize: 12, padding: '4px 6px', border: '1px solid var(--border-light)', borderRadius: 3, background: 'var(--parchment)', resize: 'vertical', color: 'var(--ink)' }}
                        />
                      </div>
                    </div>
                  )}
                </div>
                <input type="number" min={1} value={it.quantity} onChange={(e) => patchInventory(it.id, { quantity: parseInt(e.target.value)||1 })} style={{ width: 48, textAlign: 'center', padding: '2px 4px' }} />
                {it.itemDef.requiresAttunement && (
                  <AttunementButton
                    item={it}
                    attunedCount={state.inventory.filter((i: InventoryItem) => i.attuned).length}
                    onToggle={(id, val) => {
                      setAttunementWarning(null);
                      patchInventory(id, { attuned: val });
                    }}
                    onLimitReached={(id) => setAttunementWarning(id)}
                  />
                )}
                <button onClick={() => patchInventory(it.id, { equipped: !it.equipped })} style={{ fontSize: 10, padding: '2px 6px', border: '1px solid var(--border-light)', borderRadius: 2, background: it.equipped ? 'var(--ink)' : 'var(--parchment)', color: it.equipped ? 'var(--gold-light)' : 'var(--border)', fontFamily: 'var(--font-display)', fontWeight: 600, cursor: 'pointer' }}>
                  {it.equipped ? 'Eq' : 'Eq?'}
                </button>
                <button onClick={() => deleteInventory(it.id)} style={{ fontSize: 11, background: 'none', border: 'none', color: 'var(--border)', cursor: 'pointer', padding: '0 4px' }}>✕</button>
              </div>
            </div>
          ))}
          {state.inventory.length === 0 && <div className="empty-state">No items yet. Search above to add equipment.</div>}
        </div>
      </div>
    </>
  );
}

// ── Features ──────────────────────────────────────────────────────────────
function FeaturesTab({ state, addFeature, removeFeature }: any) {
  const [name, setName] = useState('');
  const [source, setSource] = useState('');
  const [desc, setDesc] = useState('');

  async function handleAdd() {
    if (!name.trim()) return;
    await addFeature({ name: name.trim(), source: source.trim() || '—', desc: desc.trim() });
    setName(''); setSource(''); setDesc('');
  }

  return (
    <div className="panel">
      <div className="panel-header">Features &amp; Traits</div>
      <div className="panel-body">
        {state.features.map((f: Feature) => (
          <div key={f.id} style={{ padding: '6px 0', borderBottom: '0.5px solid var(--parchment-dark)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 600 }}>{f.name}</div>
                <div style={{ fontSize: 11, color: 'var(--border)', fontStyle: 'italic' }}>{f.source}</div>
              </div>
              <button onClick={() => f.id && removeFeature(f.id)} style={{ fontSize: 11, background: 'none', border: 'none', color: 'var(--border)', cursor: 'pointer' }}>✕</button>
            </div>
            {f.desc && <div style={{ fontSize: 12, color: 'var(--ink-light)', marginTop: 3, lineHeight: 1.4 }}>{f.desc}</div>}
          </div>
        ))}
        {state.features.length === 0 && <div className="empty-state">No features yet</div>}
        <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
          <input type="text" placeholder="Feature name…" value={name} onChange={(e) => setName(e.target.value)} />
          <input type="text" placeholder="Source (e.g. Ranger 1)…" value={source} onChange={(e) => setSource(e.target.value)} />
          <textarea placeholder="Description…" rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} style={{ resize: 'vertical' }} />
          <button className="ink-btn" onClick={handleAdd} style={{ alignSelf: 'flex-start' }}>Add Feature</button>
        </div>
      </div>
    </div>
  );
}

// ── Campaigns ─────────────────────────────────────────────────────────────

interface CampaignMembership {
  id: string;
  role: 'DM' | 'PLAYER';
  campaign: {
    id: string;
    name: string;
    description: string | null;
    members: Array<{ user: { id: string; name: string | null; email: string } }>;
    sessions: Array<{ id: string; sessionNumber: number; title: string | null; createdAt: string }>;
    _count: { sessions: number };
  };
}

function CampaignsTab({ characterId }: { characterId: string }) {
  const [memberships, setMemberships] = useState<CampaignMembership[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/characters/${characterId}/campaigns`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => setMemberships(d.memberships ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [characterId]);

  if (loading) return <div className="empty-state">Loading…</div>;

  if (memberships.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--border)' }}>
        <div style={{ fontSize: 28, marginBottom: 10 }}>⚔️</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, marginBottom: 8 }}>Not in any campaigns</div>
        <div style={{ fontSize: 12, fontStyle: 'italic', marginBottom: 16 }}>
          This character hasn&apos;t been linked to a campaign yet.
        </div>
        <a href="/campaigns" style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--gold)', textDecoration: 'none' }}>
          → Go to Campaigns
        </a>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {memberships.map(m => {
        const dm = m.campaign.members[0];
        const lastSession = m.campaign.sessions[0];
        return (
          <a key={m.id} href={`/campaigns/${m.campaign.id}`} style={{ textDecoration: 'none' }}>
            <div
              className="panel"
              style={{ padding: 0, cursor: 'pointer', transition: 'border-color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--gold)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-light)')}
            >
              <div className="panel-header" style={{ justifyContent: 'space-between' }}>
                <span>{m.campaign.name}</span>
                <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.75, letterSpacing: 0 }}>
                  {m.role === 'DM' ? '👑 DM' : 'Player'} · {m.campaign._count.sessions} session{m.campaign._count.sessions !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="panel-body" style={{ padding: '10px 12px' }}>
                {m.campaign.description && (
                  <div style={{ fontSize: 12, color: 'var(--ink-light)', fontStyle: 'italic', marginBottom: 6 }}>
                    {m.campaign.description}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--border)' }}>
                  {dm && <span>DM: <strong style={{ color: 'var(--ink)' }}>{dm.user.name ?? dm.user.email}</strong></span>}
                  {lastSession ? (
                    <span>
                      Last: Session #{lastSession.sessionNumber}
                      {lastSession.title ? ` — ${lastSession.title}` : ''} ·{' '}
                      {new Date(lastSession.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                  ) : (
                    <span>No sessions yet</span>
                  )}
                </div>
              </div>
            </div>
          </a>
        );
      })}
      <div style={{ textAlign: 'right', marginTop: 4 }}>
        <a href="/campaigns" style={{ fontSize: 11, color: 'var(--border)', textDecoration: 'none' }}>
          View all campaigns →
        </a>
      </div>
    </div>
  );
}

// ── Notes ─────────────────────────────────────────────────────────────────
type Note = { id: string; title: string; body: string; sortOrder: number; updatedAt: string };

function NotesTab({ characterId }: { characterId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [preview, setPreview] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | null>(null);

  const activeNote = notes.find((n) => n.id === activeId) ?? null;

  // Load notes on mount
  useEffect(() => {
    fetch(`/api/characters/${characterId}/notes`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        const loaded = data.notes ?? [];
        setNotes(loaded);
        if (loaded.length > 0) setActiveId(loaded[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [characterId]);

  async function createNote() {
    setCreating(true);
    try {
      const res = await fetch(`/api/characters/${characterId}/notes`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Note', body: '' }),
      });
      const note = await res.json();
      setNotes((prev) => [...prev, note]);
      setActiveId(note.id);
      setPreview(false);
    } finally {
      setCreating(false);
    }
  }

  async function deleteNote(id: string) {
    if (!confirm('Delete this note?')) return;
    await fetch(`/api/characters/${characterId}/notes/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    setNotes((prev) => prev.filter((n) => n.id !== id));
    setActiveId((prev) => {
      if (prev !== id) return prev;
      const remaining = notes.filter((n) => n.id !== id);
      return remaining[0]?.id ?? null;
    });
  }

  function patchLocal(id: string, patch: Partial<Note>) {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  }

  function scheduleAutosave(id: string, patch: Partial<Note>) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveStatus('saving');
    saveTimer.current = setTimeout(async () => {
      await fetch(`/api/characters/${characterId}/notes/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 1500);
    }, 1000);
  }

  function onTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!activeNote) return;
    const title = e.target.value;
    patchLocal(activeNote.id, { title });
    scheduleAutosave(activeNote.id, { title });
  }

  function onBodyChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    if (!activeNote) return;
    const body = e.target.value;
    patchLocal(activeNote.id, { body });
    scheduleAutosave(activeNote.id, { body });
  }

  // Simple markdown renderer using marked
  function renderMarkdown(text: string): string {
    try {
      const { marked } = require('marked');
      return marked.parse(text, { breaks: true, gfm: true }) as string;
    } catch {
      return text.replace(/\n/g, '<br/>');
    }
  }

  if (loading) return <div style={{ padding: 12, color: 'var(--border)' }}>Loading…</div>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 10, minHeight: 400 }}>
      {/* Sidebar */}
      <div className="panel" style={{ margin: 0 }}>
        <div className="panel-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Notes</span>
          <button
            onClick={createNote}
            disabled={creating}
            title="New note"
            style={{ background: 'none', border: 'none', color: 'var(--gold-light)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}
          >
            +
          </button>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {notes.length === 0 && (
            <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--border)', fontStyle: 'italic' }}>
              No notes yet.
            </div>
          )}
          {notes.map((n) => (
            <div
              key={n.id}
              onClick={() => setActiveId(n.id)}
              style={{
                padding: '8px 10px',
                borderBottom: '0.5px solid var(--parchment-dark)',
                cursor: 'pointer',
                background: activeId === n.id ? 'var(--parchment-dark)' : 'transparent',
                borderLeft: activeId === n.id ? '3px solid var(--gold)' : '3px solid transparent',
              }}
            >
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: 11,
                fontWeight: 600,
                color: activeId === n.id ? 'var(--ink)' : 'var(--ink-light)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {n.title || 'Untitled'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--border)', marginTop: 2 }}>
                {new Date(n.updatedAt).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Editor */}
      <div className="panel" style={{ margin: 0, display: 'flex', flexDirection: 'column' }}>
        {!activeNote ? (
          <div className="panel-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
            <div className="empty-state">
              {notes.length === 0 ? 'Create your first note using the + button.' : 'Select a note to edit.'}
            </div>
          </div>
        ) : (
          <>
            <div className="panel-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="text"
                value={activeNote.title}
                onChange={onTitleChange}
                style={{
                  flex: 1,
                  fontFamily: 'var(--font-display)',
                  fontSize: 13,
                  fontWeight: 600,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--gold-light)',
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                {saveStatus && (
                  <span style={{ fontSize: 10, color: saveStatus === 'saved' ? 'var(--gold)' : 'var(--border)', fontStyle: 'italic' }}>
                    {saveStatus === 'saving' ? 'Saving…' : '✓ Saved'}
                  </span>
                )}
                <button
                  onClick={() => setPreview((v) => !v)}
                  style={{
                    fontSize: 10,
                    padding: '2px 8px',
                    border: '1px solid var(--border-light)',
                    borderRadius: 3,
                    background: preview ? 'var(--gold)' : 'transparent',
                    color: preview ? 'var(--ink)' : 'var(--border)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-display)',
                    fontWeight: 600,
                  }}
                >
                  {preview ? 'Edit' : 'Preview'}
                </button>
                <button
                  onClick={() => deleteNote(activeNote.id)}
                  style={{ fontSize: 11, background: 'none', border: 'none', color: 'var(--border)', cursor: 'pointer' }}
                  title="Delete note"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="panel-body" style={{ flex: 1, padding: preview ? '10px 12px' : 4 }}>
              {preview ? (
                <div
                  style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--ink)' }}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(activeNote.body) }}
                />
              ) : (
                <textarea
                  value={activeNote.body}
                  onChange={onBodyChange}
                  placeholder="Write your notes here… (Markdown supported)"
                  style={{
                    width: '100%',
                    height: '100%',
                    minHeight: 320,
                    resize: 'vertical',
                    fontFamily: 'var(--font-body)',
                    fontSize: 13,
                    lineHeight: 1.6,
                    padding: '8px 10px',
                    border: '1px solid var(--border-light)',
                    borderRadius: 3,
                    background: 'var(--parchment)',
                    color: 'var(--ink)',
                    outline: 'none',
                  }}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Bio ───────────────────────────────────────────────────────────────────
function BioTab({ state, dispatch, saveMeta, saveCharacterMeta, saveClasses, deleteCharacter, setShowLevelUp }: any) {
  const [editName, setEditName] = useState(state.name);
  const [editLevel, setEditLevel] = useState(state.level);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [editClasses, setEditClasses] = useState<CharClass[]>(state.classes);

  async function handleSaveMeta() {
    setSaving(true);
    await saveCharacterMeta({ name: editName, level: editLevel });
    setMsg('Saved'); setTimeout(() => setMsg(null), 1500);
    setSaving(false);
  }

  async function handleSaveClasses() {
    setSaving(true);
    await saveClasses(editClasses);
    setMsg('Classes saved'); setTimeout(() => setMsg(null), 1500);
    setSaving(false);
  }

  function loadPortrait(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show preview immediately via local state
    const reader = new FileReader();
    reader.onload = (ev) => dispatch({ type: 'SET', payload: { portrait: ev.target?.result as string } });
    reader.readAsDataURL(file);

    // Persist to server
    const formData = new FormData();
    formData.append('portrait', file);
    fetch(`/api/characters/${state.id}/portrait`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.portrait) {
          // Update state with the server URL so it persists across refreshes
          dispatch({ type: 'SET', payload: { portrait: data.portrait } });
        }
      })
      .catch(() => {
        // Preview still shows, just won't persist — acceptable degradation
      });
  }

  function updateBioField(k: string, v: string) {
    const bio = { ...state.bio, [k]: v };
    dispatch({ type: 'SET', payload: { bio } });
    saveMeta({ bio });
  }

  return (
    <>
      <div className="panel">
        <div className="panel-header">Character Info</div>
        <div className="panel-body" style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><div className="field-label">Name</div><input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} style={{ width: '100%' }} /></div>
            <div><div className="field-label">Level</div><input type="number" min={1} max={20} value={editLevel} onChange={(e) => setEditLevel(parseInt(e.target.value)||1)} style={{ width: '100%' }} /></div>
            {[['race','Race'],['background','Background'],['alignment','Alignment']].map(([k,l]) => (
              <div key={k}><div className="field-label">{l}</div><input type="text" value={state[k] || ''} onChange={(e) => { dispatch({ type:'SET', payload:{ [k]:e.target.value } }); saveMeta({ [k]:e.target.value }); }} style={{ width: '100%' }} /></div>
            ))}
            <div><div className="field-label">XP</div><input type="number" min={0} value={state.xp} onChange={(e) => { const v=parseInt(e.target.value)||0; dispatch({ type:'SET', payload:{xp:v} }); saveMeta({xp:v}); }} style={{ width: '100%' }} /></div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="ink-btn" onClick={handleSaveMeta} disabled={saving}>{saving ? 'Saving…' : 'Save Name & Level'}</button>
            {editLevel > state.level && (
              <button className="ink-btn" onClick={handleSaveMeta} disabled={saving}
                style={{ background: 'var(--gold)', color: 'var(--ink)', border: '2px solid var(--gold)', fontWeight: 700 }}>
                ⬆ Level Up to {editLevel}!
              </button>
            )}
            <button className="ink-btn ghost" onClick={() => setShowLevelUp(true)}
              title="Re-open the level-up guide for the current level">
              ↺ Re-run Level Up
            </button>
            {msg && <span className="success-text">{msg}</span>}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">Classes</div>
        <div className="panel-body">
          {editClasses.map((c, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 60px 60px auto', gap: 6, alignItems: 'center', padding: '4px 0', borderBottom: '0.5px solid var(--parchment-dark)' }}>
              <input type="text" placeholder="Class name" value={c.name} onChange={(e) => setEditClasses(editClasses.map((ec,j)=>j===i?{...ec,name:e.target.value}:ec))} />
              <input type="text" placeholder="Subclass" value={c.subclass} onChange={(e) => setEditClasses(editClasses.map((ec,j)=>j===i?{...ec,subclass:e.target.value}:ec))} />
              <input type="number" min={1} max={20} placeholder="Lvl" value={c.level} onChange={(e) => setEditClasses(editClasses.map((ec,j)=>j===i?{...ec,level:parseInt(e.target.value)||1}:ec))} />
              <select value={c.hitDie} onChange={(e) => setEditClasses(editClasses.map((ec,j)=>j===i?{...ec,hitDie:parseInt(e.target.value)}:ec))}>
                {[6,8,10,12].map((d) => <option key={d} value={d}>d{d}</option>)}
              </select>
              <button onClick={() => setEditClasses(editClasses.filter((_,j)=>j!==i))} style={{ background: 'none', border: 'none', color: 'var(--border)', cursor: 'pointer', fontSize: 13 }}>✕</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="ink-btn ghost" onClick={() => setEditClasses([...editClasses, { name: '', subclass: '', level: 1, hitDie: 8 }])}>+ Add Class</button>
            <button className="ink-btn" onClick={handleSaveClasses} disabled={saving}>Save Classes</button>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">Portrait</div>
        <div className="panel-body" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div onClick={() => fileRef.current?.click()} style={{ width: 88, height: 88, borderRadius: '50%', border: '2.5px solid var(--gold)', background: 'var(--parchment-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, cursor: 'pointer', overflow: 'hidden' }}>
            {state.portrait ? <img src={state.portrait} alt="portrait" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🧝'}
          </div>
          <div>
            <button className="ink-btn" onClick={() => fileRef.current?.click()}>Upload Portrait</button>
            {state.portrait && <button className="ink-btn danger" style={{ marginLeft: 8 }} onClick={() => {
              dispatch({ type: 'SET', payload: { portrait: null } });
              fetch(`/api/characters/${state.id}/portrait`, { method: 'DELETE', credentials: 'include' }).catch(() => {});
            }}>Remove</button>}
            <div style={{ fontSize: 11, color: 'var(--border)', fontStyle: 'italic', marginTop: 4 }}>PNG or JPG</div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={loadPortrait} />
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">Physical Description</div>
        <div className="panel-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '6px 12px' }}>
            {['age','height','weight','eyes','skin','hair'].map((k) => (
              <div key={k}><div className="field-label">{k}</div><input type="text" value={state.bio[k]||''} onChange={(e) => updateBioField(k, e.target.value)} style={{ width: '100%' }} /></div>
            ))}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">Character Details</div>
        <div className="panel-body" style={{ display: 'grid', gap: 8 }}>
          {[['personalityTraits','Personality Traits',2],['ideals','Ideals',2],['bonds','Bonds',2],['flaws','Flaws',2],['backstory','Backstory',4]].map(([k,l,r]) => (
            <div key={k as string}><div className="field-label">{l}</div><textarea rows={r as number} value={state.bio[k as string]||''} onChange={(e) => updateBioField(k as string, e.target.value)} style={{ width: '100%', resize: 'vertical' }} /></div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header" style={{ background: 'var(--red)' }}>Danger Zone</div>
        <div className="panel-body">
          <button className="ink-btn danger" onClick={deleteCharacter}>Delete Character</button>
          <div style={{ fontSize: 11, color: 'var(--border)', fontStyle: 'italic', marginTop: 4 }}>This cannot be undone.</div>
        </div>
      </div>
    </>
  );
}

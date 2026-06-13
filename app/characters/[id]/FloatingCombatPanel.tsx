'use client';

import { useEffect, useRef, useState } from 'react';

type AbilityKey = 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';

interface SpellcastingInfo {
  abilityKey: AbilityKey;
  saveDC: number;
  attackBonus: number;
}

interface Props {
  name: string;
  level: number;
  hp: { current: number; max: number; temp: number };
  ac: number;
  speed: number;
  proficiencyBonus: number;
  mods: Record<AbilityKey, number>;
  saveMod: (ab: AbilityKey) => number;
  spellcasting?: SpellcastingInfo | null;
}

const ABS: AbilityKey[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

function fmt(n: number) { return (n >= 0 ? '+' : '') + n; }

const STORAGE_KEY = 'dnd_floating_panel';

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: 'center', background: 'var(--parchment-dark,#ede8df)', border: '1px solid var(--border-light)', borderRadius: 3, padding: '4px 2px' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--border)', marginBottom: 1 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{value}</div>
    </div>
  );
}

export default function FloatingCombatPanel({ name, level, hp, ac, speed, proficiencyBonus, mods, saveMod, spellcasting }: Props) {
  const [visible, setVisible] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = loadState();
    if (saved) {
      if (saved.visible !== undefined) setVisible(saved.visible);
      if (saved.collapsed !== undefined) setCollapsed(saved.collapsed);
      if (saved.pos) setPos(saved.pos);
    }
    if (!saved?.pos) {
      setPos({ x: window.innerWidth - 230, y: window.innerHeight - 380 });
    }
  }, []);

  useEffect(() => {
    if (pos === null) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ visible, collapsed, pos })); } catch {}
  }, [visible, collapsed, pos]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current || !panelRef.current) return;
      setPos({
        x: Math.max(0, Math.min(e.clientX - dragOffset.current.x, window.innerWidth - panelRef.current.offsetWidth)),
        y: Math.max(0, Math.min(e.clientY - dragOffset.current.y, window.innerHeight - 60 - panelRef.current.offsetHeight)),
      });
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  const onHeaderMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    dragOffset.current = { x: e.clientX - (pos?.x ?? 0), y: e.clientY - (pos?.y ?? 0) };
    e.preventDefault();
  };

  const hpPct = hp.max > 0 ? Math.round((hp.current / hp.max) * 100) : 0;
  const hpColor = hpPct <= 25 ? '#8b1a1a' : hpPct <= 50 ? '#b35c00' : '#3d6b2a';

  if (pos === null) return null;

  const sectionLabel = (text: string) => (
    <div style={{ fontFamily: 'var(--font-display)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: 'var(--border)', marginBottom: 4 }}>
      {text}
    </div>
  );

  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        title="Show combat stats"
        style={{
          position: 'fixed', bottom: 64, right: 12, zIndex: 1000,
          width: 36, height: 36,
          background: 'var(--ink)', border: '1.5px solid var(--gold)', borderRadius: 4,
          color: 'var(--gold)', fontSize: 16, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
        }}
      >
        ⚔
      </button>
    );
  }

  return (
    <div
      ref={panelRef}
      style={{
        position: 'fixed', left: pos.x, top: pos.y, zIndex: 1000,
        width: 210,
        background: 'var(--parchment)',
        border: '1.5px solid var(--gold)',
        borderRadius: 4,
        boxShadow: '0 4px 18px rgba(0,0,0,0.4)',
        fontFamily: 'var(--font-body)',
        userSelect: 'none',
      }}
    >
      {/* Drag handle */}
      <div
        onMouseDown={onHeaderMouseDown}
        style={{
          background: 'var(--ink)', color: 'var(--gold-light)',
          padding: '5px 8px', cursor: 'grab', borderRadius: '3px 3px 0 0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' }}>
          ⚔ Combat Stats
        </span>
        <div style={{ display: 'flex', gap: 2 }}>
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Expand' : 'Collapse'}
            style={{ background: 'none', border: 'none', color: 'var(--gold)', cursor: 'pointer', fontSize: 13, padding: '0 4px', lineHeight: 1 }}
          >
            {collapsed ? '+' : '−'}
          </button>
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={() => setVisible(false)}
            title="Hide"
            style={{ background: 'none', border: 'none', color: 'var(--gold)', cursor: 'pointer', fontSize: 13, padding: '0 4px', lineHeight: 1 }}
          >
            ×
          </button>
        </div>
      </div>

      {collapsed ? (
        <div style={{ padding: '5px 10px', display: 'flex', gap: 8, alignItems: 'center', fontFamily: 'var(--font-display)', fontSize: 11, flexWrap: 'wrap' }}>
          <span style={{ color: hpColor, fontWeight: 700 }}>HP {hp.current}/{hp.max}</span>
          <span style={{ color: 'var(--border-light)' }}>|</span>
          <span style={{ color: 'var(--ink)', fontWeight: 700 }}>AC {ac}</span>
          {spellcasting && <>
            <span style={{ color: 'var(--border-light)' }}>|</span>
            <span style={{ color: 'var(--ink)', fontWeight: 700 }}>DC {spellcasting.saveDC}</span>
          </>}
        </div>
      ) : (
        <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Name */}
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, color: 'var(--ink)', borderBottom: '1px solid var(--border-light)', paddingBottom: 4 }}>
            {name} · Lv {level}
          </div>

          {/* HP */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--border)' }}>HP</span>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: hpColor }}>
                {hp.current} / {hp.max}{hp.temp > 0 ? ` +${hp.temp}` : ''}
              </span>
            </div>
            <div style={{ height: 5, background: 'var(--border-light)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, hpPct))}%`, background: hpColor, borderRadius: 2, transition: 'width 0.3s' }} />
            </div>
          </div>

          {/* Core stats: AC / SPD / PROF */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
            <StatBox label="AC"   value={String(ac)} />
            <StatBox label="SPD"  value={speed + 'ft'} />
            <StatBox label="PROF" value={'+' + proficiencyBonus} />
          </div>

          {/* Spellcasting (casters only) */}
          {spellcasting && (
            <div>
              {sectionLabel(`Spellcasting · ${spellcasting.abilityKey}`)}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                <StatBox label="Save DC"    value={String(spellcasting.saveDC)} />
                <StatBox label="Atk Bonus"  value={fmt(spellcasting.attackBonus)} />
              </div>
            </div>
          )}

          {/* Saving throws */}
          <div>
            {sectionLabel('Saving Throws')}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '3px 6px' }}>
              {ABS.map(ab => (
                <div key={ab} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 9, color: 'var(--border)', fontWeight: 700 }}>{ab}</span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, color: 'var(--ink)' }}>{fmt(saveMod(ab))}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

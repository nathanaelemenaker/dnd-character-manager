// app/characters/[id]/ClassGuideTab.tsx
'use client';

import { useEffect, useState } from 'react';

interface CharClass { name: string; subclass: string; level: number; hitDie: number; }
interface Feature { id?: string; name: string; source: string; desc: string; }
interface SrdFeature { name: string; index: string; desc: string; }
interface LevelEntry {
  level: number; profBonus: number; features: SrdFeature[];
  spellSlots: { cantripsKnown: number; spellsKnown: number | null; slots: number[] } | null;
  abilityScoreImprovement: boolean; subclassUnlock: boolean;
}
interface SubclassOption { index: string; name: string; desc: string; }
interface ClassData {
  name: string; hitDie: number; subclassLabel: string; subclassLevel: number;
  spellcasting: { ability: string } | null;
  levels: LevelEntry[]; subclasses: SubclassOption[]; subclassesLoading: boolean;
}

const ph: React.CSSProperties = { background:'var(--ink)', color:'var(--gold-light)', fontFamily:'var(--font-display)', fontSize:11, fontWeight:700, letterSpacing:1.5, textTransform:'uppercase', padding:'5px 10px', display:'flex', alignItems:'center', justifyContent:'space-between' };
const panel: React.CSSProperties = { background:'var(--section-bg)', border:'1.5px solid var(--border-light)', borderRadius:4, marginBottom:10, overflow:'hidden' };
const pb: React.CSSProperties = { padding:10 };

// Parse Claude plain-text subclass output into the same structure as SRD level data.
// Expected format: "Level 3 — Feature Name\nDescription text\n\nLevel 6 — ..."
function parseSubclaudeText(text: string): { level: number; features: SrdFeature[] }[] {
  const headingRe = /^Level\s+(\d+)\s*[—–\-:]\s*(.+)$/i;
  const flat: { level: number; name: string; descLines: string[] }[] = [];
  let current: { level: number; name: string; descLines: string[] } | null = null;
  for (const line of text.split('\n')) {
    const m = line.trim().match(headingRe);
    if (m) {
      if (current) flat.push(current);
      current = { level: parseInt(m[1]), name: m[2].trim(), descLines: [] };
    } else if (current) {
      current.descLines.push(line);
    }
  }
  if (current) flat.push(current);

  const byLevel = new Map<number, SrdFeature[]>();
  for (const f of flat) {
    if (!byLevel.has(f.level)) byLevel.set(f.level, []);
    byLevel.get(f.level)!.push({
      index: `claude-${f.level}-${f.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      name: f.name,
      desc: f.descLines.join('\n').trim(),
    });
  }
  return Array.from(byLevel.entries())
    .sort(([a], [b]) => a - b)
    .map(([level, features]) => ({ level, features }));
}

// Parse Claude plain-text race output into a flat trait list.
// Expected format: "Trait Name\nDescription\n\nNext Trait\nDescription"
function parseRaceText(text: string): SrdFeature[] {
  return text.split(/\n\n+/)
    .map(block => {
      const lines = block.trim().split('\n');
      const name = lines[0]?.trim();
      if (!name) return null;
      return {
        index: `race-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        name,
        desc: lines.slice(1).join('\n').trim(),
      };
    })
    .filter((t): t is SrdFeature => t !== null && t.name.length > 0);
}

function SlotPips({ slots }: { slots: number[] }) {
  const hasSlots = slots.some((s) => s > 0);
  if (!hasSlots) return null;
  return (
    <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:4, marginBottom:4 }}>
      {slots.map((max, i) => max > 0 && (
        <div key={i} style={{ textAlign:'center' }}>
          <div style={{ fontFamily:'var(--font-display)', fontSize:8, color:'var(--border)', textTransform:'uppercase', marginBottom:2 }}>Lv{i+1}</div>
          <div style={{ display:'flex', gap:2 }}>
            {Array.from({length:max}).map((_, j) => (
              <div key={j} style={{ width:10, height:10, borderRadius:'50%', border:'1.5px solid var(--gold)', background:'var(--parchment)' }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Claude subclass/race lookup ───────────────────────────────────────────────
async function claudeLookup(prompt: string): Promise<string> {
  const r = await fetch('/api/srd/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'guide', prompt }),
  });
  if (!r.ok) throw new Error('Claude lookup failed');
  const d = await r.json();
  return d.result?.text ?? '';
}

export default function ClassGuideTab({
  classes, currentLevel, saveClasses, features, addFeature, race,
}: {
  classes: CharClass[];
  currentLevel: number;
  saveClasses: (c: CharClass[]) => void;
  features: Feature[];
  addFeature: (f: { name: string; source: string; desc: string }) => Promise<void>;
  race: string;
}) {
  const [data, setData] = useState<Record<string, ClassData>>({});
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [errorMap, setErrorMap] = useState<Record<string, string>>({});
  const [activeClass, setActiveClass] = useState(classes[0]?.name ?? '');
  const [viewMode, setViewMode] = useState<'progression'|'subclasses'|'missing'|'race'>('progression');
  const [expandedLevel, setExpandedLevel] = useState<string|null>(null);
  const [expandedFeature, setExpandedFeature] = useState<string|null>(null);
  const [expandedSub, setExpandedSub] = useState<string|null>(null);
  const [addingFeature, setAddingFeature] = useState<string|null>(null);

  // SRD subclass level progression
  const [subclassLevels, setSubclassLevels] = useState<Record<string, { level: number; features: SrdFeature[] }[]>>({});
  const [subclassLevelsLoading, setSubclassLevelsLoading] = useState<Record<string, boolean>>({});

  // Claude subclass features (non-SRD fallback)
  const [subclaudeText, setSubclaudeText] = useState<Record<string, string>>({});
  const [subclaudeLoading, setSubclaudeLoading] = useState<Record<string, boolean>>({});
  const [subclaudeError, setSubclaudeError] = useState<Record<string, string>>({});
  const [subclaudeSource, setSubclaudeSource] = useState<Record<string, 'cache' | 'claude'>>({});
  const [subclaudeCachedAt, setSubclaudeCachedAt] = useState<Record<string, string>>({});

  // Claude race features
  const [raceText, setRaceText] = useState('');
  const [raceLoading, setRaceLoading] = useState(false);
  const [raceError, setRaceError] = useState('');
  const [raceSource, setRaceSource] = useState<'cache' | 'claude' | null>(null);
  const [raceCachedAt, setRaceCachedAt] = useState<string | null>(null);

  const cls = classes.find((c) => c.name === activeClass);
  const cd = data[activeClass];

  useEffect(() => {
    if (!activeClass || data[activeClass] || loadingMap[activeClass]) return;
    load(activeClass);
  }, [activeClass]);

  // Auto-load subclass content when the subclass view is active
  useEffect(() => {
    if (viewMode !== 'subclasses' || !cls?.subclass || !cd) return;
    const srdMatch = cd.subclasses.find((sc: any) => sc.name === cls.subclass);
    if (srdMatch) loadSubclassLevels(srdMatch.index);
    else loadSubclaudeFeatures(cls);
  }, [viewMode, cls?.subclass, cd]);

  async function load(name: string) {
    setLoadingMap((p) => ({ ...p, [name]: true }));
    try {
      const [cr, sr] = await Promise.all([
        fetch(`/api/srd/class?name=${encodeURIComponent(name)}`),
        fetch(`/api/srd/class?name=${encodeURIComponent(name)}&subclasses=true`),
      ]);
      if (!cr.ok) throw new Error('Class not found in SRD');
      const cd = await cr.json();
      const sd = sr.ok ? await sr.json() : { subclasses: [] };
      setData((p) => ({ ...p, [name]: { ...cd, subclasses: sd.subclasses ?? [], subclassesLoading: false } }));
    } catch (e: any) {
      setErrorMap((p) => ({ ...p, [name]: e.message ?? 'Load failed' }));
    }
    setLoadingMap((p) => ({ ...p, [name]: false }));
  }

  async function loadSubclaudeFeatures(cls: CharClass, force = false) {
    const key = `${cls.name}-${cls.subclass}`;
    if (!force && (subclaudeText[key] || subclaudeLoading[key])) return;

    setSubclaudeLoading(p => ({ ...p, [key]: true }));
    setSubclaudeError(p => ({ ...p, [key]: '' }));
    try {
      const r = await fetch('/api/srd/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'subclass_guide',
          className: cls.name,
          subclassName: cls.subclass,
          ...(force && { force: true }),
        }),
      });
      if (!r.ok) throw new Error('Claude lookup failed');
      const d = await r.json();
      const text = d.result?.text ?? '';
      setSubclaudeText(p => ({ ...p, [key]: text }));
      setSubclaudeSource(p => ({ ...p, [key]: d.source ?? 'claude' }));
      setSubclaudeCachedAt(p => ({ ...p, [key]: d.cachedAt ?? '' }));
    } catch (e: any) {
      setSubclaudeError(p => ({ ...p, [key]: e?.message ?? 'Lookup failed' }));
    }
    setSubclaudeLoading(p => ({ ...p, [key]: false }));
  }

  async function loadRaceFeatures(force = false) {
    if (!force && (raceText || raceLoading || !race)) return;
    if (!race) return;

    setRaceLoading(true);
    setRaceError('');
    try {
      const r = await fetch('/api/srd/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'race_guide', raceName: race, ...(force && { force: true }) }),
      });
      if (!r.ok) throw new Error('Claude lookup failed');
      const d = await r.json();
      const text = d.result?.text ?? '';
      setRaceText(text);
      setRaceSource(d.source ?? 'claude');
      setRaceCachedAt(d.cachedAt ?? null);
    } catch (e: any) {
      setRaceError(e?.message ?? 'Lookup failed');
    }
    setRaceLoading(false);
  }

  async function loadSubclassLevels(subclassIndex: string) {
    if (subclassLevels[subclassIndex] || subclassLevelsLoading[subclassIndex]) return;
    setSubclassLevelsLoading(p => ({ ...p, [subclassIndex]: true }));
    try {
      const r = await fetch(`/api/srd/class?name=_&subclass=${encodeURIComponent(subclassIndex)}`);
      if (!r.ok) throw new Error('Not found');
      const d = await r.json();
      setSubclassLevels(p => ({ ...p, [subclassIndex]: d.levels ?? [] }));
    } catch { /* silently fail — will fall through to Claude lookup */ }
    setSubclassLevelsLoading(p => ({ ...p, [subclassIndex]: false }));
  }

  async function handleAddFeature(f: SrdFeature, source: string) {
    const id = f.index;
    setAddingFeature(id);
    await addFeature({ name: f.name, source, desc: f.desc || '' });
    setAddingFeature(null);
  }

  const isLoading = loadingMap[activeClass];
  const err = errorMap[activeClass];

  // Compute missing features: SRD features at or below current level that aren't in features tab
  const missingFeatures: Array<{ feature: SrdFeature; level: number; source: string }> = [];
  if (cd && cls) {
    for (const lv of cd.levels) {
      if (lv.level > cls.level) break;
      for (const f of lv.features) {
        const alreadyHas = features.some(
          (ef) => ef.name.toLowerCase() === f.name.toLowerCase() ||
                  ef.name.toLowerCase().includes(f.name.toLowerCase())
        );
        if (!alreadyHas) {
          missingFeatures.push({ feature: f, level: lv.level, source: `${activeClass} ${lv.level}` });
        }
      }
    }
  }

  // Next level features
  const nextLevelFeatures = cd && cls
    ? (cd.levels.find(lv => lv.level === cls.level + 1)?.features ?? [])
    : [];
  const nextLevelASI = cd && cls
    ? (cd.levels.find(lv => lv.level === cls.level + 1)?.abilityScoreImprovement ?? false)
    : false;

  const MODES: Array<{ id: 'progression'|'subclasses'|'missing'|'race'; label: string }> = [
    { id: 'progression', label: 'Progression' },
    { id: 'subclasses',  label: cd?.subclassLabel ?? 'Subclass' },
    { id: 'missing',     label: `Missing (${missingFeatures.length})` },
    { id: 'race',        label: race ? `${race} Traits` : 'Race Traits' },
  ];

  return (
    <>
      {/* Class tabs */}
      {classes.length > 1 && (
        <div style={{ display:'flex', marginBottom:10, border:'1.5px solid var(--border-light)', borderRadius:4, overflow:'hidden' }}>
          {classes.map((c, i) => (
            <button key={c.name} onClick={() => setActiveClass(c.name)}
              style={{ flex:1, padding:'6px 8px', fontFamily:'var(--font-display)', fontSize:11, fontWeight:700,
                letterSpacing:0.5, cursor:'pointer', border:'none',
                borderRight: i < classes.length-1 ? '1px solid var(--border-light)' : 'none',
                background: activeClass===c.name ? 'var(--ink)' : 'var(--parchment)',
                color: activeClass===c.name ? 'var(--gold-light)' : 'var(--border)',
              }}>
              {c.name} {c.level}
            </button>
          ))}
        </div>
      )}

      {/* View toggle */}
      <div style={{ display:'flex', gap:6, marginBottom:10, flexWrap:'wrap' }}>
        {MODES.map((m) => (
          <button key={m.id} onClick={() => {
            setViewMode(m.id);
            if (m.id === 'race' && !raceText) loadRaceFeatures();
            if (m.id === 'subclasses' && cls?.subclass && cd) {
              const srdMatch = cd.subclasses.find((sc: any) => sc.name === cls.subclass);
              if (srdMatch) loadSubclassLevels(srdMatch.index);
              else loadSubclaudeFeatures(cls);
            }
          }}
            style={{ fontFamily:'var(--font-display)', fontSize:10, fontWeight:700, letterSpacing:0.5,
              padding:'4px 12px', borderRadius:3, cursor:'pointer', textTransform:'uppercase',
              background: viewMode===m.id ? 'var(--ink)' : 'transparent',
              color: viewMode===m.id ? 'var(--gold-light)' : 'var(--border)',
              border: viewMode===m.id ? '1.5px solid var(--gold)' : '1.5px solid var(--border-light)',
            }}>
            {m.label}
          </button>
        ))}
      </div>

      {isLoading && <div style={{ textAlign:'center', padding:24, fontStyle:'italic', color:'var(--border)' }}>Loading {activeClass} data…</div>}
      {err && <div style={{ padding:12, background:'#fff0f0', border:'1px solid #ffcccc', borderRadius:4, fontSize:13, color:'var(--red)' }}>{err} — Class may not be in SRD.</div>}

      {/* ── What's Next callout ── */}
      {cd && cls && cls.level < 20 && nextLevelFeatures.length > 0 && viewMode === 'progression' && (
        <div style={{ padding:'8px 12px', marginBottom:10, background:'rgba(46,125,50,0.07)', border:'1.5px solid rgba(46,125,50,0.4)', borderRadius:4 }}>
          <div style={{ fontFamily:'var(--font-display)', fontSize:10, fontWeight:700, color:'#2e7d32', letterSpacing:1, marginBottom:4 }}>
            ▲ UP NEXT — Level {cls.level + 1}
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:'2px 8px' }}>
            {nextLevelFeatures.map(f => (
              <span key={f.index} style={{ fontFamily:'var(--font-display)', fontSize:11, fontWeight:600, color:'var(--ink)' }}>{f.name}</span>
            ))}
            {nextLevelASI && <span style={{ fontFamily:'var(--font-display)', fontSize:11, fontWeight:600, color:'var(--gold)' }}>Ability Score Improvement</span>}
          </div>
        </div>
      )}

      {/* ── Progression ── */}
      {cd && viewMode==='progression' && (
        <>
          <div style={panel}>
            <div style={ph}>Class Overview</div>
            <div style={{ ...pb, display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
              {[['Hit Die',`d${cd.hitDie}`],[cd.subclassLabel,`Level ${cd.subclassLevel}`],['Spellcasting',cd.spellcasting?.ability??'None']].map(([l,v]) => (
                <div key={l} style={{ textAlign:'center', background:'var(--parchment)', border:'1.5px solid var(--border-light)', borderRadius:4, padding:'6px 4px' }}>
                  <div style={{ fontFamily:'var(--font-display)', fontSize:8, fontWeight:700, color:'var(--border)', textTransform:'uppercase', letterSpacing:0.5 }}>{l}</div>
                  <div style={{ fontFamily:'var(--font-display)', fontSize:16, fontWeight:700, marginTop:2 }}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={panel}>
            <div style={ph}>
              Level Progression
              {cls && <span style={{ fontSize:10, color:'#c8b99a', fontWeight:400 }}>currently {cls.level}</span>}
            </div>
            <div style={pb}>
              {cd.levels.map((lv) => {
                const key = `${activeClass}-${lv.level}`;
                const isCur = lv.level === (cls?.level ?? 0);
                const isPast = lv.level < (cls?.level ?? 0);
                return (
                  <div key={lv.level} style={{ borderBottom:'0.5px solid var(--parchment-dark)', opacity: isPast ? 0.65 : 1 }}>
                    <div onClick={() => setExpandedLevel(expandedLevel===key?null:key)}
                      style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 4px', cursor:'pointer',
                        background: isCur ? 'rgba(201,162,39,0.06)' : 'transparent',
                      }}>
                      <div style={{ fontFamily:'var(--font-display)', fontSize:13, fontWeight:700,
                        width:26, height:26, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
                        background: isCur?'var(--gold)':isPast?'var(--parchment-dark)':'var(--parchment)',
                        color: isCur?'var(--ink)':'var(--border)',
                        border:`1.5px solid ${isCur?'var(--gold)':'var(--border-light)'}`,
                      }}>{lv.level}</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:'flex', flexWrap:'wrap', gap:'2px 6px', alignItems:'center' }}>
                          {lv.features.map((f) => (
                            <span key={f.index} style={{ fontFamily:'var(--font-display)', fontSize:10, fontWeight:600, color:isCur?'var(--ink)':'var(--ink-light)' }}>{f.name}</span>
                          ))}
                          {!lv.features.length && <span style={{ fontSize:10, color:'var(--border)', fontStyle:'italic' }}>—</span>}
                        </div>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:4, flexShrink:0 }}>
                        <span style={{ fontFamily:'var(--font-display)', fontSize:9, color:'var(--border)', fontWeight:600 }}>+{lv.profBonus}</span>
                        {lv.subclassUnlock && <span style={{ fontFamily:'var(--font-display)', fontSize:8, fontWeight:700, color:'#2e7d32', background:'#e8f4e8', border:'1px solid #a5d6a7', padding:'0 3px', borderRadius:2 }}>SUB</span>}
                        {lv.abilityScoreImprovement && <span style={{ fontFamily:'var(--font-display)', fontSize:8, fontWeight:700, color:'var(--gold)', background:'rgba(201,162,39,0.15)', border:'1px solid var(--gold)', padding:'0 3px', borderRadius:2 }}>ASI</span>}
                        <span style={{ fontSize:10, color:'var(--border)' }}>{expandedLevel===key?'▲':'▼'}</span>
                      </div>
                    </div>

                    {expandedLevel===key && (
                      <div style={{ padding:'0 8px 10px 42px' }}>
                        {lv.spellSlots && <SlotPips slots={lv.spellSlots.slots} />}
                        {lv.features.map((f) => {
                          const alreadyHas = features.some(ef => ef.name.toLowerCase() === f.name.toLowerCase() || ef.name.toLowerCase().includes(f.name.toLowerCase()));
                          return (
                            <div key={f.index} style={{ marginTop:6 }}>
                              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:6 }}>
                                <span style={{ fontFamily:'var(--font-display)', fontSize:12, fontWeight:600 }}>{f.name}</span>
                                <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                                  {f.desc && <button onClick={() => setExpandedFeature(expandedFeature===f.index?null:f.index)} style={{ fontSize:11, color:'var(--gold)', background:'none', border:'none', cursor:'pointer', fontStyle:'italic' }}>{expandedFeature===f.index?'hide':'details'}</button>}
                                  {lv.level <= (cls?.level ?? 0) && (
                                    <button
                                      onClick={() => handleAddFeature(f, `${activeClass} ${lv.level}`)}
                                      disabled={alreadyHas || addingFeature === f.index}
                                      style={{ fontSize:10, color: alreadyHas ? 'var(--border)' : 'var(--gold)', background:'none', border:`1px solid ${alreadyHas ? 'var(--border-light)' : 'var(--gold)'}`, borderRadius:2, padding:'1px 6px', cursor: alreadyHas ? 'default' : 'pointer', fontFamily:'var(--font-display)', fontWeight:700, opacity: alreadyHas ? 0.5 : 1 }}
                                    >
                                      {alreadyHas ? '✓ Added' : addingFeature === f.index ? '…' : '+ Add'}
                                    </button>
                                  )}
                                </div>
                              </div>
                              {expandedFeature===f.index && (
                                <div style={{ fontSize:12, color:'var(--ink-light)', lineHeight:1.6, marginTop:4, padding:8, background:'var(--parchment)', border:'1px solid var(--border-light)', borderRadius:3, whiteSpace:'pre-wrap' }}>
                                  {f.desc || 'See Player\'s Handbook for full description.'}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {lv.abilityScoreImprovement && <div style={{ marginTop:6, fontSize:12, color:'var(--border)', fontStyle:'italic' }}>Increase one ability score by 2, or two by 1 (max 20).</div>}
                        {lv.subclassUnlock && <div style={{ marginTop:6, fontSize:12, color:'#2e7d32', fontStyle:'italic' }}>You choose your {cd.subclassLabel} at this level.</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ── Missing Features ── */}
      {viewMode === 'missing' && (
        <div style={panel}>
          <div style={ph}>
            Missing Features
            <span style={{ fontSize:10, color:'#c8b99a', fontWeight:400 }}>{missingFeatures.length} not yet in your Features tab</span>
          </div>
          <div style={pb}>
            {!cd && <div style={{ fontSize:12, color:'var(--border)', fontStyle:'italic' }}>Loading class data…</div>}
            {cd && missingFeatures.length === 0 && (
              <div style={{ textAlign:'center', padding:'16px 0' }}>
                <div style={{ fontSize:22, marginBottom:6 }}>✓</div>
                <div style={{ fontFamily:'var(--font-display)', fontSize:13, color:'#2e7d32' }}>All features accounted for!</div>
                <div style={{ fontSize:12, color:'var(--border)', fontStyle:'italic', marginTop:4 }}>Every SRD feature for your current level is in your Features tab.</div>
              </div>
            )}
            {missingFeatures.map(({ feature: f, source }) => {
              return (
                <div key={f.index} style={{ padding:'7px 0', borderBottom:'0.5px solid var(--parchment-dark)' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                    <div>
                      <div style={{ fontFamily:'var(--font-display)', fontSize:12, fontWeight:600 }}>{f.name}</div>
                      <div style={{ fontSize:10, color:'var(--border)', fontStyle:'italic' }}>{source}</div>
                    </div>
                    <button
                      onClick={() => handleAddFeature(f, source)}
                      disabled={addingFeature === f.index}
                      className="ink-btn"
                      style={{ fontSize:11, padding:'4px 10px' }}
                    >
                      {addingFeature === f.index ? '…' : '+ Add to Character'}
                    </button>
                  </div>
                  {f.desc && (
                    <div style={{ fontSize:11, color:'var(--ink-light)', lineHeight:1.5, marginTop:4 }}>
                      {f.desc.slice(0, 180)}{f.desc.length > 180 ? '…' : ''}
                    </div>
                  )}
                </div>
              );
            })}
            <div style={{ marginTop:10, fontSize:11, color:'var(--border)', fontStyle:'italic', lineHeight:1.5 }}>
              Note: This compares SRD feature names against your Features tab. Subclass features and non-SRD features won't appear here — use the Subclass tab + Claude lookup for those.
            </div>
          </div>
        </div>
      )}

      {/* ── Subclasses ── */}
      {cd && viewMode==='subclasses' && (
        <div style={panel}>
          <div style={ph}>{cd.subclassLabel} — {cls?.subclass || `Unlocks at Level ${cd.subclassLevel}`}</div>
          <div style={pb}>
            {/* ── Chosen subclass is in the SRD: show level-by-level progression ── */}
            {cls?.subclass && (() => {
              const srdMatch = cd.subclasses.find((sc: any) => sc.name === cls.subclass);
              if (!srdMatch) return null;
              const levels = subclassLevels[srdMatch.index];
              const loading = subclassLevelsLoading[srdMatch.index];
              return (
                <div style={{ marginBottom:12 }}>
                  <div style={{ marginBottom:8, padding:'6px 10px', background:'rgba(201,162,39,0.08)', border:'1.5px solid var(--gold)', borderRadius:4, fontSize:13 }}>
                    <strong style={{ fontFamily:'var(--font-display)' }}>Your {cd.subclassLabel}:</strong> {cls.subclass}
                    {srdMatch.desc && <div style={{ fontSize:11, color:'var(--ink-light)', marginTop:4, lineHeight:1.5 }}>{srdMatch.desc}</div>}
                  </div>
                  {loading && <div style={{ fontSize:12, color:'var(--border)', fontStyle:'italic', padding:'8px 0' }}>Loading feature progression…</div>}
                  {!loading && levels && (
                    <SubclassProgression levels={levels} charLevel={cls?.level ?? 0} className={cls?.name ?? ''} subclassName={cls?.subclass ?? ''} charFeatures={features} expandedLevel={expandedLevel} setExpandedLevel={setExpandedLevel} expandedFeature={expandedFeature} setExpandedFeature={setExpandedFeature} handleAddFeature={handleAddFeature} addingFeature={addingFeature} keyPrefix={`sub-${srdMatch.index}`} />
                  )}
                  {/* SRD options collapsed for reference */}
                  {cd.subclasses.length > 1 && (
                    <details style={{ marginTop:10 }}>
                      <summary style={{ fontSize:11, color:'var(--border)', cursor:'pointer', fontStyle:'italic', userSelect:'none' }}>
                        Other SRD {cd.subclassLabel} options
                      </summary>
                      <div style={{ marginTop:6 }}>
                        {cd.subclasses.filter((sc: any) => sc.name !== cls.subclass).map((sc: any) => (
                          <div key={sc.index} style={{ marginBottom:6, paddingBottom:6, borderBottom:'0.5px solid var(--parchment-dark)' }}>
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                              <div style={{ fontFamily:'var(--font-display)', fontSize:12, fontWeight:600, color:'var(--border)' }}>{sc.name}</div>
                              {sc.desc && <button onClick={() => setExpandedSub(expandedSub===sc.index?null:sc.index)} style={{ fontSize:11, color:'var(--gold)', background:'none', border:'none', cursor:'pointer', fontStyle:'italic' }}>{expandedSub===sc.index?'hide':'details'}</button>}
                            </div>
                            {expandedSub===sc.index && sc.desc && (
                              <div style={{ fontSize:12, color:'var(--ink-light)', lineHeight:1.6, marginTop:4, padding:8, background:'var(--parchment)', border:'1px solid var(--border-light)', borderRadius:3, whiteSpace:'pre-wrap' }}>{sc.desc}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              );
            })()}

            {/* ── Chosen subclass is NOT in SRD: Claude lookup ── */}
            {cls?.subclass && (() => {
              const isInSrd = cd.subclasses.some((sc: any) => sc.name === cls.subclass);
              if (isInSrd) return null;
              const key = `${cls.name}-${cls.subclass}`;
              const text = subclaudeText[key];
              const loading = subclaudeLoading[key];
              const error = subclaudeError[key];
              const src = subclaudeSource[key];
              const cachedAt = subclaudeCachedAt[key];
              const parsed = text ? parseSubclaudeText(text) : [];
              return (
                <div style={{ marginBottom:12 }}>
                  <div style={{ marginBottom:8, padding:'6px 10px', background:'rgba(201,162,39,0.08)', border:'1.5px solid var(--gold)', borderRadius:4, fontSize:13, display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8, flexWrap:'wrap' }}>
                    <div>
                      <strong style={{ fontFamily:'var(--font-display)' }}>Your {cd.subclassLabel}:</strong> {cls.subclass}
                      <span style={{ marginLeft:8, fontSize:9, fontFamily:'var(--font-display)', fontWeight:700, color:'var(--border)', background:'var(--parchment-dark)', border:'1px solid var(--border-light)', borderRadius:3, padding:'1px 5px', letterSpacing:0.5 }}>NOT IN SRD</span>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                      {src === 'cache' && (
                        <span style={{ fontSize:9, fontWeight:600, color:'#2e7d32', background:'#e8f4e8', border:'1px solid #a5d6a7', borderRadius:3, padding:'1px 5px', letterSpacing:0.5 }}>
                          🗄 DATABASE{cachedAt ? ` · ${new Date(cachedAt).toLocaleDateString()}` : ''}
                        </span>
                      )}
                      {text && <button onClick={() => loadSubclaudeFeatures(cls, true)} disabled={loading}
                        style={{ fontSize:9, color:'var(--border)', background:'none', border:'1px solid var(--border-light)', borderRadius:3, padding:'1px 6px', cursor:'pointer', fontFamily:'var(--font-display)', fontWeight:700, letterSpacing:0.5 }}>↺ Regenerate</button>}
                    </div>
                  </div>
                  {!text && !loading && !error && (
                    <div style={{ padding:'8px 0' }}>
                      <div style={{ fontSize:11, color:'var(--border)', fontStyle:'italic', marginBottom:8, lineHeight:1.5 }}>
                        This subclass isn't in the SRD database. Claude can look up the full feature progression.
                      </div>
                      <button className="ink-btn" style={{ fontSize:12 }} onClick={() => loadSubclaudeFeatures(cls)}>
                        ✦ Look Up {cls.subclass} Features
                      </button>
                    </div>
                  )}
                  {loading && <div style={{ fontSize:12, color:'var(--border)', fontStyle:'italic', padding:'8px 0' }}>⏳ {text ? 'Regenerating…' : `Looking up ${cls.subclass} features…`}</div>}
                  {error && <div style={{ fontSize:12, color:'var(--red)', padding:'4px 0' }}>{error}</div>}
                  {!loading && parsed.length > 0 && (
                    <SubclassProgression levels={parsed} charLevel={cls?.level ?? 0} className={cls?.name ?? ''} subclassName={cls?.subclass ?? ''} charFeatures={features} expandedLevel={expandedLevel} setExpandedLevel={setExpandedLevel} expandedFeature={expandedFeature} setExpandedFeature={setExpandedFeature} handleAddFeature={handleAddFeature} addingFeature={addingFeature} keyPrefix={`sub-claude-${cls.name}`} />
                  )}
                  {!loading && text && parsed.length === 0 && (
                    <div style={{ fontSize:12, color:'var(--ink-light)', lineHeight:1.7, whiteSpace:'pre-wrap', paddingTop:8 }}>{text}</div>
                  )}
                  {cd.subclasses.length > 0 && (
                    <details style={{ marginTop:10 }}>
                      <summary style={{ fontSize:11, color:'var(--border)', cursor:'pointer', fontStyle:'italic', userSelect:'none' }}>
                        SRD {cd.subclassLabel} options for reference
                      </summary>
                      <div style={{ marginTop:6 }}>
                        {cd.subclasses.map((sc: any) => (
                          <div key={sc.index} style={{ marginBottom:6, paddingBottom:6, borderBottom:'0.5px solid var(--parchment-dark)' }}>
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                              <div style={{ fontFamily:'var(--font-display)', fontSize:12, fontWeight:600, color:'var(--border)' }}>{sc.name}</div>
                              {sc.desc && <button onClick={() => setExpandedSub(expandedSub===sc.index?null:sc.index)} style={{ fontSize:11, color:'var(--gold)', background:'none', border:'none', cursor:'pointer', fontStyle:'italic' }}>{expandedSub===sc.index?'hide':'details'}</button>}
                            </div>
                            {expandedSub===sc.index && sc.desc && (
                              <div style={{ fontSize:12, color:'var(--ink-light)', lineHeight:1.6, marginTop:4, padding:8, background:'var(--parchment)', border:'1px solid var(--border-light)', borderRadius:3, whiteSpace:'pre-wrap' }}>{sc.desc}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              );
            })()}

            {/* ── No subclass chosen yet: show all SRD options ── */}
            {!cls?.subclass && (() => {
              if (!cd.subclasses.length) {
                return (
                  <div style={{ fontStyle:'italic', color:'var(--border)', fontSize:12, lineHeight:1.6 }}>
                    Subclass options are not included in the SRD. Use the notes section below to record your {cd.subclassLabel} details.
                  </div>
                );
              }
              return (
                <>
                  <div style={{ fontSize:12, color:'var(--border)', fontStyle:'italic', marginBottom:10 }}>
                    No subclass chosen yet. Your {cd.subclassLabel} unlocks at level {cd.subclassLevel}.
                  </div>
                  {cd.subclasses.map((sc: any) => (
                    <div key={sc.index} style={{ marginBottom:8, borderBottom:'0.5px solid var(--parchment-dark)', paddingBottom:8 }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                        <div style={{ fontFamily:'var(--font-display)', fontSize:13, fontWeight:600 }}>{sc.name}</div>
                        {sc.desc && <button onClick={() => setExpandedSub(expandedSub===sc.index?null:sc.index)} style={{ fontSize:11, color:'var(--gold)', background:'none', border:'none', cursor:'pointer', fontStyle:'italic' }}>{expandedSub===sc.index?'hide':'details'}</button>}
                      </div>
                      {expandedSub===sc.index && sc.desc && (
                        <div style={{ fontSize:12, color:'var(--ink-light)', lineHeight:1.6, marginTop:6, padding:8, background:'var(--parchment)', border:'1px solid var(--border-light)', borderRadius:3, whiteSpace:'pre-wrap' }}>{sc.desc}</div>
                      )}
                    </div>
                  ))}
                </>
              );
            })()}
          </div>

          <CustomSubclassNotes cls={cls} saveClasses={saveClasses} classes={classes} />
        </div>
      )}

      {/* ── Race Traits ── */}
      {viewMode === 'race' && (
        <div style={panel}>
          <div style={ph}>
            <span>{race || 'Race'} Racial Traits</span>
            {raceText && (
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                {raceSource === 'cache' && (
                  <span style={{ fontSize:9, fontWeight:600, color:'#e8f4e8', background:'rgba(46,125,50,0.4)', border:'1px solid rgba(46,125,50,0.6)', borderRadius:3, padding:'1px 5px', letterSpacing:0.5 }}>
                    🗄 DATABASE{raceCachedAt ? ` · ${new Date(raceCachedAt).toLocaleDateString()}` : ''}
                  </span>
                )}
                <button
                  onClick={() => loadRaceFeatures(true)}
                  disabled={raceLoading}
                  style={{ fontSize:9, color:'#c8b99a', background:'none', border:'1px solid rgba(200,185,154,0.4)', borderRadius:3, padding:'1px 6px', cursor:'pointer', fontFamily:'var(--font-display)', fontWeight:700, letterSpacing:0.5 }}
                >↺ Regenerate</button>
              </div>
            )}
          </div>
          <div style={pb}>
            {!race && (
              <div style={{ fontSize:12, color:'var(--border)', fontStyle:'italic' }}>
                No race set. Update your race in the Bio tab first.
              </div>
            )}
            {race && !raceText && !raceLoading && !raceError && (
              <div style={{ textAlign:'center', padding:'12px 0' }}>
                <div style={{ fontSize:12, color:'var(--border)', fontStyle:'italic', marginBottom:10 }}>
                  Racial traits for {race} are not in the SRD database. Claude can look them up from any official sourcebook.
                </div>
                <button className="ink-btn" style={{ fontSize:12 }} onClick={() => loadRaceFeatures()}>
                  ✦ Look Up {race} Traits
                </button>
              </div>
            )}
            {raceLoading && (
              <div style={{ fontSize:12, color:'var(--border)', fontStyle:'italic', padding:'12px 0', textAlign:'center' }}>
                ⏳ {raceText ? 'Regenerating…' : `Claude is looking up ${race} racial traits…`}
              </div>
            )}
            {raceError && <div style={{ fontSize:12, color:'var(--red)', marginBottom: raceText ? 6 : 0 }}>{raceError}</div>}
            {raceText && !raceLoading && (() => {
              const traits = parseRaceText(raceText);
              if (!traits.length) return (
                <div style={{ fontSize:12, color:'var(--ink-light)', lineHeight:1.7, whiteSpace:'pre-wrap' }}>{raceText}</div>
              );
              return (
                <RaceTraitList traits={traits} race={race} charFeatures={features} expandedFeature={expandedFeature} setExpandedFeature={setExpandedFeature} handleAddFeature={handleAddFeature} addingFeature={addingFeature} />
              );
            })()}
          </div>
        </div>
      )}
    </>
  );
}

// ── Shared subclass level progression renderer ─────────────────────────────
function SubclassProgression({ levels, charLevel, className, subclassName, charFeatures, expandedLevel, setExpandedLevel, expandedFeature, setExpandedFeature, handleAddFeature, addingFeature, keyPrefix }: {
  levels: { level: number; features: SrdFeature[] }[];
  charLevel: number; className: string; subclassName: string;
  charFeatures: Feature[];
  expandedLevel: string | null; setExpandedLevel: (k: string | null) => void;
  expandedFeature: string | null; setExpandedFeature: (k: string | null) => void;
  handleAddFeature: (f: SrdFeature, source: string) => Promise<void>;
  addingFeature: string | null; keyPrefix: string;
}) {
  return (
    <div style={{ borderTop:'1px solid var(--border-light)', paddingTop:8 }}>
      <div style={{ fontFamily:'var(--font-display)', fontSize:10, fontWeight:700, color:'var(--border)', textTransform:'uppercase', letterSpacing:1, marginBottom:6 }}>Feature Progression</div>
      {levels.map((lv) => {
        const key = `${keyPrefix}-${lv.level}`;
        const isPast = lv.level <= charLevel;
        const isCurrent = lv.level === charLevel;
        return (
          <div key={lv.level} style={{ borderBottom:'0.5px solid var(--parchment-dark)', opacity: isPast ? 1 : 0.55 }}>
            <div onClick={() => setExpandedLevel(expandedLevel===key?null:key)}
              style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 4px', cursor:'pointer', background: isCurrent ? 'rgba(201,162,39,0.06)' : 'transparent' }}>
              <div style={{ fontFamily:'var(--font-display)', fontSize:12, fontWeight:700, width:26, height:26, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
                background: isCurrent ? 'var(--gold)' : isPast ? 'var(--parchment-dark)' : 'var(--parchment)',
                color: isCurrent ? 'var(--ink)' : 'var(--border)',
                border:`1.5px solid ${isCurrent ? 'var(--gold)' : 'var(--border-light)'}`,
              }}>{lv.level}</div>
              <div style={{ flex:1, display:'flex', flexWrap:'wrap', gap:'2px 6px' }}>
                {lv.features.map(f => (
                  <span key={f.index} style={{ fontFamily:'var(--font-display)', fontSize:10, fontWeight:600, color: isCurrent ? 'var(--ink)' : 'var(--ink-light)' }}>{f.name}</span>
                ))}
              </div>
              <span style={{ fontSize:10, color:'var(--border)', flexShrink:0 }}>{expandedLevel===key?'▲':'▼'}</span>
            </div>
            {expandedLevel===key && (
              <div style={{ padding:'0 8px 10px 42px' }}>
                {lv.features.map(f => {
                  const alreadyHas = charFeatures.some(ef => ef.name.toLowerCase() === f.name.toLowerCase());
                  return (
                    <div key={f.index} style={{ marginTop:6 }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:6 }}>
                        <span style={{ fontFamily:'var(--font-display)', fontSize:12, fontWeight:600 }}>{f.name}</span>
                        <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                          {f.desc && <button onClick={() => setExpandedFeature(expandedFeature===f.index?null:f.index)} style={{ fontSize:11, color:'var(--gold)', background:'none', border:'none', cursor:'pointer', fontStyle:'italic' }}>{expandedFeature===f.index?'hide':'details'}</button>}
                          {isPast && (
                            <button onClick={() => handleAddFeature(f, `${className} (${subclassName}) ${lv.level}`)} disabled={alreadyHas || addingFeature===f.index}
                              style={{ fontSize:10, color: alreadyHas?'var(--border)':'var(--gold)', background:'none', border:`1px solid ${alreadyHas?'var(--border-light)':'var(--gold)'}`, borderRadius:2, padding:'1px 6px', cursor:alreadyHas?'default':'pointer', fontFamily:'var(--font-display)', fontWeight:700, opacity:alreadyHas?0.5:1 }}>
                              {alreadyHas ? '✓ Added' : addingFeature===f.index ? '…' : '+ Add'}
                            </button>
                          )}
                        </div>
                      </div>
                      {expandedFeature===f.index && (
                        <div style={{ fontSize:12, color:'var(--ink-light)', lineHeight:1.6, marginTop:4, padding:8, background:'var(--parchment)', border:'1px solid var(--border-light)', borderRadius:3, whiteSpace:'pre-wrap' }}>
                          {f.desc || 'See Player\'s Handbook for full description.'}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Flat trait list (race traits, no level progression) ───────────────────
function RaceTraitList({ traits, race, charFeatures, expandedFeature, setExpandedFeature, handleAddFeature, addingFeature }: {
  traits: SrdFeature[]; race: string; charFeatures: Feature[];
  expandedFeature: string | null; setExpandedFeature: (k: string | null) => void;
  handleAddFeature: (f: SrdFeature, source: string) => Promise<void>;
  addingFeature: string | null;
}) {
  return (
    <div>
      {traits.map(f => {
        const alreadyHas = charFeatures.some(ef => ef.name.toLowerCase() === f.name.toLowerCase());
        return (
          <div key={f.index} style={{ borderBottom:'0.5px solid var(--parchment-dark)', padding:'5px 0' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:6 }}>
              <span style={{ fontFamily:'var(--font-display)', fontSize:12, fontWeight:600 }}>{f.name}</span>
              <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                {f.desc && (
                  <button onClick={() => setExpandedFeature(expandedFeature===f.index?null:f.index)}
                    style={{ fontSize:11, color:'var(--gold)', background:'none', border:'none', cursor:'pointer', fontStyle:'italic' }}>
                    {expandedFeature===f.index?'hide':'details'}
                  </button>
                )}
                <button
                  onClick={() => handleAddFeature(f, race)}
                  disabled={alreadyHas || addingFeature===f.index}
                  style={{ fontSize:10, color:alreadyHas?'var(--border)':'var(--gold)', background:'none', border:`1px solid ${alreadyHas?'var(--border-light)':'var(--gold)'}`, borderRadius:2, padding:'1px 6px', cursor:alreadyHas?'default':'pointer', fontFamily:'var(--font-display)', fontWeight:700, opacity:alreadyHas?0.5:1 }}>
                  {alreadyHas ? '✓ Added' : addingFeature===f.index ? '…' : '+ Add'}
                </button>
              </div>
            </div>
            {expandedFeature===f.index && (
              <div style={{ fontSize:12, color:'var(--ink-light)', lineHeight:1.6, marginTop:4, padding:8, background:'var(--parchment)', border:'1px solid var(--border-light)', borderRadius:3, whiteSpace:'pre-wrap' }}>
                {f.desc || 'See Player\'s Handbook for full description.'}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Custom Subclass Notes ──────────────────────────────────────────────────
function CustomSubclassNotes({ cls, saveClasses, classes }: {
  cls: CharClass | undefined;
  saveClasses: (c: CharClass[]) => void;
  classes: CharClass[];
}) {
  const [editing, setEditing] = useState(false);
  const [nameVal, setNameVal] = useState(cls?.subclass ?? '');
  const [notesVal, setNotesVal] = useState((cls as any)?.subclassNotes ?? '');
  const [saving, setSaving] = useState(false);

  if (!cls) return null;

  async function handleSave() {
    setSaving(true);
    const updated = classes.map((c) =>
      c.name === cls.name ? { ...c, subclass: nameVal, subclassNotes: notesVal } : c
    );
    await saveClasses(updated as any);
    setSaving(false);
    setEditing(false);
  }

  const hasNotes = !!(cls as any)?.subclassNotes;

  return (
    <div style={{ margin: '0 10px 10px', padding: 10, background: 'var(--parchment)', border: '1.5px solid var(--border-light)', borderRadius: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, color: 'var(--border)', textTransform: 'uppercase', letterSpacing: 1 }}>
          {cls.subclass ? cls.subclass : 'Custom Subclass'} Notes
        </div>
        <button onClick={() => { setNameVal(cls.subclass ?? ''); setNotesVal((cls as any)?.subclassNotes ?? ''); setEditing(!editing); }}
          style={{ fontSize: 11, color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', fontStyle: 'italic' }}>
          {editing ? 'cancel' : hasNotes ? 'edit' : '+ add notes'}
        </button>
      </div>

      {!editing && hasNotes && (
        <div style={{ fontSize: 12, color: 'var(--ink-light)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {(cls as any).subclassNotes}
        </div>
      )}
      {!editing && !hasNotes && !cls.subclass && (
        <div style={{ fontSize: 12, color: 'var(--border)', fontStyle: 'italic' }}>No subclass chosen yet.</div>
      )}
      {!editing && !hasNotes && cls.subclass && (
        <div style={{ fontSize: 12, color: 'var(--border)', fontStyle: 'italic' }}>No notes yet. Click "+ add notes" to paste in details.</div>
      )}

      {editing && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, color: 'var(--border)', textTransform: 'uppercase', marginBottom: 3 }}>Subclass Name</div>
            <input type="text" value={nameVal} onChange={(e) => setNameVal(e.target.value)}
              style={{ width: '100%', padding: '4px 8px', fontFamily: 'var(--font-body)', fontSize: 13 }}
              placeholder="e.g. Path of the Totem Warrior" />
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, color: 'var(--border)', textTransform: 'uppercase', marginBottom: 3 }}>Notes / Description</div>
            <textarea value={notesVal} onChange={(e) => setNotesVal(e.target.value)}
              rows={8} style={{ width: '100%', resize: 'vertical', fontFamily: 'var(--font-body)', fontSize: 12, padding: '6px 8px', lineHeight: 1.5 }}
              placeholder="Paste subclass description here..." />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="ink-btn" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Notes'}</button>
            <button className="ink-btn ghost" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

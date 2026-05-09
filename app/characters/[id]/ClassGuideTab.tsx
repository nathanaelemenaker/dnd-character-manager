// app/characters/[id]/ClassGuideTab.tsx
'use client';

import { useEffect, useState } from 'react';
import { cacheGet, cacheSet } from '@/app/lib/claudeCache';

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

  // Claude subclass features — seed from localStorage cache on first render
  const [subclaudeText, setSubclaudeText] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const cls of classes) {
      if (!cls.subclass) continue;
      const key = `${cls.name}-${cls.subclass}`;
      const cached = cacheGet('subclass_guide', key);
      if (cached) seed[key] = cached;
    }
    return seed;
  });
  const [subclaudeLoading, setSubclaudeLoading] = useState<Record<string, boolean>>({});
  const [subclaudeError, setSubclaudeError] = useState<Record<string, string>>({});

  // Claude race features — seed from localStorage cache on first render
  const [raceText, setRaceText] = useState(() => cacheGet('race_guide', race) ?? '');
  const [raceLoading, setRaceLoading] = useState(false);
  const [raceError, setRaceError] = useState('');

  useEffect(() => {
    if (!activeClass || data[activeClass] || loadingMap[activeClass]) return;
    load(activeClass);
  }, [activeClass]);

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

  async function loadSubclaudeFeatures(cls: CharClass) {
    const key = `${cls.name}-${cls.subclass}`;
    if (subclaudeText[key] || subclaudeLoading[key]) return;

    // Check localStorage cache first
    const cached = cacheGet('subclass_guide', key);
    if (cached) {
      setSubclaudeText(p => ({ ...p, [key]: cached }));
      return;
    }

    setSubclaudeLoading(p => ({ ...p, [key]: true }));
    try {
      const r = await fetch('/api/srd/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'subclass_guide',
          className: cls.name,
          subclassName: cls.subclass,
          currentLevel: cls.level,
        }),
      });
      if (!r.ok) throw new Error('Claude lookup failed');
      const d = await r.json();
      const text = d.result?.text ?? '';
      cacheSet('subclass_guide', key, text);
      setSubclaudeText(p => ({ ...p, [key]: text }));
    } catch (e: any) {
      setSubclaudeError(p => ({ ...p, [key]: e?.message ?? 'Lookup failed' }));
    }
    setSubclaudeLoading(p => ({ ...p, [key]: false }));
  }

  async function loadRaceFeatures() {
    if (raceText || raceLoading || !race) return;

    // Check localStorage cache first
    const cached = cacheGet('race_guide', race);
    if (cached) {
      setRaceText(cached);
      return;
    }

    setRaceLoading(true);
    try {
      const r = await fetch('/api/srd/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'race_guide', raceName: race }),
      });
      if (!r.ok) throw new Error('Claude lookup failed');
      const d = await r.json();
      const text = d.result?.text ?? '';
      cacheSet('race_guide', race, text);
      setRaceText(text);
    } catch (e: any) {
      setRaceError(e?.message ?? 'Lookup failed');
    }
    setRaceLoading(false);
  }

  async function handleAddFeature(f: SrdFeature, source: string) {
    const id = f.index;
    setAddingFeature(id);
    await addFeature({ name: f.name, source, desc: f.desc || '' });
    setAddingFeature(null);
  }

  const cls = classes.find((c) => c.name === activeClass);
  const cd = data[activeClass];
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
          <button key={m.id} onClick={() => { setViewMode(m.id); if (m.id === 'race') loadRaceFeatures(); }}
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
          <div style={ph}>{cd.subclassLabel} Options — Unlocks at Level {cd.subclassLevel}</div>
          <div style={pb}>
            {cls?.subclass && (
              <div style={{ marginBottom:10, padding:8, background:'rgba(201,162,39,0.08)', border:'1.5px solid var(--gold)', borderRadius:4, fontSize:13 }}>
                <strong style={{ fontFamily:'var(--font-display)' }}>Your {cd.subclassLabel}:</strong> {cls.subclass}
              </div>
            )}

            {/* Claude subclass feature lookup for non-SRD subclasses */}
            {cls?.subclass && (() => {
              const isInSrd = cd.subclasses.some(sc => sc.name === cls.subclass);
              if (isInSrd) return null;
              const key = `${cls.name}-${cls.subclass}`;
              const text = subclaudeText[key];
              const loading = subclaudeLoading[key];
              const error = subclaudeError[key];
              return (
                <div style={{ marginBottom:12, padding:'10px 12px', background:'rgba(201,162,39,0.06)', border:'1.5px solid var(--gold)', borderRadius:4 }}>
                  <div style={{ fontFamily:'var(--font-display)', fontSize:10, fontWeight:700, color:'var(--gold)', letterSpacing:1, marginBottom:6 }}>
                    ✦ {cls.subclass} — NOT IN SRD
                  </div>
                  {!text && !loading && !error && (
                    <>
                      <div style={{ fontSize:11, color:'var(--border)', fontStyle:'italic', marginBottom:8, lineHeight:1.5 }}>
                        This subclass isn't in the SRD database. Claude can look up the feature progression for your current level.
                      </div>
                      <button className="ink-btn" style={{ fontSize:12 }} onClick={() => loadSubclaudeFeatures(cls)}>
                        ✦ Look Up {cls.subclass} Features
                      </button>
                    </>
                  )}
                  {loading && <div style={{ fontSize:12, color:'var(--border)', fontStyle:'italic' }}>⏳ Claude is looking up {cls.subclass} features…</div>}
                  {error && <div style={{ fontSize:12, color:'var(--red)' }}>{error}</div>}
                  {text && (
                    <div style={{ fontSize:12, color:'var(--ink-light)', lineHeight:1.7, whiteSpace:'pre-wrap' }}>{text}</div>
                  )}
                </div>
              );
            })()}

            {(() => {
              const chosenIsInSrd = cls?.subclass && cd.subclasses.some(sc => sc.name === cls.subclass);
              const hasCustomChoice = cls?.subclass && !chosenIsInSrd;

              if (!cd.subclasses.length) {
                return (
                  <div style={{ fontStyle:'italic', color:'var(--border)', fontSize:12, lineHeight:1.6 }}>
                    Subclass options are not included in the SRD. Use the Claude lookup above or the notes section below to record your {cd.subclassLabel} details.
                  </div>
                );
              }

              if (hasCustomChoice) {
                return (
                  <details style={{ marginBottom:8 }}>
                    <summary style={{ fontSize:11, color:'var(--border)', cursor:'pointer', fontStyle:'italic', userSelect:'none' }}>
                      SRD {cd.subclassLabel} options for reference ({cd.subclasses.map(s=>s.name).join(', ')})
                    </summary>
                    <div style={{ marginTop:6 }}>
                      {cd.subclasses.map((sc) => (
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
                );
              }

              return (
                <>
                  {cd.subclasses.map((sc) => (
                    <div key={sc.index} style={{ marginBottom:8, borderBottom:'0.5px solid var(--parchment-dark)', paddingBottom:8 }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                        <div style={{ fontFamily:'var(--font-display)', fontSize:13, fontWeight:600 }}>
                          {sc.name}
                          {cls?.subclass===sc.name && <span style={{ marginLeft:8, fontSize:9, background:'var(--gold)', color:'var(--ink)', padding:'1px 5px', borderRadius:2, fontFamily:'var(--font-display)', fontWeight:700 }}>YOUR CHOICE</span>}
                        </div>
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
            {race || 'Race'} Racial Traits
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
                  Racial traits for {race} are not in the SRD database. Claude can look them up.
                </div>
                <button className="ink-btn" style={{ fontSize:12 }} onClick={loadRaceFeatures}>
                  ✦ Look Up {race} Traits
                </button>
              </div>
            )}
            {raceLoading && (
              <div style={{ fontSize:12, color:'var(--border)', fontStyle:'italic', padding:'12px 0', textAlign:'center' }}>
                ⏳ Claude is looking up {race} racial traits…
              </div>
            )}
            {raceError && <div style={{ fontSize:12, color:'var(--red)' }}>{raceError}</div>}
            {raceText && (
              <div style={{ fontSize:12, color:'var(--ink-light)', lineHeight:1.7, whiteSpace:'pre-wrap' }}>{raceText}</div>
            )}
          </div>
        </div>
      )}
    </>
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

// app/characters/[id]/ClassGuideTab.tsx
'use client';

import { useEffect, useState } from 'react';

interface CharClass { name: string; subclass: string; level: number; hitDie: number; }
interface Feature { name: string; index: string; desc: string; }
interface LevelEntry {
  level: number; profBonus: number; features: Feature[];
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

export default function ClassGuideTab({ classes, currentLevel, saveClasses }: { classes: CharClass[]; currentLevel: number; saveClasses: (c: CharClass[]) => void }) {
  const [data, setData] = useState<Record<string, ClassData>>({});
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [errorMap, setErrorMap] = useState<Record<string, string>>({});
  const [activeClass, setActiveClass] = useState(classes[0]?.name ?? '');
  const [viewMode, setViewMode] = useState<'progression'|'subclasses'>('progression');
  const [expandedLevel, setExpandedLevel] = useState<string|null>(null);
  const [expandedFeature, setExpandedFeature] = useState<string|null>(null);
  const [expandedSub, setExpandedSub] = useState<string|null>(null);

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

  const cls = classes.find((c) => c.name === activeClass);
  const cd = data[activeClass];
  const isLoading = loadingMap[activeClass];
  const err = errorMap[activeClass];

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
      <div style={{ display:'flex', gap:6, marginBottom:10 }}>
        {(['progression','subclasses'] as const).map((m) => (
          <button key={m} onClick={() => setViewMode(m)}
            style={{ fontFamily:'var(--font-display)', fontSize:10, fontWeight:700, letterSpacing:0.5,
              padding:'4px 12px', borderRadius:3, cursor:'pointer', textTransform:'uppercase',
              background: viewMode===m ? 'var(--ink)' : 'transparent',
              color: viewMode===m ? 'var(--gold-light)' : 'var(--border)',
              border: viewMode===m ? '1.5px solid var(--gold)' : '1.5px solid var(--border-light)',
            }}>
            {m==='progression' ? 'Level Progression' : cd?.subclassLabel ?? 'Subclasses'}
          </button>
        ))}
      </div>

      {isLoading && <div style={{ textAlign:'center', padding:24, fontStyle:'italic', color:'var(--border)' }}>Loading {activeClass} data…</div>}
      {err && <div style={{ padding:12, background:'#fff0f0', border:'1px solid #ffcccc', borderRadius:4, fontSize:13, color:'var(--red)' }}>{err} — Class may not be in SRD.</div>}

      {cd && viewMode==='progression' && (
        <>
          {/* Overview */}
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

          {/* Level table */}
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
                        {lv.features.map((f) => (
                          <div key={f.index} style={{ marginTop:6 }}>
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                              <span style={{ fontFamily:'var(--font-display)', fontSize:12, fontWeight:600 }}>{f.name}</span>
                              {f.desc && <button onClick={() => setExpandedFeature(expandedFeature===f.index?null:f.index)} style={{ fontSize:11, color:'var(--gold)', background:'none', border:'none', cursor:'pointer', fontStyle:'italic' }}>{expandedFeature===f.index?'hide':'details'}</button>}
                            </div>
                            {expandedFeature===f.index && (
                              <div style={{ fontSize:12, color:'var(--ink-light)', lineHeight:1.6, marginTop:4, padding:8, background:'var(--parchment)', border:'1px solid var(--border-light)', borderRadius:3, whiteSpace:'pre-wrap' }}>
                                {f.desc || 'See Player\'s Handbook for full description.'}
                              </div>
                            )}
                          </div>
                        ))}
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

      {cd && viewMode==='subclasses' && (
        <div style={panel}>
          <div style={ph}>{cd.subclassLabel} Options — Unlocks at Level {cd.subclassLevel}</div>
          <div style={pb}>
            {cls?.subclass && (
              <div style={{ marginBottom:10, padding:8, background:'rgba(201,162,39,0.08)', border:'1.5px solid var(--gold)', borderRadius:4, fontSize:13 }}>
                <strong style={{ fontFamily:'var(--font-display)' }}>Your {cd.subclassLabel}:</strong> {cls.subclass}
              </div>
            )}
            {(() => {
              // Check if player's chosen subclass is in the SRD list
              const chosenIsInSrd = cls?.subclass && cd.subclasses.some(sc => sc.name === cls.subclass);
              const hasCustomChoice = cls?.subclass && !chosenIsInSrd;

              if (!cd.subclasses.length) {
                return (
                  <div style={{ fontStyle:'italic', color:'var(--border)', fontSize:12, lineHeight:1.6 }}>
                    Subclass options are not included in the SRD. Use the notes section below to record your {cd.subclassLabel} details.
                  </div>
                );
              }

              if (hasCustomChoice) {
                // Player chose a non-SRD subclass — show SRD list collapsed as reference only
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

              // Normal case: show full SRD list
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

          {/* Custom subclass notes — always shown so player can paste wikidot content */}
          <CustomSubclassNotes cls={cls} saveClasses={saveClasses} classes={classes} />
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
    <div style={{ marginTop: 12, padding: 10, background: 'var(--parchment)', border: '1.5px solid var(--border-light)', borderRadius: 4 }}>
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
        <div style={{ fontSize: 12, color: 'var(--border)', fontStyle: 'italic' }}>
          No subclass chosen yet. Choose one via Bio → Classes or the Level Up guide.
        </div>
      )}

      {!editing && !hasNotes && cls.subclass && (
        <div style={{ fontSize: 12, color: 'var(--border)', fontStyle: 'italic' }}>
          No notes yet. Click "+ add notes" to paste in details from dnd5e.wikidot.com.
        </div>
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
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, color: 'var(--border)', textTransform: 'uppercase', marginBottom: 3 }}>
              Notes / Description
            </div>
            <div style={{ fontSize: 11, color: 'var(--border)', fontStyle: 'italic', marginBottom: 4 }}>
              Paste from dnd5e.wikidot.com or type your own notes. This is saved to your character.
            </div>
            <textarea value={notesVal} onChange={(e) => setNotesVal(e.target.value)}
              rows={8} style={{ width: '100%', resize: 'vertical', fontFamily: 'var(--font-body)', fontSize: 12, padding: '6px 8px', lineHeight: 1.5 }}
              placeholder={"Paste subclass description here...\n\nFor example, from wikidot:\nPath of the Totem Warrior\n\nThe Path of the Totem Warrior is a spiritual journey...\n\nLevel 3 - Spirit Seeker:\nYou gain the ability to cast Beast Sense and Speak with Animals as rituals...\n\nLevel 3 - Totem Spirit (Bear):\nWhile raging, you have resistance to all damage except psychic..."}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="ink-btn" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save Notes'}
            </button>
            <button className="ink-btn ghost" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

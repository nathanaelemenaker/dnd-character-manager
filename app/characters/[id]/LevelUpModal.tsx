// app/characters/[id]/LevelUpModal.tsx
'use client';

import { useEffect, useState } from 'react';
import { hitDieForClass } from '@/app/lib/dnd-constants';

export interface LevelUpResult {
  hpIncrease: number;
  newSlots: { level: number; max: number; used: number }[];
  proficiencyBonus: number;
  newFeatures: { className: string; features: { name: string; desc: string }[] }[];
  newSubclass?: { className: string; subclassName: string };
  asiChoices?: { ability: string; increase: number }[];
}

interface CharClass { name: string; subclass: string; level: number; hitDie: number; }
interface SpellSlot { level: number; max: number; used: number; }
interface Feature { name: string; index: string; desc: string; }
interface SubclassOption { index: string; name: string; desc: string; }

interface ClassData {
  name: string; hitDie: number; subclassLabel: string; subclassLevel: number;
  spellcasting: { ability: string } | null;
  levels: {
    level: number; profBonus: number;
    features: Feature[];
    spellSlots: { cantripsKnown: number; spellsKnown: number | null; slots: number[] } | null;
    abilityScoreImprovement: boolean;
    subclassUnlock: boolean;
  }[];
  subclasses?: SubclassOption[];
  subclassesLoading?: boolean;
}

function profBonus(level: number) { return Math.ceil(level / 4) + 1; }

const S: Record<string, React.CSSProperties> = {
  overlay: { position:'fixed', inset:0, zIndex:1000, background:'rgba(10,6,2,0.85)', display:'flex', alignItems:'flex-start', justifyContent:'center', overflowY:'auto', padding:'20px 12px' },
  modal: { background:'var(--parchment)', border:'2px solid var(--gold)', borderRadius:6, width:'100%', maxWidth:580, fontFamily:'var(--font-body)' },
  hdr: { background:'var(--ink)', padding:'12px 16px', display:'flex', alignItems:'center', gap:10, borderBottom:'2px solid var(--gold-light)' },
  hdrTitle: { fontFamily:'var(--font-display)', fontSize:18, fontWeight:700, color:'var(--gold-light)' },
  hdrSub: { fontSize:13, color:'#c8b99a', fontStyle:'italic' },
  lvlBadge: { fontFamily:'var(--font-display)', fontSize:32, fontWeight:700, color:'var(--gold-light)', lineHeight:1, background:'rgba(201,162,39,0.15)', border:'1.5px solid var(--gold)', borderRadius:4, padding:'4px 12px' },
  panel: { background:'var(--section-bg)', border:'1.5px solid var(--border-light)', borderRadius:4, marginBottom:12, overflow:'hidden' },
  pHdr: { background:'var(--ink)', color:'var(--gold-light)', fontFamily:'var(--font-display)', fontSize:11, fontWeight:700, letterSpacing:1.5, textTransform:'uppercase' as const, padding:'5px 10px' },
  pBody: { padding:10 },
  foot: { padding:'10px 14px', borderTop:'1px solid var(--border-light)', display:'flex', gap:8, justifyContent:'flex-end', background:'var(--parchment-dark)' },
};

type AbilityKey = 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';

export default function LevelUpModal({ characterName, newLevel, classes, currentSlots, conMod, abilities, onConfirm, onClose }: {
  characterName: string; newLevel: number; classes: CharClass[];
  currentSlots: SpellSlot[]; conMod: number;
  abilities: Record<AbilityKey, number>;
  onConfirm: (r: LevelUpResult) => void; onClose: () => void;
}) {
  const [data, setData] = useState<Record<string, ClassData>>({});
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [hpRoll, setHpRoll] = useState('');
  const [selSubclass, setSelSubclass] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const pb = profBonus(newLevel);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const results: Record<string, ClassData> = {};
      await Promise.all(classes.map(async (cls) => {
        try {
          const r = await fetch(`/api/srd/class?name=${encodeURIComponent(cls.name)}&level=${cls.level}`);
          if (!r.ok) return;
          const d = await r.json();
          results[cls.name] = { ...d, subclasses: undefined, subclassesLoading: false };
          const lv = d.levels?.find((l: any) => l.level === cls.level);
          if (lv?.subclassUnlock && !cls.subclass) {
            results[cls.name].subclassesLoading = true;
            setData({ ...results });
            const sr = await fetch(`/api/srd/class?name=${encodeURIComponent(cls.name)}&subclasses=true`);
            if (sr.ok) { const sd = await sr.json(); results[cls.name].subclasses = sd.subclasses ?? []; }
            results[cls.name].subclassesLoading = false;
          }
        } catch { /* skip */ }
      }));
      setData(results);
      setLoading(false);
    })();
  }, []);

  const needsSub = classes.some((c) => {
    const cd = data[c.name];
    if (!cd) return false;
    const lv = cd.levels?.find((l) => l.level === c.level);
    const atSubclassLevel = c.level === cd.subclassLevel;
    return (lv?.subclassUnlock || atSubclassLevel) && !c.subclass;
  });

  const needsASI = classes.some((c) => {
    const lv = data[c.name]?.levels?.find((l) => l.level === c.level);
    return lv?.abilityScoreImprovement ?? false;
  });

  // ASI state: track pending increases per ability
  const [asiMode, setAsiMode] = useState<'+2'|'+1+1'>('+2');
  const [asiChoices, setAsiChoices] = useState<Record<AbilityKey, number>>({ STR:0, DEX:0, CON:0, INT:0, WIS:0, CHA:0 });

  const asiTotal = Object.values(asiChoices).reduce((a, b) => a + b, 0);
  const asiMax = asiMode === '+2' ? 2 : 2; // always 2 total points

  function setAsi(ab: AbilityKey, val: number) {
    const capped = Math.min(val, 20 - (abilities[ab] ?? 10)); // can't exceed 20
    const others = Object.entries(asiChoices).filter(([k]) => k !== ab).reduce((s, [,v]) => s + v, 0);
    const maxForThis = asiMax - others;
    setAsiChoices(prev => ({ ...prev, [ab]: Math.max(0, Math.min(capped, maxForThis)) }));
  }

  const steps = ['review', ...(needsSub ? ['subclass'] : []), ...(needsASI ? ['asi'] : []), 'hp'];

  function computeSlots(): SpellSlot[] {
    const merged = currentSlots.map((s) => ({ ...s }));
    for (const cls of classes) {
      const lv = data[cls.name]?.levels?.find((l) => l.level === cls.level);
      lv?.spellSlots?.slots.forEach((max, i) => {
        const sl = i + 1;
        const ex = merged.find((s) => s.level === sl);
        if (ex) { if (max > ex.max) ex.max = max; }
        else if (max > 0) merged.push({ level: sl, max, used: 0 });
      });
    }
    return merged;
  }

  function doConfirm() {
    const hitDie0 = data[classes[0]?.name]?.hitDie ?? hitDieForClass(classes[0]?.name ?? '') ?? classes[0]?.hitDie ?? 8;
    const roll = parseInt(hpRoll) || Math.ceil(hitDie0 / 2) + 1;
    const sub = Object.entries(selSubclass)[0];
    const asiResult = needsASI
      ? (Object.entries(asiChoices) as [AbilityKey, number][])
          .filter(([, v]) => v > 0)
          .map(([ability, increase]) => ({ ability, increase }))
      : undefined;
    onConfirm({
      hpIncrease: roll + conMod,
      newSlots: computeSlots(),
      proficiencyBonus: pb,
      newFeatures: classes.map((c) => ({
        className: c.name,
        features: (data[c.name]?.levels?.find((l) => l.level === c.level)?.features ?? []).map((f) => ({
          name: f.name,
          desc: f.desc,
        })),
      })),
      newSubclass: sub ? { className: sub[0], subclassName: sub[1] } : undefined,
      asiChoices: asiResult,
    });
  }

  const allFeatures = classes.map((c) => {
    const cd = data[c.name];
    const lv = cd?.levels?.find((l) => l.level === c.level);
    const atSubclassLevel = c.level === cd?.subclassLevel;
    return {
      cls: c, cd, lv,
      // Treat this level as a subclass unlock if keyword OR known unlock level
      isSubclassUnlock: (lv?.subclassUnlock || atSubclassLevel) && !c.subclass,
    };
  });

  const newSlots = computeSlots();
  const gainedSlots = newSlots.filter((s) => {
    const old = currentSlots.find((cs) => cs.level === s.level);
    return s.max > (old?.max ?? 0);
  });

  return (
    <div style={S.overlay}>
      <div style={S.modal}>
        {/* Header */}
        <div style={S.hdr}>
          <div style={{ flex:1 }}>
            <div style={S.hdrTitle}>Level Up!</div>
            <div style={S.hdrSub}>{characterName} → Level {newLevel}</div>
          </div>
          <div style={S.lvlBadge}>{newLevel}</div>
        </div>

        {/* Step tabs */}
        <div style={{ display:'flex', borderBottom:'1px solid var(--border-light)' }}>
          {steps.map((s, i) => (
            <div key={s} style={{ flex:1, textAlign:'center', padding:'6px 4px',
              fontFamily:'var(--font-display)', fontSize:10, fontWeight:700,
              letterSpacing:0.5, textTransform:'uppercase',
              background: i===step ? 'var(--gold)' : i<step ? 'var(--parchment-dark)' : 'var(--parchment)',
              color: i===step ? 'var(--ink)' : 'var(--border)',
              borderRight: i<steps.length-1 ? '1px solid var(--border-light)' : 'none',
            }}>
              {s==='review'?'What\'s New': s==='subclass'?'Choose Subclass': s==='asi'?'Ability Scores':'Roll HP'}
            </div>
          ))}
        </div>

        <div style={{ padding:14 }}>
          {loading && <div style={{ textAlign:'center', padding:24, fontStyle:'italic', color:'var(--border)' }}>Consulting the arcane tomes…</div>}

          {/* ── REVIEW ── */}
          {!loading && steps[step]==='review' && (
            <>
              {/* Prof bonus */}
              <div style={S.panel}>
                <div style={S.pHdr}>Proficiency Bonus</div>
                <div style={{ ...S.pBody, display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ fontFamily:'var(--font-display)', fontSize:28, fontWeight:700, color:'var(--gold)' }}>+{pb}</div>
                  <div style={{ fontSize:13, color:'var(--ink-light)' }}>Your proficiency bonus is now +{pb}. This applies to all proficient skills, saves, and attacks.</div>
                </div>
              </div>

              {/* Features */}
              {allFeatures.map(({ cls, lv, cd, isSubclassUnlock }) => (
                <div key={cls.name} style={S.panel}>
                  <div style={S.pHdr}>{cls.name} Level {cls.level} Features</div>
                  <div style={S.pBody}>
                    {!lv && <div style={{ fontStyle:'italic', color:'var(--border)', fontSize:13 }}>Feature data unavailable — check dnd5e.wikidot.com.</div>}
                    {lv?.features.length === 0 && <div style={{ fontStyle:'italic', color:'var(--border)', fontSize:13 }}>No new class features at this level.</div>}
                    {lv?.features.map((feat) => (
                      <div key={feat.index} style={{ marginBottom:8, borderBottom:'0.5px solid var(--parchment-dark)', paddingBottom:8 }}>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                          <div style={{ fontFamily:'var(--font-display)', fontSize:13, fontWeight:600 }}>
                            {feat.name}
                            {feat.name.toLowerCase().includes('ability score') && (
                              <span style={{ marginLeft:6, fontSize:9, background:'var(--gold)', color:'var(--ink)', padding:'1px 5px', borderRadius:2, fontFamily:'var(--font-display)', fontWeight:700 }}>ASI</span>
                            )}
                          </div>
                          {feat.desc && (
                            <button onClick={() => setExpanded(expanded===feat.index?null:feat.index)}
                              style={{ fontSize:11, color:'var(--gold)', background:'none', border:'none', cursor:'pointer', fontStyle:'italic' }}>
                              {expanded===feat.index?'hide':'details'}
                            </button>
                          )}
                        </div>
                        {expanded===feat.index && (
                          <div style={{ fontSize:12, color:'var(--ink-light)', lineHeight:1.6, marginTop:6, padding:8, background:'var(--parchment)', border:'1px solid var(--border-light)', borderRadius:3, whiteSpace:'pre-wrap' }}>
                            {feat.desc || 'See Player\'s Handbook for full description.'}
                          </div>
                        )}
                      </div>
                    ))}
                    {lv?.abilityScoreImprovement && (
                      <div style={{ background:'#fffbe6', border:'1px solid var(--gold)', borderRadius:3, padding:8, fontSize:12 }}>
                        <strong>ASI:</strong> Increase one score by 2, or two scores by 1. Go to the <strong>Abilities</strong> tab to apply.
                      </div>
                    )}
                    {isSubclassUnlock && (
                      <div style={{ background:'#e8f4e8', border:'1px solid #a5d6a7', borderRadius:3, padding:8, fontSize:12, color:'#2e7d32' }}>
                        <strong>{cd?.subclassLabel ?? 'Subclass'}:</strong> You get to choose your {cd?.subclassLabel ?? 'subclass'} at this level! We'll walk you through options next.
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* New spell slots */}
              {gainedSlots.length > 0 && (
                <div style={S.panel}>
                  <div style={S.pHdr}>New Spell Slots</div>
                  <div style={{ ...S.pBody, display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6 }}>
                    {gainedSlots.map((s) => {
                      const old = currentSlots.find((cs) => cs.level===s.level);
                      return (
                        <div key={s.level} style={{ background:'var(--parchment)', border:'1.5px solid var(--gold)', borderRadius:4, padding:'6px 8px', textAlign:'center' }}>
                          <div style={{ fontFamily:'var(--font-display)', fontSize:9, fontWeight:700, color:'var(--border)', textTransform:'uppercase' }}>Level {s.level}</div>
                          <div style={{ fontFamily:'var(--font-display)', fontSize:22, fontWeight:700 }}>{s.max}</div>
                          {old && <div style={{ fontSize:10, color:'var(--gold)', fontFamily:'var(--font-display)' }}>+{s.max-(old.max??0)} new</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── SUBCLASS ── */}
          {!loading && steps[step]==='subclass' && (
            <>
              {allFeatures.filter(({ isSubclassUnlock }) => isSubclassUnlock).map(({ cls, cd }) => (
                <div key={cls.name} style={S.panel}>
                  <div style={S.pHdr}>Choose Your {cd?.subclassLabel ?? 'Subclass'}</div>
                  <div style={S.pBody}>
                    <div style={{ fontSize:13, color:'var(--ink-light)', marginBottom:10, fontStyle:'italic' }}>
                      At level {cls.level}, your {cls.name} chooses a {cd?.subclassLabel ?? 'subclass'}. This shapes your abilities for the rest of your career.
                    </div>
                    {cd?.subclassesLoading && <div style={{ fontStyle:'italic', color:'var(--border)', fontSize:13 }}>Loading options…</div>}
                    {!cd?.subclassesLoading && (cd?.subclasses?.length ?? 0) > 0 && (
                      <div style={{ fontSize:11, color:'var(--border)', fontStyle:'italic', marginBottom:8, padding:'4px 8px', background:'var(--parchment-dark)', borderRadius:3 }}>
                        Only SRD subclasses shown below. Others (e.g. Circle of the Moon) must be entered manually — type the name in the field at the bottom.
                      </div>
                    )}
                    {!cd?.subclassesLoading && (cd?.subclasses ?? []).map((sc) => (
                      <div key={sc.index} onClick={() => setSelSubclass((p) => ({ ...p, [cls.name]: sc.name }))}
                        style={{ padding:10, marginBottom:8, borderRadius:4, cursor:'pointer',
                          border: selSubclass[cls.name]===sc.name ? '2px solid var(--gold)' : '1.5px solid var(--border-light)',
                          background: selSubclass[cls.name]===sc.name ? 'rgba(201,162,39,0.08)' : 'var(--parchment)',
                        }}>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                          <div style={{ fontFamily:'var(--font-display)', fontSize:13, fontWeight:600 }}>
                            {sc.name}
                            {selSubclass[cls.name]===sc.name && <span style={{ marginLeft:8, fontSize:9, background:'var(--gold)', color:'var(--ink)', padding:'1px 5px', borderRadius:2, fontFamily:'var(--font-display)', fontWeight:700 }}>SELECTED</span>}
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); setExpanded(expanded===sc.index?null:sc.index); }}
                            style={{ fontSize:11, color:'var(--gold)', background:'none', border:'none', cursor:'pointer', fontStyle:'italic' }}>
                            {expanded===sc.index?'hide':'details'}
                          </button>
                        </div>
                        {expanded===sc.index && sc.desc && (
                          <div style={{ fontSize:12, color:'var(--ink-light)', lineHeight:1.6, marginTop:8, whiteSpace:'pre-wrap' }}>{sc.desc}</div>
                        )}
                      </div>
                    ))}
                    {/* Manual entry — always visible so non-SRD subclasses can be typed in */}
                    {!cd?.subclassesLoading && (
                      <div style={{ marginTop:10, padding:10, background:'#fff8e6', border:'1px solid var(--gold)', borderRadius:4 }}>
                        <div style={{ fontFamily:'var(--font-display)', fontSize:10, fontWeight:700, color:'var(--gold)', letterSpacing:1, textTransform:'uppercase', marginBottom:4 }}>
                          {(cd?.subclasses?.length ?? 0) > 0 ? 'Or type a non-SRD subclass name:' : 'Type your subclass name:'}
                        </div>
                        {(cd?.subclasses?.length ?? 0) === 0 && (
                          <div style={{ fontSize:12, color:'var(--ink-light)', lineHeight:1.5, marginBottom:8 }}>
                            Non-SRD subclasses (e.g. Circle of the Moon, Path of the Totem Warrior) aren't in the free rules database. Look yours up at <strong>dnd5e.wikidot.com</strong> and type the name here.
                          </div>
                        )}
                        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                          <input
                            type="text"
                            placeholder={`e.g. ${cd?.subclassLabel === 'Druid Circle' ? 'Circle of the Moon' : cd?.subclassLabel === 'Primal Path' ? 'Path of the Totem Warrior' : 'Subclass name…'}`}
                            value={typeof selSubclass[cls.name] === 'string' && !(cd?.subclasses ?? []).find(sc => sc.name === selSubclass[cls.name]) ? selSubclass[cls.name] : ''}
                            onChange={(e) => setSelSubclass((p) => ({ ...p, [cls.name]: e.target.value }))}
                            style={{ flex:1, padding:'5px 8px', fontFamily:'var(--font-body)', fontSize:13 }}
                          />
                          {selSubclass[cls.name] && <span style={{ fontSize:11, color:'#2e7d32', fontWeight:600, flexShrink:0 }}>✓ Set</span>}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}

          {/* ── ASI ── */}
          {!loading && steps[step]==='asi' && (
            <div style={S.panel}>
              <div style={S.pHdr}>Ability Score Improvement</div>
              <div style={S.pBody}>
                <div style={{ fontSize:13, color:'var(--ink-light)', marginBottom:12, lineHeight:1.6 }}>
                  You can increase one ability score by 2, or two ability scores by 1 each. No score can exceed 20.
                </div>
                <div style={{ display:'flex', gap:8, marginBottom:14 }}>
                  {(['+2', '+1+1'] as const).map((m) => (
                    <button key={m} onClick={() => { setAsiMode(m); setAsiChoices({ STR:0,DEX:0,CON:0,INT:0,WIS:0,CHA:0 }); }}
                      style={{ flex:1, padding:'6px 8px', fontFamily:'var(--font-display)', fontSize:11, fontWeight:700,
                        cursor:'pointer', borderRadius:3,
                        background: asiMode===m ? 'var(--ink)' : 'var(--parchment)',
                        color: asiMode===m ? 'var(--gold-light)' : 'var(--border)',
                        border: asiMode===m ? '1.5px solid var(--gold)' : '1.5px solid var(--border-light)',
                      }}>
                      {m === '+2' ? '+2 to One Score' : '+1 to Two Scores'}
                    </button>
                  ))}
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
                  {(['STR','DEX','CON','INT','WIS','CHA'] as AbilityKey[]).map((ab) => {
                    const cur = abilities[ab] ?? 10;
                    const inc = asiChoices[ab];
                    const newVal = cur + inc;
                    const capped = cur >= 20;
                    const canAdd = !capped && asiTotal < asiMax && (asiMode==='+2' ? inc < 2 : inc < 1);
                    return (
                      <div key={ab} style={{ textAlign:'center', background: inc > 0 ? 'rgba(201,162,39,0.08)' : 'var(--parchment)', border: inc > 0 ? '1.5px solid var(--gold)' : '1.5px solid var(--border-light)', borderRadius:4, padding:'8px 4px' }}>
                        <div style={{ fontFamily:'var(--font-display)', fontSize:9, fontWeight:700, color:'var(--border)', textTransform:'uppercase', letterSpacing:0.5 }}>{ab}</div>
                        <div style={{ fontFamily:'var(--font-display)', fontSize:24, fontWeight:700, color: inc > 0 ? 'var(--gold)' : 'var(--ink)', lineHeight:1, margin:'4px 0' }}>
                          {newVal}
                          {inc > 0 && <span style={{ fontSize:12, color:'var(--gold)' }}> (+{inc})</span>}
                        </div>
                        {capped ? (
                          <div style={{ fontSize:9, color:'var(--border)', fontStyle:'italic' }}>MAX</div>
                        ) : (
                          <div style={{ display:'flex', gap:4, justifyContent:'center' }}>
                            <button onClick={() => setAsi(ab, inc - 1)} disabled={inc === 0}
                              style={{ width:22, height:22, borderRadius:2, fontFamily:'var(--font-display)', fontSize:14, fontWeight:700, cursor:inc===0?'default':'pointer', border:'1px solid var(--border-light)', background: inc===0 ? 'var(--parchment-dark)' : 'var(--parchment)', color: inc===0 ? 'var(--border-light)' : 'var(--ink)' }}>−</button>
                            <button onClick={() => setAsi(ab, inc + 1)} disabled={!canAdd}
                              style={{ width:22, height:22, borderRadius:2, fontFamily:'var(--font-display)', fontSize:14, fontWeight:700, cursor:!canAdd?'default':'pointer', border:'1px solid var(--border-light)', background: !canAdd ? 'var(--parchment-dark)' : 'var(--parchment)', color: !canAdd ? 'var(--border-light)' : 'var(--ink)' }}>+</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {asiTotal > 0 && asiTotal < asiMax && (
                  <div style={{ marginTop:10, fontSize:12, color:'var(--border)', fontStyle:'italic', textAlign:'center' }}>
                    {asiMax - asiTotal} point{asiMax - asiTotal !== 1 ? 's' : ''} remaining
                  </div>
                )}
                {asiTotal === 0 && (
                  <div style={{ marginTop:10, fontSize:12, color:'var(--border)', fontStyle:'italic', textAlign:'center' }}>
                    Select an ability score to improve, or click Next to skip.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── HP ROLL ── */}
          {!loading && steps[step]==='hp' && (
            <div style={S.panel}>
              <div style={S.pHdr}>Roll for Hit Points</div>
              <div style={S.pBody}>
                {classes.map((c) => {
                  const hd = data[c.name]?.hitDie ?? hitDieForClass(c.name) ?? c.hitDie;
                  return (
                    <div key={c.name} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 0', borderBottom:'0.5px solid var(--parchment-dark)' }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontFamily:'var(--font-display)', fontSize:12, fontWeight:600 }}>{c.name}</div>
                        <div style={{ fontSize:11, color:'var(--border)' }}>Hit Die: d{hd} · Average: {Math.ceil(hd/2)+1}</div>
                      </div>
                      <div style={{ fontFamily:'var(--font-display)', fontSize:22, fontWeight:700, color:'var(--red)', background:'var(--parchment-dark)', border:'1.5px solid var(--border-light)', borderRadius:4, padding:'4px 10px' }}>d{hd}</div>
                    </div>
                  );
                })}
                <div style={{ marginTop:12 }}>
                  <div style={{ fontSize:13, color:'var(--ink-light)', marginBottom:8 }}>
                    Enter how much you rolled. Your CON modifier ({conMod>=0?'+':''}{conMod}) will be added automatically.
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                    <label style={{ fontFamily:'var(--font-display)', fontSize:11, fontWeight:700, color:'var(--border)', textTransform:'uppercase', letterSpacing:0.5 }}>HP rolled:</label>
                    <input type="number" min={1} max={data[classes[0]?.name]?.hitDie ?? hitDieForClass(classes[0]?.name ?? '') ?? classes[0]?.hitDie ?? 12} value={hpRoll}
                      onChange={(e) => setHpRoll(e.target.value)}
                      placeholder={String(Math.ceil((data[classes[0]?.name]?.hitDie ?? hitDieForClass(classes[0]?.name ?? '') ?? classes[0]?.hitDie ?? 8)/2)+1)}
                      style={{ width:80, textAlign:'center', fontFamily:'var(--font-display)', fontSize:20, fontWeight:700, padding:'4px 8px' }}
                      autoFocus />
                    {hpRoll && <span style={{ fontSize:13, color:'var(--ink)' }}>= <strong>{parseInt(hpRoll)+(conMod)}</strong> HP gained</span>}
                  </div>
                  {/* Quick-pick buttons */}
                  <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                    {Array.from({ length: data[classes[0]?.name]?.hitDie ?? hitDieForClass(classes[0]?.name ?? '') ?? classes[0]?.hitDie ?? 8 }, (_, i) => i+1).map((v) => (
                      <button key={v} onClick={() => setHpRoll(String(v))}
                        style={{ fontFamily:'var(--font-display)', fontSize:11, fontWeight:700, width:32, height:32, borderRadius:3, cursor:'pointer',
                          background: hpRoll===String(v) ? 'var(--ink)' : 'var(--parchment)',
                          color: hpRoll===String(v) ? 'var(--gold-light)' : 'var(--ink)',
                          border: hpRoll===String(v) ? '1.5px solid var(--gold)' : '1.5px solid var(--border-light)',
                        }}>{v}</button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={S.foot}>
          {step>0 && <button className="ink-btn ghost" onClick={() => setStep(step-1)}>← Back</button>}
          <button className="ink-btn ghost" onClick={onClose}>Skip for now</button>
          {!loading && (
            <button className="ink-btn" onClick={() => { if(step<steps.length-1) setStep(step+1); else doConfirm(); }}
              disabled={steps[step]==='hp' && !hpRoll}>
              {step<steps.length-1 ? 'Next →' : 'Apply Level Up ✓'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

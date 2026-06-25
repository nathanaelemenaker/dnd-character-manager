'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface CombatEncounter {
  title: string;
  location: string;
  outcome: 'victory' | 'defeat' | 'fled' | 'mixed' | 'avoided';
  enemies: string[];
  highlights: string[];
  casualties: string[];
}

interface PartyMemberStatus {
  characterName: string;
  playerName: string;
  sessionMVP: boolean;
  hpNotes: string;
  notableActions: string;
  itemsAcquired: string[];
  levelUp: boolean;
  xpOrMilestones: string;
}

interface GeneratedOutput {
  sessionTitle?: string;
  summary: string;
  epicMoment?: string;
  combatLog: CombatEncounter[];
  partyStatus: PartyMemberStatus[];
  openThreads?: string[];
  quoteOfTheSession?: string;
}

interface SharedSession {
  sessionNumber: number;
  title: string | null;
  generatedOutput: GeneratedOutput;
  campaign: { name: string; description: string | null };
}

const OUTCOME_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  victory: { bg: 'rgba(46,125,50,0.12)', color: '#2e7d32', label: 'Victory' },
  defeat: { bg: 'rgba(183,28,28,0.10)', color: '#b71c1c', label: 'Defeat' },
  fled: { bg: 'rgba(230,81,0,0.10)', color: '#e65100', label: 'Fled' },
  mixed: { bg: 'rgba(245,127,23,0.10)', color: '#f57f17', label: 'Mixed' },
  avoided: { bg: 'rgba(21,101,192,0.10)', color: '#1565c0', label: 'Avoided' },
};

export default function SharePage() {
  const params = useParams<{ token: string }>();
  const [session, setSession] = useState<SharedSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<'summary' | 'combat' | 'party'>('summary');

  useEffect(() => {
    fetch(`/api/share/${params.token}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => setSession(d.session))
      .catch(status => { if (status === 404) setNotFound(true); })
      .finally(() => setLoading(false));
  }, [params.token]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f0e8', fontFamily: 'Georgia, serif', color: '#555' }}>
        Loading…
      </div>
    );
  }

  if (notFound || !session) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f5f0e8', fontFamily: 'Georgia, serif' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚔️</div>
        <div style={{ fontSize: 20, color: '#2c2c2c', marginBottom: 8 }}>Session Not Found</div>
        <div style={{ fontSize: 14, color: '#888', fontStyle: 'italic' }}>This link may have expired or the session hasn't been generated yet.</div>
      </div>
    );
  }

  const output = session.generatedOutput;

  return (
    <div style={{ minHeight: '100vh', background: '#f5f0e8', paddingBottom: 48 }}>
      {/* Header */}
      <div style={{ background: '#1a1a1a', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: 11, color: 'rgba(201,162,39,0.7)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 2 }}>
            {session.campaign.name}
          </div>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: 18, color: '#c9a227', letterSpacing: 1 }}>
            Session #{session.sessionNumber}{session.title ? ` — ${session.title}` : ''}
          </div>
        </div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>
          D&amp;D Session Log
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 16px' }}>
        {/* Session title from Claude */}
        {output.sessionTitle && (
          <div style={{ fontSize: 14, fontStyle: 'italic', color: '#8b6914', marginBottom: 20, opacity: 0.9 }}>
            "{output.sessionTitle}"
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid #d4c5a0' }}>
          {(['summary', 'combat', 'party'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderBottom: activeTab === tab ? '2px solid #c9a227' : '2px solid transparent',
                background: 'transparent',
                fontFamily: 'Georgia, serif',
                fontSize: 12,
                letterSpacing: 1,
                textTransform: 'uppercase',
                color: activeTab === tab ? '#1a1a1a' : '#888',
                cursor: 'pointer',
                fontWeight: activeTab === tab ? 700 : 400,
              }}
            >
              {tab === 'summary' ? 'Chronicle' : tab === 'combat' ? 'Combat' : 'Party'}
            </button>
          ))}
        </div>

        {/* Summary tab */}
        {activeTab === 'summary' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ background: '#fff', border: '1.5px solid #d4c5a0', borderRadius: 6, padding: '20px 24px' }}>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid #eee' }}>
                Session Summary
              </div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: 14, lineHeight: 1.8, color: '#2c2c2c', whiteSpace: 'pre-wrap' }}>
                {output.summary}
              </div>
            </div>

            {output.epicMoment && (
              <div style={{ background: 'rgba(201,162,39,0.06)', border: '1.5px solid rgba(201,162,39,0.3)', borderRadius: 6, padding: '20px 24px' }}>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: 10, fontWeight: 700, color: '#8b6914', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>
                  ⚡ Epic Moment
                </div>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: 14, lineHeight: 1.8, color: '#2c2c2c', fontStyle: 'italic' }}>
                  {output.epicMoment}
                </div>
              </div>
            )}

            {output.quoteOfTheSession && (
              <div style={{ background: '#fff', border: '1.5px solid #d4c5a0', borderRadius: 6, padding: '16px 20px' }}>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>
                  Quote of the Session
                </div>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: 14, lineHeight: 1.7, color: '#2c2c2c', fontStyle: 'italic' }}>
                  {output.quoteOfTheSession}
                </div>
              </div>
            )}

            {output.openThreads && output.openThreads.length > 0 && (
              <div style={{ background: '#fff', border: '1.5px solid #d4c5a0', borderRadius: 6, padding: '20px 24px' }}>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid #eee' }}>
                  🧵 Open Threads
                </div>
                <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {output.openThreads.map((thread, i) => (
                    <li key={i} style={{ fontFamily: 'Georgia, serif', fontSize: 13, lineHeight: 1.6, color: '#444' }}>
                      {thread}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Combat tab */}
        {activeTab === 'combat' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {!output.combatLog?.length ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: '#888', fontStyle: 'italic' }}>No combat encounters this session.</div>
            ) : output.combatLog.map((enc, i) => {
              const style = OUTCOME_STYLES[enc.outcome] ?? OUTCOME_STYLES.mixed;
              return (
                <div key={i} style={{ background: '#fff', border: '1.5px solid #d4c5a0', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ background: '#1a1a1a', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: 'Georgia, serif', fontSize: 13, color: '#c9a227', fontWeight: 700 }}>{enc.title}</span>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 3, background: style.bg, color: style.color, border: `1px solid ${style.color}`, fontWeight: 700 }}>
                      {style.label}
                    </span>
                  </div>
                  <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ fontSize: 11, color: '#888' }}>📍 {enc.location}</div>
                    {enc.enemies.length > 0 && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Enemies</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {enc.enemies.map((e, j) => (
                            <span key={j} style={{ fontSize: 11, padding: '1px 6px', background: 'rgba(183,28,28,0.08)', color: '#b71c1c', border: '1px solid rgba(183,28,28,0.2)', borderRadius: 3 }}>{e}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {enc.highlights.length > 0 && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>Highlights</div>
                        <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {enc.highlights.map((h, j) => <li key={j} style={{ fontSize: 13, lineHeight: 1.5, color: '#333' }}>{h}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Party tab */}
        {activeTab === 'party' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {!output.partyStatus?.length ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: '#888', fontStyle: 'italic', gridColumn: '1/-1' }}>No party status data.</div>
            ) : output.partyStatus.map((m, i) => (
              <div key={i} style={{ background: '#fff', border: m.sessionMVP ? '1.5px solid rgba(201,162,39,0.6)' : '1.5px solid #d4c5a0', borderRadius: 6, overflow: 'hidden' }}>
                <div style={{ background: '#1a1a1a', padding: '10px 14px' }}>
                  <div style={{ fontFamily: 'Georgia, serif', fontSize: 13, color: '#c9a227', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {m.characterName}
                    {m.sessionMVP && <span style={{ fontSize: 10, color: '#ffdd44', background: 'rgba(255,221,68,0.15)', padding: '1px 6px', borderRadius: 2, border: '1px solid rgba(255,221,68,0.4)' }}>★ MVP</span>}
                    {m.levelUp && <span style={{ fontSize: 10, color: '#ffdd44', background: 'rgba(255,221,68,0.15)', padding: '1px 5px', borderRadius: 2, border: '1px solid rgba(255,221,68,0.3)' }}>LEVEL UP ⬆</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(201,162,39,0.7)', marginTop: 2 }}>played by {m.playerName}</div>
                </div>
                <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {m.notableActions && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 3 }}>Notable Actions</div>
                      <div style={{ fontSize: 12, color: '#444', lineHeight: 1.5 }}>{m.notableActions}</div>
                    </div>
                  )}
                  {m.hpNotes && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 3 }}>HP / Damage</div>
                      <div style={{ fontSize: 12, color: '#444', lineHeight: 1.5 }}>{m.hpNotes}</div>
                    </div>
                  )}
                  {m.itemsAcquired?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Items Acquired</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {m.itemsAcquired.map((item, j) => (
                          <span key={j} style={{ fontSize: 10, padding: '2px 6px', background: 'rgba(201,162,39,0.1)', color: '#8b6914', border: '1px solid rgba(201,162,39,0.3)', borderRadius: 3 }}>{item}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

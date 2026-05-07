'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import RecordButton from '@/components/RecordButton';

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
  hpNotes: string;
  notableActions: string;
  itemsAcquired: string[];
  levelUp: boolean;
  xpOrMilestones: string;
}

interface GeneratedOutput {
  summary: string;
  combatLog: CombatEncounter[];
  partyStatus: PartyMemberStatus[];
}

interface SessionLog {
  id: string;
  campaignId: string;
  sessionNumber: number;
  title: string | null;
  rawTranscript: string;
  generatedOutput: GeneratedOutput | null;
  transcriptStatus: string | null;
  transcriptError: string | null;
  createdAt: string;
  updatedAt: string;
}

const OUTCOME_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  victory: { bg: 'rgba(46,125,50,0.12)', color: '#2e7d32', label: 'Victory' },
  defeat:  { bg: 'rgba(139,26,26,0.12)', color: 'var(--red)', label: 'Defeat' },
  fled:    { bg: 'rgba(245,124,0,0.12)', color: '#e65100', label: 'Fled' },
  mixed:   { bg: 'rgba(33,150,243,0.1)', color: '#0d47a1', label: 'Mixed' },
  avoided: { bg: 'rgba(102,102,102,0.1)', color: '#555', label: 'Avoided' },
};

export default function SessionLogPage() {
  const params = useParams<{ id: string; sessionId: string }>();
  const router = useRouter();

  const [log, setLog] = useState<SessionLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'summary' | 'combat' | 'party'>('summary');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [showRaw, setShowRaw] = useState(false);
  const [editingTranscript, setEditingTranscript] = useState(false);
  const [draftTranscript, setDraftTranscript] = useState('');
  const [savingTranscript, setSavingTranscript] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${params.id}/sessions/${params.sessionId}`);
      if (res.status === 404) { router.replace(`/campaigns/${params.id}`); return; }
      if (!res.ok) throw new Error('Failed to load session');
      const data = await res.json();
      setLog(data.session);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [params.id, params.sessionId, router]);

  useEffect(() => { load(); }, [load]);

  async function handleGenerate() {
    if (!confirm(log?.generatedOutput ? 'Re-generate the session log? This will overwrite the current output.' : 'Generate the session log now?')) return;
    setGenerating(true);
    setGenError('');
    try {
      const res = await fetch(`/api/campaigns/${params.id}/sessions/${params.sessionId}/generate`, {
        method: 'POST',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? 'Generation failed');
      }
      await load();
      setActiveTab('summary');
    } catch (e: any) {
      setGenError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete session #${log?.sessionNumber}? This cannot be undone.`)) return;
    setDeleting(true);
    await fetch(`/api/campaigns/${params.id}/sessions/${params.sessionId}`, { method: 'DELETE' });
    router.replace(`/campaigns/${params.id}`);
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 16px', textAlign: 'center', color: 'var(--border)', fontStyle: 'italic' }}>
        Loading session…
      </div>
    );
  }

  if (error || !log) {
    return (
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 16px', textAlign: 'center', color: 'var(--red)' }}>
        {error || 'Session not found.'}
      </div>
    );
  }

  const output = log.generatedOutput as GeneratedOutput | null;
  const hasTranscript = log.rawTranscript.trim().length > 0;
  const isTranscribing = log.transcriptStatus === 'pending' || log.transcriptStatus === 'processing';

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 16px' }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--border)' }}>
        <Link href="/campaigns" style={{ color: 'var(--border)', textDecoration: 'none' }}>Campaigns</Link>
        <span>›</span>
        <Link href={`/campaigns/${params.id}`} style={{ color: 'var(--border)', textDecoration: 'none' }}>Campaign</Link>
        <span>›</span>
        <span style={{ color: 'var(--ink)' }}>Session #{log.sessionNumber}</span>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 20,
                fontWeight: 700,
                color: 'var(--gold)',
                background: 'var(--ink)',
                borderRadius: 4,
                padding: '2px 10px',
                letterSpacing: 1,
              }}
            >
              #{log.sessionNumber}
            </span>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--ink)', margin: 0, letterSpacing: 0.5 }}>
              {log.title ?? `Session ${log.sessionNumber}`}
            </h1>
          </div>
          <div style={{ fontSize: 11, color: 'var(--border)', marginTop: 6 }}>
            {new Date(log.createdAt).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button
            className="ink-btn"
            onClick={handleGenerate}
            disabled={generating || isTranscribing || (!hasTranscript && !output)}
            title={!hasTranscript && !output ? 'Add a transcript first' : undefined}
            style={{ fontSize: 12, opacity: (!hasTranscript && !output) ? 0.5 : 1 }}
          >
            {generating ? '⏳ Generating…' : output ? '↺ Regenerate' : '✦ Generate Log'}
          </button>
          <button
            className="ink-btn danger"
            onClick={handleDelete}
            disabled={deleting}
            style={{ fontSize: 12 }}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>

      {genError && (
        <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 16, padding: '8px 12px', background: 'rgba(139,26,26,0.06)', borderRadius: 4 }}>
          Generation failed: {genError}
        </div>
      )}

      {/* Recording section — always shown unless transcript is ready and log is generated */}
      {!output && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, color: 'var(--border)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 }}>
            Step 1 — Record or Paste Transcript
          </div>
          <RecordButton
            campaignId={params.id}
            sessionId={params.sessionId}
            initialStatus={log.transcriptStatus}
            initialError={log.transcriptError}
            onTranscriptReady={transcript => {
              setLog(prev => prev ? { ...prev, rawTranscript: transcript, transcriptStatus: 'done' } : prev);
            }}
          />
        </div>
      )}

      {!output && !generating && !isTranscribing && (
        <div
          style={{
            textAlign: 'center',
            padding: '36px 24px',
            border: '1.5px dashed var(--border-light)',
            borderRadius: 8,
            marginBottom: 24,
            color: 'var(--border)',
          }}
        >
          <div style={{ fontSize: 28, marginBottom: 10 }}>📜</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, marginBottom: 8, color: 'var(--ink)' }}>
            {hasTranscript ? 'Ready to Generate' : 'No Transcript Yet'}
          </div>
          <div style={{ fontSize: 13, fontStyle: 'italic', marginBottom: 16 }}>
            {hasTranscript
              ? 'Click "✦ Generate Log" to have Claude analyze the transcript and create the session chronicle.'
              : 'Record your session audio above, or paste a transcript using the toggle below.'}
          </div>
          {hasTranscript && (
            <button className="ink-btn" onClick={handleGenerate}>
              ✦ Generate Log
            </button>
          )}
        </div>
      )}

      {generating && (
        <div
          style={{
            textAlign: 'center',
            padding: '36px 24px',
            border: '1.5px solid var(--gold)',
            borderRadius: 8,
            marginBottom: 24,
            background: 'rgba(201,162,39,0.04)',
          }}
        >
          <div style={{ fontSize: 28, marginBottom: 10 }}>⏳</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, marginBottom: 6, color: 'var(--ink)' }}>
            Generating Session Chronicle…
          </div>
          <div style={{ fontSize: 13, color: 'var(--border)', fontStyle: 'italic' }}>
            Claude is analyzing the transcript. This may take 20–40 seconds.
          </div>
        </div>
      )}

      {output && (
        <>
          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1.5px solid var(--border-light)', marginBottom: 20, gap: 2 }}>
            {(['summary', 'combat', 'party'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  background: activeTab === tab ? 'var(--ink)' : 'transparent',
                  color: activeTab === tab ? 'var(--gold-light)' : 'var(--border)',
                  border: 'none',
                  borderBottom: activeTab === tab ? '2px solid var(--gold)' : '2px solid transparent',
                  fontFamily: 'var(--font-display)',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  padding: '8px 18px',
                  cursor: 'pointer',
                  marginBottom: -1.5,
                }}
              >
                {tab === 'summary' ? 'Session Summary' : tab === 'combat' ? `Combat Log (${output.combatLog?.length ?? 0})` : `Party Status (${output.partyStatus?.length ?? 0})`}
              </button>
            ))}
          </div>

          {/* Summary tab */}
          {activeTab === 'summary' && (
            <div
              style={{
                background: 'var(--parchment)',
                border: '1.5px solid var(--border-light)',
                borderRadius: 6,
                padding: '24px 28px',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'var(--border)',
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  marginBottom: 16,
                  paddingBottom: 8,
                  borderBottom: '1px solid var(--border-light)',
                }}
              >
                ✦ Session Chronicle ✦
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 16,
                  lineHeight: 1.8,
                  color: 'var(--ink)',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {output.summary}
              </div>
            </div>
          )}

          {/* Combat log tab */}
          {activeTab === 'combat' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {!output.combatLog?.length ? (
                <div className="empty-state" style={{ padding: '32px 0' }}>No combat encounters this session.</div>
              ) : (
                output.combatLog.map((enc, i) => {
                  const style = OUTCOME_STYLES[enc.outcome] ?? OUTCOME_STYLES.mixed;
                  return (
                    <div
                      key={i}
                      style={{
                        background: 'var(--parchment)',
                        border: '1.5px solid var(--border-light)',
                        borderRadius: 6,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          background: 'var(--ink)',
                          padding: '10px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--gold-light)', fontWeight: 700 }}>
                          {enc.title}
                        </span>
                        <span
                          style={{
                            fontSize: 10,
                            fontFamily: 'var(--font-display)',
                            fontWeight: 700,
                            letterSpacing: 0.5,
                            padding: '2px 8px',
                            borderRadius: 3,
                            background: style.bg,
                            color: style.color,
                            border: `1px solid ${style.color}`,
                          }}
                        >
                          {style.label}
                        </span>
                      </div>
                      <div style={{ padding: '14px 16px' }}>
                        {enc.location && (
                          <div style={{ fontSize: 12, color: 'var(--border)', fontStyle: 'italic', marginBottom: 10 }}>
                            📍 {enc.location}
                          </div>
                        )}
                        {enc.enemies?.length > 0 && (
                          <div style={{ marginBottom: 10 }}>
                            <div className="field-label">Enemies</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 4 }}>
                              {enc.enemies.map((e, j) => (
                                <span
                                  key={j}
                                  style={{
                                    fontSize: 11,
                                    padding: '2px 7px',
                                    background: 'rgba(139,26,26,0.08)',
                                    color: 'var(--red)',
                                    border: '1px solid rgba(139,26,26,0.2)',
                                    borderRadius: 3,
                                    fontFamily: 'var(--font-display)',
                                  }}
                                >
                                  {e}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {enc.highlights?.length > 0 && (
                          <div style={{ marginBottom: enc.casualties?.length ? 10 : 0 }}>
                            <div className="field-label">Highlights</div>
                            <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: 'var(--ink-light)' }}>
                              {enc.highlights.map((h, j) => <li key={j}>{h}</li>)}
                            </ul>
                          </div>
                        )}
                        {enc.casualties?.length > 0 && (
                          <div>
                            <div className="field-label" style={{ color: 'var(--red)' }}>Casualties</div>
                            <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: 'var(--red)' }}>
                              {enc.casualties.map((c, j) => <li key={j}>{c}</li>)}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Party status tab */}
          {activeTab === 'party' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
              {!output.partyStatus?.length ? (
                <div className="empty-state" style={{ gridColumn: '1/-1', padding: '32px 0' }}>No party status data.</div>
              ) : (
                output.partyStatus.map((m, i) => (
                  <div
                    key={i}
                    style={{
                      background: 'var(--parchment)',
                      border: '1.5px solid var(--border-light)',
                      borderRadius: 6,
                      overflow: 'hidden',
                    }}
                  >
                    <div style={{ background: 'var(--ink)', padding: '10px 14px' }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--gold-light)', fontWeight: 700 }}>
                        {m.characterName}
                        {m.levelUp && (
                          <span style={{ marginLeft: 8, fontSize: 10, color: '#ffdd44', background: 'rgba(255,221,68,0.15)', padding: '1px 5px', borderRadius: 2, border: '1px solid rgba(255,221,68,0.3)' }}>
                            LEVEL UP ⬆
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(201,162,39,0.7)', marginTop: 2 }}>
                        played by {m.playerName}
                      </div>
                    </div>
                    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {m.hpNotes && (
                        <div>
                          <div className="field-label">HP / Damage</div>
                          <div style={{ fontSize: 12, color: 'var(--ink-light)', lineHeight: 1.5 }}>{m.hpNotes}</div>
                        </div>
                      )}
                      {m.notableActions && (
                        <div>
                          <div className="field-label">Notable Actions</div>
                          <div style={{ fontSize: 12, color: 'var(--ink-light)', lineHeight: 1.5 }}>{m.notableActions}</div>
                        </div>
                      )}
                      {m.itemsAcquired?.length > 0 && (
                        <div>
                          <div className="field-label">Items Acquired</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                            {m.itemsAcquired.map((item, j) => (
                              <span
                                key={j}
                                style={{
                                  fontSize: 10,
                                  padding: '2px 6px',
                                  background: 'rgba(201,162,39,0.1)',
                                  color: '#8b6914',
                                  border: '1px solid rgba(201,162,39,0.3)',
                                  borderRadius: 3,
                                  fontFamily: 'var(--font-display)',
                                }}
                              >
                                {item}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {m.xpOrMilestones && (
                        <div>
                          <div className="field-label">XP / Milestones</div>
                          <div style={{ fontSize: 12, color: 'var(--ink-light)', lineHeight: 1.5 }}>{m.xpOrMilestones}</div>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}

      {/* Raw Transcript toggle */}
      <div style={{ marginTop: 28, borderTop: '1px solid var(--border-light)', paddingTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            className="ink-btn ghost"
            style={{ fontSize: 11 }}
            onClick={() => {
              if (!showRaw) {
                setDraftTranscript(log.rawTranscript);
                setEditingTranscript(false);
              }
              setShowRaw(v => !v);
            }}
          >
            {showRaw ? '▲ Hide Transcript' : '▼ Show / Edit Transcript'}
          </button>
          {!log.rawTranscript.trim() && !showRaw && (
            <span style={{ fontSize: 11, color: 'var(--border)', fontStyle: 'italic' }}>
              No transcript yet — paste one here or use Record Audio above
            </span>
          )}
        </div>
        {showRaw && (
          <div style={{ marginTop: 12 }}>
            {!editingTranscript ? (
              <>
                {log.rawTranscript.trim() ? (
                  <pre
                    style={{
                      background: 'var(--parchment-dark)',
                      border: '1px solid var(--border-light)',
                      borderRadius: 4,
                      padding: '14px 16px',
                      fontSize: 12,
                      fontFamily: 'var(--font-body)',
                      color: 'var(--ink-light)',
                      lineHeight: 1.7,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      maxHeight: 400,
                      overflowY: 'auto',
                      margin: 0,
                    }}
                  >
                    {log.rawTranscript}
                  </pre>
                ) : (
                  <div style={{ fontSize: 13, color: 'var(--border)', fontStyle: 'italic', padding: '12px 0' }}>
                    No transcript yet.
                  </div>
                )}
                <button
                  className="ink-btn ghost"
                  style={{ fontSize: 11, marginTop: 8 }}
                  onClick={() => { setDraftTranscript(log.rawTranscript); setEditingTranscript(true); }}
                >
                  ✏ {log.rawTranscript.trim() ? 'Edit Transcript' : 'Paste Transcript'}
                </button>
              </>
            ) : (
              <>
                <textarea
                  style={{
                    width: '100%',
                    border: '1px solid var(--border-light)',
                    borderRadius: 4,
                    padding: '12px 14px',
                    fontSize: 13,
                    fontFamily: 'var(--font-body)',
                    lineHeight: 1.7,
                    resize: 'vertical',
                    minHeight: 200,
                    boxSizing: 'border-box',
                  }}
                  value={draftTranscript}
                  onChange={e => setDraftTranscript(e.target.value)}
                  placeholder="Paste session notes, chat logs, bullet points, or free-form descriptions here..."
                  autoFocus
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button
                    className="ink-btn"
                    style={{ fontSize: 11 }}
                    disabled={savingTranscript}
                    onClick={async () => {
                      setSavingTranscript(true);
                      try {
                        const res = await fetch(`/api/campaigns/${params.id}/sessions/${params.sessionId}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ rawTranscript: draftTranscript }),
                        });
                        if (!res.ok) throw new Error('Save failed');
                        setLog(prev => prev ? { ...prev, rawTranscript: draftTranscript } : prev);
                        setEditingTranscript(false);
                      } catch {
                        // keep editing
                      } finally {
                        setSavingTranscript(false);
                      }
                    }}
                  >
                    {savingTranscript ? 'Saving…' : 'Save Transcript'}
                  </button>
                  <button
                    className="ink-btn ghost"
                    style={{ fontSize: 11 }}
                    onClick={() => setEditingTranscript(false)}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

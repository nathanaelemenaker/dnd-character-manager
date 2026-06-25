'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface CampaignMember {
  id: string;
  role: 'DM' | 'PLAYER';
  userId: string | null;
  guestName: string | null;
  guestCharacterName: string | null;
  user: { id: string; name: string | null; email: string; characters: { id: string; name: string }[] } | null;
  character: {
    id: string;
    name: string;
    level: number;
    portrait: string | null;
    classes: Array<{ classKey: string; level: number }>;
  } | null;
}

function memberDisplayName(m: CampaignMember): string {
  return m.guestName ?? m.user?.name ?? m.user?.email ?? 'Unknown';
}

interface SessionSummary {
  id: string;
  sessionNumber: number;
  title: string | null;
  createdAt: string;
  generatedOutput: unknown;
}

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  notes: string;
  styleInstructions: string | null;
  members: CampaignMember[];
  sessions: SessionSummary[];
  _count: { sessions: number };
}

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [membership, setMembership] = useState<CampaignMember | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [activeTab, setActiveTab] = useState<'sessions' | 'party' | 'notes' | 'settings'>('sessions');

  // New session form
  const [showNewSession, setShowNewSession] = useState(false);
  const [sessionTitle, setSessionTitle] = useState('');
  const [transcript, setTranscript] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Add member form
  const [showAddMember, setShowAddMember] = useState(false);
  const [addMemberMode, setAddMemberMode] = useState<'email' | 'guest'>('email');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberGuestName, setMemberGuestName] = useState('');
  const [memberRole, setMemberRole] = useState<'PLAYER' | 'DM'>('PLAYER');
  const [addingMember, setAddingMember] = useState(false);
  const [addMemberError, setAddMemberError] = useState('');
  const [linkingMemberId, setLinkingMemberId] = useState<string | null>(null);
  const [linkEmail, setLinkEmail] = useState('');
  const [linkingInProgress, setLinkingInProgress] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [editingCharNameId, setEditingCharNameId] = useState<string | null>(null);
  const [editingCharNameValue, setEditingCharNameValue] = useState('');

  const [myCharacters, setMyCharacters] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedCharId, setSelectedCharId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${params.id}`);
      if (res.status === 404) { router.replace('/campaigns'); return; }
      if (!res.ok) throw new Error('Failed to load campaign');
      const data = await res.json();
      setCampaign(data.campaign);
      setMembership(data.membership ?? null);
      setIsAdmin(data.isAdmin ?? false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [params.id, router]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch('/api/characters')
      .then(r => r.json())
      .then(d => setMyCharacters(d.items ?? []))
      .catch(() => {});
  }, []);

  const isDM = membership?.role === 'DM';
  const canManage = isDM || isAdmin;

  async function handleNewSession(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await fetch(`/api/campaigns/${params.id}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: sessionTitle.trim() || null, rawTranscript: transcript.trim() }),
      });
      if (!res.ok) throw new Error('Failed to save session');
      const session = await res.json();
      router.push(`/campaigns/${params.id}/sessions/${session.id}`);
    } catch (e: any) {
      setSubmitError(e.message);
      setSubmitting(false);
    }
  }

  async function handleAssignCharacter(memberId: string, charId: string) {
    await fetch(`/api/campaigns/${params.id}/members/${memberId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ characterId: charId || null }),
    });
    load();
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    const isGuest = addMemberMode === 'guest';
    const value = isGuest ? memberGuestName.trim() : memberEmail.trim();
    if (!value) return;
    setAddingMember(true);
    setAddMemberError('');
    try {
      const body = isGuest
        ? { guestName: value, role: memberRole }
        : { email: value, role: memberRole };
      const res = await fetch(`/api/campaigns/${params.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to add member');
      setMemberEmail('');
      setMemberGuestName('');
      setShowAddMember(false);
      load();
    } catch (e: any) {
      setAddMemberError(e.message === 'user_not_found' ? 'No user found with that email.' : e.message);
    } finally {
      setAddingMember(false);
    }
  }

  async function handleLinkAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!linkingMemberId || !linkEmail.trim()) return;
    setLinkingInProgress(true);
    setLinkError('');
    try {
      const res = await fetch(`/api/campaigns/${params.id}/members/${linkingMemberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: linkEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'user_not_found') throw new Error('No account found with that email.');
        if (data.error === 'user_already_member') throw new Error('That user is already in this campaign.');
        throw new Error(data.error ?? 'Failed to link account');
      }
      setLinkingMemberId(null);
      setLinkEmail('');
      load();
    } catch (e: any) {
      setLinkError(e.message);
    } finally {
      setLinkingInProgress(false);
    }
  }

  async function handleSaveGuestCharName(memberId: string) {
    await fetch(`/api/campaigns/${params.id}/members/${memberId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guestCharacterName: editingCharNameValue.trim() || null }),
    });
    setEditingCharNameId(null);
    load();
  }

  async function handleRemoveMember(memberId: string) {
    if (!confirm('Remove this member from the campaign?')) return;
    await fetch(`/api/campaigns/${params.id}/members/${memberId}`, { method: 'DELETE' });
    load();
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 16px', textAlign: 'center', color: 'var(--border)', fontStyle: 'italic' }}>
        Loading campaign…
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 16px', textAlign: 'center', color: 'var(--red)' }}>
        {error || 'Campaign not found.'}
      </div>
    );
  }

  const dm = campaign.members.find(m => m.role === 'DM');
  const players = campaign.members.filter(m => m.role === 'PLAYER');

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Link href="/campaigns" style={{ fontSize: 12, color: 'var(--border)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
          ← All Campaigns
        </Link>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: 'var(--ink)', margin: 0, letterSpacing: 1 }}>
              {campaign.name}
            </h1>
            {campaign.description && (
              <p style={{ margin: '4px 0 0', color: 'var(--ink-light)', fontStyle: 'italic', fontSize: 14 }}>
                {campaign.description}
              </p>
            )}
            <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 12, color: 'var(--border)' }}>
              {dm && <span>DM: <strong style={{ color: 'var(--ink)' }}>{memberDisplayName(dm)}</strong></span>}
              <span>{players.length} player{players.length !== 1 ? 's' : ''}</span>
              <span>{campaign._count.sessions} session{campaign._count.sessions !== 1 ? 's' : ''}</span>
            </div>
          </div>
          <button
            className="ink-btn"
            onClick={() => { setShowNewSession(v => !v); setActiveTab('sessions'); }}
          >
            {showNewSession ? 'Cancel' : '+ New Session'}
          </button>
        </div>
      </div>

      {/* New Session Form */}
      {showNewSession && (
        <div
          style={{
            background: 'var(--parchment)',
            border: '2px solid var(--gold)',
            borderRadius: 8,
            padding: 20,
            marginBottom: 24,
          }}
        >
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 14, letterSpacing: 0.5 }}>
            ✦ New Session Log
          </div>
          <form onSubmit={handleNewSession} style={{ maxWidth: '100%' }}>
            <div style={{ marginBottom: 12 }}>
              <div className="field-label">Session Title (optional)</div>
              <input
                style={{ width: '100%', border: '1px solid var(--border-light)', borderRadius: 3, padding: '6px 8px', fontFamily: 'var(--font-body)', fontSize: 14 }}
                value={sessionTitle}
                onChange={e => setSessionTitle(e.target.value)}
                placeholder="e.g. The Lost Tomb of Arveth"
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <div className="field-label">Session Transcript (optional)</div>
              <div style={{ fontSize: 11, color: 'var(--border)', marginBottom: 6, fontStyle: 'italic' }}>
                Paste notes or a transcript now, or leave blank and record audio on the session page. Claude generates the log after you provide a transcript.
              </div>
              <textarea
                style={{
                  width: '100%',
                  border: '1px solid var(--border-light)',
                  borderRadius: 3,
                  padding: '8px',
                  fontFamily: 'var(--font-body)',
                  fontSize: 13,
                  resize: 'vertical',
                  minHeight: 120,
                  lineHeight: 1.6,
                }}
                value={transcript}
                onChange={e => setTranscript(e.target.value)}
                placeholder="Paste session notes, chat logs, bullet points… or leave blank to record audio instead."
              />
            </div>
            {submitError && (
              <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 10 }}>{submitError}</div>
            )}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button type="submit" className="ink-btn" disabled={submitting}>
                {submitting ? 'Saving…' : 'Create Session →'}
              </button>
              <span style={{ fontSize: 11, color: 'var(--border)', fontStyle: 'italic' }}>
                {transcript.trim() ? 'You can generate the log immediately on the next page' : 'You can record audio or paste a transcript on the next page'}
              </span>
            </div>
          </form>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1.5px solid var(--border-light)', marginBottom: 20, gap: 2 }}>
        {(['sessions', 'party', 'notes', 'settings'] as const).filter(t => t !== 'settings' || canManage).map(tab => (
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
              padding: '8px 16px',
              cursor: 'pointer',
              marginBottom: -1.5,
            }}
          >
            {tab === 'sessions' ? 'Sessions' : tab === 'party' ? 'Party' : tab === 'notes' ? 'Campaign Notes' : 'Settings'}
          </button>
        ))}
      </div>

      {/* Sessions tab */}
      {activeTab === 'sessions' && (
        <div>
          {campaign.sessions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--border)', fontStyle: 'italic', fontSize: 14 }}>
              No sessions yet. Click "+ New Session" to log your first session.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {campaign.sessions.map(s => {
                const hasOutput = !!s.generatedOutput;
                return (
                  <Link
                    key={s.id}
                    href={`/campaigns/${campaign.id}/sessions/${s.id}`}
                    style={{ textDecoration: 'none' }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        padding: '12px 16px',
                        background: 'var(--parchment)',
                        border: '1.5px solid var(--border-light)',
                        borderRadius: 5,
                        cursor: 'pointer',
                        transition: 'border-color 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--gold)')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-light)')}
                    >
                      <div
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontSize: 18,
                          fontWeight: 700,
                          color: 'var(--gold)',
                          minWidth: 36,
                          textAlign: 'center',
                        }}
                      >
                        #{s.sessionNumber}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--ink)', fontWeight: 600 }}>
                          {s.title ?? `Session ${s.sessionNumber}`}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--border)', marginTop: 2 }}>
                          {new Date(s.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: hasOutput ? '#2e7d32' : 'var(--border)', fontStyle: 'italic' }}>
                        {hasOutput ? '✓ Generated' : 'Pending generation'}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Party tab */}
      {activeTab === 'party' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            {/* DM card */}
            {dm && (
              <div className="panel" style={{ padding: 0 }}>
                <div className="panel-header">
                  <span>Dungeon Master</span>
                </div>
                <div className="panel-body">
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--ink)' }}>
                    {memberDisplayName(dm)}
                  </div>
                  {dm.user && (
                    <div style={{ fontSize: 11, color: 'var(--border)', marginTop: 2 }}>{dm.user.email}</div>
                  )}
                </div>
              </div>
            )}
            {players.map(m => {
              const classStr = m.character?.classes.map(c => c.classKey).join('/') ?? '';
              const isGuest = !m.userId;
              const isMe = !isGuest && m.user?.id === membership?.userId;
              const isLinking = linkingMemberId === m.id;
              return (
                <div key={m.id} className="panel" style={{ padding: 0 }}>
                  <div className="panel-header" style={{ justifyContent: 'space-between' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {memberDisplayName(m)}
                      {isGuest && (
                        <span style={{ fontSize: 9, background: 'var(--border-light)', color: 'var(--border)', borderRadius: 3, padding: '1px 5px', fontFamily: 'var(--font-body)', fontWeight: 'normal', letterSpacing: 0 }}>
                          guest
                        </span>
                      )}
                    </span>
                    {canManage && (
                      <button
                        className="ink-btn ghost"
                        style={{ fontSize: 9, padding: '1px 6px', border: 'none', color: 'rgba(201,162,39,0.5)' }}
                        onClick={() => handleRemoveMember(m.id)}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <div className="panel-body">
                    {isGuest ? (
                      <>
                        {/* Character name for transcript/AI matching */}
                        {editingCharNameId === m.id ? (
                          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                            <input
                              style={{ flex: 1, border: '1px solid var(--border-light)', borderRadius: 3, padding: '3px 6px', fontSize: 11 }}
                              placeholder="Character name"
                              value={editingCharNameValue}
                              onChange={e => setEditingCharNameValue(e.target.value)}
                              autoFocus
                              onKeyDown={e => {
                                if (e.key === 'Enter') { e.preventDefault(); handleSaveGuestCharName(m.id); }
                                if (e.key === 'Escape') setEditingCharNameId(null);
                              }}
                            />
                            <button className="ink-btn" style={{ fontSize: 10 }} onClick={() => handleSaveGuestCharName(m.id)}>Save</button>
                            <button className="ink-btn ghost" style={{ fontSize: 10 }} onClick={() => setEditingCharNameId(null)}>Cancel</button>
                          </div>
                        ) : (
                          <div
                            style={{ fontSize: 12, color: m.guestCharacterName ? 'var(--ink)' : 'var(--border)', marginBottom: 4, cursor: canManage ? 'pointer' : 'default' }}
                            onClick={() => { if (canManage) { setEditingCharNameId(m.id); setEditingCharNameValue(m.guestCharacterName ?? ''); } }}
                            title={canManage ? 'Click to set character name' : undefined}
                          >
                            {m.guestCharacterName
                              ? <span style={{ fontFamily: 'var(--font-display)' }}>{m.guestCharacterName}</span>
                              : <span style={{ fontStyle: 'italic' }}>{canManage ? 'Click to set character name' : 'No character set'}</span>
                            }
                          </div>
                        )}
                        <div className="empty-state" style={{ textAlign: 'left', padding: 0, fontSize: 11 }}>No account linked</div>
                        {canManage && !isLinking && (
                          <button
                            className="ink-btn ghost"
                            style={{ marginTop: 6, fontSize: 10 }}
                            onClick={() => { setLinkingMemberId(m.id); setLinkEmail(''); setLinkError(''); }}
                          >
                            Link Account
                          </button>
                        )}
                        {canManage && isLinking && (
                          <form onSubmit={handleLinkAccount} style={{ marginTop: 8 }}>
                            <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                              <input
                                style={{ flex: 1, border: '1px solid var(--border-light)', borderRadius: 3, padding: '3px 6px', fontSize: 11 }}
                                type="email"
                                placeholder="player@email.com"
                                value={linkEmail}
                                onChange={e => setLinkEmail(e.target.value)}
                                autoFocus
                              />
                              <button type="submit" className="ink-btn" style={{ fontSize: 10 }} disabled={linkingInProgress}>
                                {linkingInProgress ? '…' : 'Link'}
                              </button>
                              <button
                                type="button"
                                className="ink-btn ghost"
                                style={{ fontSize: 10 }}
                                onClick={() => setLinkingMemberId(null)}
                              >
                                Cancel
                              </button>
                            </div>
                            {linkError && <div style={{ color: 'var(--red)', fontSize: 11 }}>{linkError}</div>}
                          </form>
                        )}
                      </>
                    ) : (
                      <>
                        {m.character ? (
                          <div>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--ink)' }}>
                              {m.character.name}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--border)', marginTop: 2 }}>
                              Level {m.character.level} {classStr}
                            </div>
                          </div>
                        ) : (
                          <div className="empty-state" style={{ textAlign: 'left', padding: 0 }}>No character linked</div>
                        )}
                        {/* Allow members to link their own character; DM/admin can link anyone's */}
                        {(isMe || canManage) && m.user && (
                          <select
                            style={{ marginTop: 8, width: '100%', fontSize: 11, padding: '3px 4px', border: '1px solid var(--border-light)', borderRadius: 3 }}
                            value={m.character?.id ?? ''}
                            onChange={e => handleAssignCharacter(m.id, e.target.value)}
                          >
                            <option value="">— link character —</option>
                            {m.user.characters.map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {canManage && (
            <div style={{ marginTop: 16 }}>
              {showAddMember ? (
                <form onSubmit={handleAddMember} style={{ maxWidth: 400, background: 'var(--parchment)', border: '1px solid var(--border-light)', borderRadius: 5, padding: 14 }}>
                  <div style={{ display: 'flex', gap: 0, marginBottom: 10, border: '1px solid var(--border-light)', borderRadius: 3, overflow: 'hidden', width: 'fit-content' }}>
                    {(['email', 'guest'] as const).map(mode => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => { setAddMemberMode(mode); setAddMemberError(''); }}
                        style={{
                          fontSize: 11,
                          padding: '4px 10px',
                          border: 'none',
                          background: addMemberMode === mode ? 'var(--gold)' : 'transparent',
                          color: addMemberMode === mode ? '#fff' : 'var(--ink)',
                          cursor: 'pointer',
                        }}
                      >
                        {mode === 'email' ? 'By Email' : 'Guest (no account)'}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    {addMemberMode === 'email' ? (
                      <input
                        style={{ flex: 1, border: '1px solid var(--border-light)', borderRadius: 3, padding: '5px 8px', fontSize: 13 }}
                        value={memberEmail}
                        onChange={e => setMemberEmail(e.target.value)}
                        placeholder="user@email.com"
                        type="email"
                        autoFocus
                      />
                    ) : (
                      <input
                        style={{ flex: 1, border: '1px solid var(--border-light)', borderRadius: 3, padding: '5px 8px', fontSize: 13 }}
                        value={memberGuestName}
                        onChange={e => setMemberGuestName(e.target.value)}
                        placeholder="Player name"
                        type="text"
                        autoFocus
                      />
                    )}
                    <select
                      style={{ border: '1px solid var(--border-light)', borderRadius: 3, fontSize: 12, padding: '5px' }}
                      value={memberRole}
                      onChange={e => setMemberRole(e.target.value as 'PLAYER' | 'DM')}
                    >
                      <option value="PLAYER">Player</option>
                      <option value="DM">DM</option>
                    </select>
                  </div>
                  {addMemberError && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>{addMemberError}</div>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="submit" className="ink-btn" style={{ fontSize: 11 }} disabled={addingMember}>
                      {addingMember ? 'Adding…' : 'Add'}
                    </button>
                    <button type="button" className="ink-btn ghost" style={{ fontSize: 11 }} onClick={() => setShowAddMember(false)}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button className="ink-btn ghost" style={{ fontSize: 11 }} onClick={() => setShowAddMember(true)}>
                  + Add Member
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Campaign Notes tab */}
      {activeTab === 'notes' && (
        <CampaignNotesTab campaign={campaign} isDM={canManage} onSaved={load} />
      )}

      {/* Settings tab (DM / admin only) */}
      {activeTab === 'settings' && canManage && (
        <CampaignSettings campaign={campaign} onSaved={load} />
      )}
    </div>
  );
}

function CampaignNotesTab({
  campaign, isDM, onSaved,
}: { campaign: Campaign; isDM: boolean; onSaved: () => void }) {
  const [notes, setNotes] = useState(campaign.notes ?? '');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep local state in sync if campaign reloads
  useEffect(() => { setNotes(campaign.notes ?? ''); }, [campaign.notes]);

  function handleChange(val: string) {
    setNotes(val);
    if (!isDM) return;
    setStatus('saving');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      await fetch(`/api/campaigns/${campaign.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: val }),
      });
      setStatus('saved');
      onSaved();
      setTimeout(() => setStatus('idle'), 2000);
    }, 1000);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--ink)', letterSpacing: 0.5 }}>
            Campaign Notes
          </div>
          <div style={{ fontSize: 12, color: 'var(--border)', fontStyle: 'italic', marginTop: 4, maxWidth: 560 }}>
            Use this space for NPC rosters, world context, recurring plot threads, house rules, and player character backgrounds.
            This context is fed to Claude when generating session logs — the more detail here, the better the output.
          </div>
        </div>
        <div style={{ fontSize: 11, color: status === 'saved' ? '#2e7d32' : 'var(--border)', fontStyle: 'italic', minWidth: 60, textAlign: 'right' }}>
          {status === 'saving' ? 'Saving…' : status === 'saved' ? '✓ Saved' : isDM ? 'Auto-saves' : ''}
        </div>
      </div>
      <textarea
        style={{
          width: '100%',
          minHeight: 420,
          border: '1.5px solid var(--border-light)',
          borderRadius: 4,
          padding: '12px 14px',
          fontFamily: 'var(--font-body)',
          fontSize: 14,
          lineHeight: 1.8,
          color: 'var(--ink)',
          background: 'var(--parchment)',
          resize: 'vertical',
        }}
        value={notes}
        onChange={e => handleChange(e.target.value)}
        readOnly={!isDM}
        placeholder={isDM
          ? `Examples of useful context:\n\n**NPCs**\n- Aldric the blacksmith: gruff dwarf, secretly a retired adventurer, knows more than he lets on\n- Queen Mira: politically savvy, suspects the party\n\n**World Context**\nThe Sunken Kingdom was swallowed by the sea 500 years ago. Artifacts occasionally wash ashore...\n\n**Party Backgrounds**\n- Leif (Nathanael): Firbolg druid, seeking his missing grove-mates\n- Rhonwyn (Laura): Half-elf wizard, studying ancient magic...`
          : 'Campaign notes are set by the DM.'}
      />
    </div>
  );
}

function CampaignSettings({ campaign, onSaved }: { campaign: Campaign; onSaved: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(campaign.name);
  const [description, setDescription] = useState(campaign.description ?? '');
  const [styleInstructions, setStyleInstructions] = useState(campaign.styleInstructions ?? '');
  const [styleStatus, setStyleStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const styleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function handleStyleChange(val: string) {
    setStyleInstructions(val);
    setStyleStatus('saving');
    if (styleTimerRef.current) clearTimeout(styleTimerRef.current);
    styleTimerRef.current = setTimeout(async () => {
      await fetch(`/api/campaigns/${campaign.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ styleInstructions: val }),
      });
      setStyleStatus('saved');
      onSaved();
      setTimeout(() => setStyleStatus('idle'), 2000);
    }, 1000);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch(`/api/campaigns/${campaign.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    });
    setSaving(false);
    onSaved();
  }

  async function handleDelete() {
    if (!confirm(`Delete campaign "${campaign.name}"? This will permanently delete all sessions. This cannot be undone.`)) return;
    setDeleting(true);
    await fetch(`/api/campaigns/${campaign.id}`, { method: 'DELETE' });
    router.replace('/campaigns');
  }

  return (
    <div style={{ maxWidth: 500 }}>
      <form onSubmit={handleSave} style={{ maxWidth: '100%', marginBottom: 32 }}>
        <div style={{ marginBottom: 12 }}>
          <div className="field-label">Campaign Name</div>
          <input
            style={{ width: '100%', border: '1px solid var(--border-light)', borderRadius: 3, padding: '6px 8px', fontSize: 14 }}
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <div className="field-label">Description</div>
          <textarea
            style={{ width: '100%', border: '1px solid var(--border-light)', borderRadius: 3, padding: '6px 8px', fontSize: 14, resize: 'vertical', minHeight: 72 }}
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </div>
        <button type="submit" className="ink-btn" disabled={saving || !name.trim()}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </form>

      <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: 24, marginBottom: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--ink)', letterSpacing: 0.5 }}>
              AI Style Instructions
            </div>
            <div style={{ fontSize: 12, color: 'var(--border)', fontStyle: 'italic', marginTop: 4, maxWidth: 480 }}>
              Tell Claude how to write the session log. Overrides the default bard voice. Leave blank to use the default.
            </div>
          </div>
          <div style={{ fontSize: 11, color: styleStatus === 'saved' ? '#2e7d32' : 'var(--border)', fontStyle: 'italic', minWidth: 60, textAlign: 'right' }}>
            {styleStatus === 'saving' ? 'Saving…' : styleStatus === 'saved' ? '✓ Saved' : 'Auto-saves'}
          </div>
        </div>
        <textarea
          style={{
            width: '100%',
            minHeight: 120,
            border: '1.5px solid var(--border-light)',
            borderRadius: 4,
            padding: '10px 12px',
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            lineHeight: 1.7,
            color: 'var(--ink)',
            background: 'var(--parchment)',
            resize: 'vertical',
          }}
          value={styleInstructions}
          onChange={e => handleStyleChange(e.target.value)}
          placeholder={`Examples:\n"Write in a casual, funny tone — we're a chaotic group and the log should reflect that."\n"Keep it concise, 2 paragraphs max for the summary."\n"Write in second person, addressing the party directly."`}
        />
      </div>

      <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: 24 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, color: 'var(--red)', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>
          Danger Zone
        </div>
        <button className="ink-btn danger" onClick={handleDelete} disabled={deleting}>
          {deleting ? 'Deleting…' : 'Delete Campaign'}
        </button>
      </div>
    </div>
  );
}

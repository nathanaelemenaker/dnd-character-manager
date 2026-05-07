'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface CampaignMember {
  id: string;
  role: 'DM' | 'PLAYER';
  user: { id: string; name: string | null; email: string };
  character: {
    id: string;
    name: string;
    level: number;
    portrait: string | null;
    classes: Array<{ classKey: string; level: number }>;
  } | null;
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
  members: CampaignMember[];
  sessions: SessionSummary[];
  _count: { sessions: number };
}

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [membership, setMembership] = useState<CampaignMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [activeTab, setActiveTab] = useState<'sessions' | 'party' | 'settings'>('sessions');

  // New session form
  const [showNewSession, setShowNewSession] = useState(false);
  const [sessionTitle, setSessionTitle] = useState('');
  const [transcript, setTranscript] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Add member form
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState<'PLAYER' | 'DM'>('PLAYER');
  const [addingMember, setAddingMember] = useState(false);
  const [addMemberError, setAddMemberError] = useState('');

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

  async function handleNewSession(e: React.FormEvent) {
    e.preventDefault();
    if (!transcript.trim()) return;
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
    if (!memberEmail.trim()) return;
    setAddingMember(true);
    setAddMemberError('');
    try {
      const res = await fetch(`/api/campaigns/${params.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: memberEmail.trim(), role: memberRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to add member');
      setMemberEmail('');
      setShowAddMember(false);
      load();
    } catch (e: any) {
      setAddMemberError(e.message === 'user_not_found' ? 'No user found with that email.' : e.message);
    } finally {
      setAddingMember(false);
    }
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
              {dm && <span>DM: <strong style={{ color: 'var(--ink)' }}>{dm.user.name ?? dm.user.email}</strong></span>}
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
              <div className="field-label">Raw Session Transcript *</div>
              <div style={{ fontSize: 11, color: 'var(--border)', marginBottom: 6, fontStyle: 'italic' }}>
                Paste your raw session notes or transcript. Claude will analyze and structure it into a summary, combat log, and party status.
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
                  minHeight: 200,
                  lineHeight: 1.6,
                }}
                value={transcript}
                onChange={e => setTranscript(e.target.value)}
                placeholder="Paste session notes, chat logs, bullet points, or free-form descriptions here. The more detail, the better the output..."
              />
            </div>
            {submitError && (
              <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 10 }}>{submitError}</div>
            )}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button type="submit" className="ink-btn" disabled={submitting || !transcript.trim()}>
                {submitting ? 'Saving…' : 'Save & Generate Log →'}
              </button>
              <span style={{ fontSize: 11, color: 'var(--border)', fontStyle: 'italic' }}>
                Claude will generate the structured log after saving
              </span>
            </div>
          </form>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1.5px solid var(--border-light)', marginBottom: 20, gap: 2 }}>
        {(['sessions', 'party', 'settings'] as const).filter(t => t !== 'settings' || isDM).map(tab => (
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
            {tab === 'sessions' ? 'Sessions' : tab === 'party' ? 'Party' : 'Settings'}
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
                    {dm.user.name ?? dm.user.email}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--border)', marginTop: 2 }}>{dm.user.email}</div>
                </div>
              </div>
            )}
            {players.map(m => {
              const classStr = m.character?.classes.map(c => c.classKey).join('/') ?? '';
              const isMe = m.user.id === membership?.user?.id;
              return (
                <div key={m.id} className="panel" style={{ padding: 0 }}>
                  <div className="panel-header" style={{ justifyContent: 'space-between' }}>
                    <span>{m.user.name ?? m.user.email}</span>
                    {isDM && (
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
                    {/* Allow members to link their own character; DM can link anyone's */}
                    {(isMe || isDM) && (
                      <select
                        style={{ marginTop: 8, width: '100%', fontSize: 11, padding: '3px 4px', border: '1px solid var(--border-light)', borderRadius: 3 }}
                        value={m.character?.id ?? ''}
                        onChange={e => handleAssignCharacter(m.id, e.target.value)}
                      >
                        <option value="">— link character —</option>
                        {myCharacters.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {isDM && (
            <div style={{ marginTop: 16 }}>
              {showAddMember ? (
                <form onSubmit={handleAddMember} style={{ maxWidth: 400, background: 'var(--parchment)', border: '1px solid var(--border-light)', borderRadius: 5, padding: 14 }}>
                  <div className="field-label" style={{ marginBottom: 6 }}>Add Member by Email</div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <input
                      style={{ flex: 1, border: '1px solid var(--border-light)', borderRadius: 3, padding: '5px 8px', fontSize: 13 }}
                      value={memberEmail}
                      onChange={e => setMemberEmail(e.target.value)}
                      placeholder="user@email.com"
                      type="email"
                      autoFocus
                    />
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

      {/* Settings tab (DM only) */}
      {activeTab === 'settings' && isDM && (
        <CampaignSettings campaign={campaign} onSaved={load} />
      )}
    </div>
  );
}

function CampaignSettings({ campaign, onSaved }: { campaign: Campaign; onSaved: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(campaign.name);
  const [description, setDescription] = useState(campaign.description ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

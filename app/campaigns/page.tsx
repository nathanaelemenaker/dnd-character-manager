'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface CampaignMember {
  id: string;
  role: 'DM' | 'PLAYER';
  user: { id: string; name: string | null; email: string };
  character: { id: string; name: string } | null;
}

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  members: CampaignMember[];
  _count: { sessions: number };
}

export default function CampaignsPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/campaigns');
      if (!res.ok) throw new Error('Failed to load campaigns');
      const data = await res.json();
      setCampaigns(data.campaigns);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() }),
      });
      if (!res.ok) throw new Error('Failed to create campaign');
      const campaign = await res.json();
      router.push(`/campaigns/${campaign.id}`);
    } catch (e: any) {
      setError(e.message);
      setCreating(false);
    }
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--ink)', margin: 0, letterSpacing: 1 }}>
            Campaigns
          </h1>
          <p style={{ color: 'var(--border)', fontStyle: 'italic', margin: '4px 0 0', fontSize: 14 }}>
            Session logs and party chronicles
          </p>
        </div>
        <button className="ink-btn" onClick={() => setShowCreate(v => !v)}>
          {showCreate ? 'Cancel' : '+ New Campaign'}
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={handleCreate}
          style={{
            background: 'var(--parchment)',
            border: '1.5px solid var(--gold)',
            borderRadius: 6,
            padding: 20,
            marginBottom: 24,
            maxWidth: '100%',
          }}
        >
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 12, letterSpacing: 0.5 }}>
            Create New Campaign
          </div>
          <div style={{ marginBottom: 12 }}>
            <div className="field-label">Campaign Name *</div>
            <input
              style={{ width: '100%', border: '1px solid var(--border-light)', borderRadius: 3, padding: '6px 8px', fontFamily: 'var(--font-body)', fontSize: 14 }}
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g. The Sunken Kingdom"
              autoFocus
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <div className="field-label">Description (optional)</div>
            <textarea
              style={{ width: '100%', border: '1px solid var(--border-light)', borderRadius: 3, padding: '6px 8px', fontFamily: 'var(--font-body)', fontSize: 14, resize: 'vertical', minHeight: 60 }}
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              placeholder="Brief description of the campaign setting or plot..."
            />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" className="ink-btn" disabled={creating || !newName.trim()}>
              {creating ? 'Creating…' : 'Create Campaign'}
            </button>
            <button type="button" className="ink-btn ghost" onClick={() => setShowCreate(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && (
        <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 16 }}>{error}</div>
      )}

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : campaigns.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '48px 24px',
            border: '1.5px dashed var(--border-light)',
            borderRadius: 8,
            color: 'var(--border)',
          }}
        >
          <div style={{ fontSize: 36, marginBottom: 12 }}>⚔️</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, marginBottom: 8 }}>No campaigns yet</div>
          <div style={{ fontSize: 13, fontStyle: 'italic' }}>Create a campaign to start logging your sessions.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {campaigns.map(c => {
            const dm = c.members.find(m => m.role === 'DM');
            const playerCount = c.members.filter(m => m.role === 'PLAYER').length;
            return (
              <Link
                key={c.id}
                href={`/campaigns/${c.id}`}
                style={{ textDecoration: 'none' }}
              >
                <div
                  className="panel"
                  style={{
                    padding: 0,
                    cursor: 'pointer',
                    transition: 'border-color 0.15s',
                    borderColor: 'var(--border-light)',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--gold)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-light)')}
                >
                  <div className="panel-header" style={{ justifyContent: 'space-between' }}>
                    <span>{c.name}</span>
                    <span style={{ fontSize: 10, opacity: 0.7, fontWeight: 400, letterSpacing: 0 }}>
                      {c._count.sessions} session{c._count.sessions !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="panel-body" style={{ padding: '12px 14px' }}>
                    {c.description && (
                      <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--ink-light)', fontStyle: 'italic', lineHeight: 1.5 }}>
                        {c.description}
                      </p>
                    )}
                    <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--border)' }}>
                      {dm && (
                        <span>DM: <strong style={{ color: 'var(--ink)' }}>{dm.user.name ?? dm.user.email}</strong></span>
                      )}
                      <span>{playerCount} player{playerCount !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

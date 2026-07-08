'use client';
// app/characters/CharacterListClient.tsx

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface CharacterSummary {
  id: string;
  name: string;
  level: number;
  race: string | null;
  hpCurrent: number;
  hpMax: number;
  ac: number;
  updatedAt: Date;
  classes: { classKey: string; subclassKey: string | null; level: number }[];
}

const CLASS_COLORS: Record<string, string> = {
  barbarian: '#c0392b', bard: '#8e44ad', cleric: '#f39c12',
  druid: '#27ae60', fighter: '#7f8c8d', monk: '#16a085',
  paladin: '#f1c40f', ranger: '#2ecc71', rogue: '#2c3e50',
  sorcerer: '#e74c3c', warlock: '#6c3483', wizard: '#2980b9',
};

function classColor(name: string) {
  return CLASS_COLORS[name.toLowerCase()] ?? 'var(--border)';
}

function timeAgo(date: Date) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function CharacterListClient({ characters }: { characters: CharacterSummary[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!res.ok) throw new Error('Failed to create');
      const data = await res.json();
      router.push(`/characters/${data.id}`);
    } catch {
      setError('Failed to create character. Please try again.');
      setCreating(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--parchment-dark)',
      fontFamily: 'var(--font-body)',
    }}>
      {/* Page header */}
      <div style={{
        background: 'var(--ink)',
        borderBottom: '3px solid var(--gold)',
        padding: '20px 16px 14px',
        textAlign: 'center',
      }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 4,
          color: 'var(--gold)',
          textTransform: 'uppercase',
          marginBottom: 4,
        }}>
          Your Adventurers
        </div>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 22,
          fontWeight: 700,
          color: 'var(--gold-light)',
          letterSpacing: 1,
        }}>
          Character Roster
        </div>
      </div>

      <div style={{ padding: '16px 12px', maxWidth: 600, margin: '0 auto' }}>

        {/* Create new character */}
        <div style={{
          background: 'var(--parchment)',
          border: '1.5px solid var(--gold)',
          borderRadius: 6,
          padding: '12px 14px',
          marginBottom: 16,
        }}>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 2,
            color: 'var(--gold)',
            textTransform: 'uppercase',
            marginBottom: 8,
          }}>
            Begin a New Adventure
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder="Character name…"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              style={{ flex: 1, padding: '8px 10px', border: '1.5px solid var(--border-light)', borderRadius: 3, background: 'var(--parchment)', color: 'var(--ink)', fontFamily: 'var(--font-body)', fontSize: 14 }}
              autoFocus
            />
            <button
              className="ink-btn"
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              style={{ fontSize: 13, padding: '7px 16px' }}
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
          </div>
          {error && (
            <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 6 }}>{error}</div>
          )}
        </div>

        {/* Character cards */}
        {characters.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '40px 20px',
            color: 'var(--border)',
            fontStyle: 'italic',
            fontSize: 14,
          }}>
            No characters yet. Create your first adventurer above.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {characters.map(c => {
              const hpPct = c.hpMax > 0 ? Math.min(100, (c.hpCurrent / c.hpMax) * 100) : 0;
              const hpColor = hpPct > 60 ? '#2e7d32' : hpPct > 30 ? '#f39c12' : 'var(--red)';
              const primaryClass = c.classes[0];
              const color = primaryClass ? classColor(primaryClass.classKey) : 'var(--border)';

              return (
                <div
                  key={c.id}
                  onClick={() => router.push(`/characters/${c.id}`)}
                  style={{
                    background: 'var(--parchment)',
                    border: '1.5px solid var(--border-light)',
                    borderLeft: `4px solid ${color}`,
                    borderRadius: 6,
                    padding: '12px 14px',
                    cursor: 'pointer',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--gold)';
                    (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-light)';
                    (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
                  }}
                >
                  {/* Name + last played */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 16,
                      fontWeight: 700,
                      color: 'var(--ink)',
                      letterSpacing: 0.5,
                    }}>
                      {c.name}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--border)', fontStyle: 'italic', flexShrink: 0, marginLeft: 8, marginTop: 2 }}>
                      {timeAgo(c.updatedAt)}
                    </div>
                  </div>

                  {/* Race + class line */}
                  <div style={{
                    fontSize: 12,
                    color: 'var(--ink-light)',
                    marginBottom: 8,
                  }}>
                    <span>Level {c.level}</span>
                    {c.race && <span> · {c.race}</span>}
                    {c.classes.length > 0 && (
                      <span> · {c.classes.map(cl => {
                        const label = cl.subclassKey ? `${cl.subclassKey} ${cl.classKey}` : cl.classKey;
                        return label.replace(/\b\w/g, l => l.toUpperCase());
                      }).join(' / ')}</span>
                    )}
                  </div>

                  {/* Stats row */}
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    {/* HP bar */}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--border)', marginBottom: 2 }}>
                        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>HP</span>
                        <span style={{ fontFamily: 'var(--font-display)', color: hpColor, fontWeight: 700 }}>{c.hpCurrent}/{c.hpMax}</span>
                      </div>
                      <div style={{ height: 4, background: 'var(--parchment-dark)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${hpPct}%`, height: '100%', background: hpColor, borderRadius: 2, transition: 'width 0.3s' }} />
                      </div>
                    </div>

                    {/* AC */}
                    <div style={{ textAlign: 'center', flexShrink: 0 }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--ink)', lineHeight: 1 }}>{c.ac}</div>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 8, fontWeight: 700, color: 'var(--border)', textTransform: 'uppercase', letterSpacing: 0.5 }}>AC</div>
                    </div>

                    {/* Arrow */}
                    <div style={{ color: 'var(--border)', fontSize: 16, flexShrink: 0 }}>›</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

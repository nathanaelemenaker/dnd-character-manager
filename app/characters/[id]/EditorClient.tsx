// app/characters/[id]/EditorClient.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Ruleset = 'SRD_2014' | 'SRD_2024';

export type CharacterLite = {
  id: string;
  name: string;
  level: number;
  ruleset: Ruleset;
};

export default function EditorClient({ initial }: { initial: CharacterLite }) {
  const router = useRouter();
  const [name, setName] = useState<string>(initial.name);
  const [ruleset, setRuleset] = useState<Ruleset>(initial.ruleset);
  const [level, setLevel] = useState<number>(initial.level);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    setOkMsg(null);
    try {
      const res = await fetch(`/api/characters/${initial.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ name, ruleset, level }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      setOkMsg('Saved.');
      // Revalidate server component data
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? 'save_failed');
    } finally {
      setSaving(false);
      setTimeout(() => setOkMsg(null), 1500);
    }
  }

  async function onDelete() {
    if (!confirm('Delete this character? This cannot be undone.')) return;
    setDeleting(true);
    setErr(null);
    try {
      const res = await fetch(`/api/characters/${initial.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok && res.status !== 204) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      // Go back to list
      router.push('/characters');
    } catch (e: any) {
      setErr(e?.message ?? 'delete_failed');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 6, padding: '0.75rem', display: 'grid', gap: '0.5rem' }}>
      <h3>Edit Character</h3>
      <form onSubmit={onSave} style={{ display: 'grid', gap: '0.5rem', maxWidth: 520 }}>
        <label style={{ display: 'grid', gap: 4 }}>
          <span>Name</span>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ padding: '0.4rem' }}
          />
        </label>

        <label style={{ display: 'grid', gap: 4 }}>
          <span>Ruleset</span>
          <select
            value={ruleset}
            onChange={(e) => setRuleset(e.target.value as Ruleset)}
            style={{ padding: '0.4rem', width: '12rem' }}
          >
            <option value="SRD_2014">SRD_2014</option>
            <option value="SRD_2024">SRD_2024</option>
          </select>
        </label>

        <label style={{ display: 'grid', gap: 4 }}>
          <span>Level</span>
          <input
            type="number"
            min={1}
            max={20}
            value={level}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) {
                const clamped = Math.max(1, Math.min(20, v));
                setLevel(clamped);
              }
            }}
            style={{ padding: '0.4rem', width: '6rem' }}
          />
        </label>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="submit" disabled={saving} style={{ padding: '0.5rem 0.8rem' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            style={{ padding: '0.5rem 0.8rem', background: '#fff0f0', border: '1px solid #ffcccc' }}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>

        {err && <div style={{ color: 'crimson' }}>Error: {err}</div>}
        {okMsg && <div style={{ color: 'seagreen' }}>{okMsg}</div>}
      </form>
    </div>
  );
}
// app/characters/[id]/AbilitiesClient.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';

type AbilityKey = 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';

type AbilitiesResponse = {
  abilities: Record<AbilityKey, number>;
  modifiers: Record<AbilityKey, number>;
};

function clampScore(n: number) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return 10;
  return Math.max(1, Math.min(30, v));
}

function abilityOrder(): AbilityKey[] {
  return ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
}

export default function AbilitiesClient({ characterId }: { characterId: string }) {
  const [data, setData] = useState<AbilitiesResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string | null>(null);
  const [dirty, setDirty] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  // Local editable state
  const [scores, setScores] = useState<Record<AbilityKey, number>>({
    STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10,
  });

  const mods = useMemo(() => {
    const out = {} as Record<AbilityKey, number>;
    (Object.keys(scores) as AbilityKey[]).forEach((k) => {
      out[k] = Math.floor((scores[k] - 10) / 2);
    });
    return out;
  }, [scores]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/characters/${characterId}/abilities`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Accept': 'application/json' },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      const j = (await res.json()) as AbilitiesResponse;
      setData(j);
      setScores(j.abilities);
      setDirty(false);
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to load abilities');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId]);

  async function onSave() {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/characters/${characterId}/abilities`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ abilities: scores }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      const j = (await res.json()) as AbilitiesResponse;
      setData(j);
      setScores(j.abilities);
      setDirty(false);
    } catch (e: any) {
      setErr(e?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: '0.5rem' }}>
      <h3>Abilities</h3>

      {loading && <div>Loading…</div>}
      {err && <div style={{ color: 'crimson' }}>Error: {err}</div>}

      {!loading && !err && (
        <div style={{ display: 'grid', gap: '0.5rem', maxWidth: 600 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.5rem' }}>
            {abilityOrder().map((k) => (
              <div key={k} style={{ border: '1px solid #eee', borderRadius: 6, padding: '0.5rem' }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>{k}</div>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={scores[k]}
                  onChange={(e) => {
                    const v = clampScore(e.target.value as unknown as number);
                    setScores((prev) => ({ ...prev, [k]: v }));
                    setDirty(true);
                  }}
                  style={{ width: '100%', padding: '0.4rem' }}
                />
                <div style={{ marginTop: 6, fontSize: 12, color: '#555' }}>
                  Mod: {mods[k] >= 0 ? `+${mods[k]}` : mods[k]}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={onSave} disabled={!dirty || saving} style={{ padding: '0.5rem 0.8rem' }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => {
                if (!data) return;
                setScores(data.abilities);
                setDirty(false);
              }}
              disabled={!dirty}
              style={{ padding: '0.5rem 0.8rem' }}
            >
              Revert
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
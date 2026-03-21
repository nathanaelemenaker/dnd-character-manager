// app/characters/[id]/DerivedStatsClient.tsx
'use client';

import { useEffect, useState } from 'react';

type DerivedResponse = {
  abilityScores: {
    STR: number; DEX: number; CON: number; INT: number; WIS: number; CHA: number;
    dexMod: number;
  };
  equipment: {
    equippedCount: number;
    equippedWeight: number;
  };
  defense: {
    armorAC: number;       // AC from armor rules (base + capped Dex + armor bonus)
    shieldBonus: number;   // shield AC bonus
    extraAcBonus: number;  // other flat AC bonuses (rings/cloaks/etc.)
    totalAC: number;       // armorAC + shieldBonus + extraAcBonus
  };
};

export default function DerivedStatsClient({ characterId }: { characterId: string }) {
  const [data, setData] = useState<DerivedResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/characters/${characterId}/derived`, {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        throw new Error(j?.error ?? `HTTP ${r.status}`);
      }
      const j = (await r.json()) as DerivedResponse;
      setData(j);
    } catch (e: any) {
      setErr(e?.message ?? 'load_failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    const onInv = () => load();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('inventory:saved', onInv);
    window.addEventListener('inventory:changed', onInv);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('inventory:saved', onInv);
      window.removeEventListener('inventory:changed', onInv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId]);

  return (
    <div style={{
      border: '1px solid #e5e5e5',
      borderRadius: 8,
      padding: '0.75rem',
      display: 'grid',
      gap: '0.5rem',
      maxWidth: 520
    }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Derived Stats</h3>
        <button
          onClick={load}
          disabled={loading}
          style={{ marginLeft: 'auto', padding: '0.35rem 0.6rem' }}
          title="Refresh"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {err && <div style={{ color: 'crimson' }}>Error: {err}</div>}

      {!err && data && (
        <div style={{ display: 'grid', gap: '0.35rem' }}>
          <div style={{ fontSize: 16 }}>
            <strong>AC:</strong>{' '}
            {data.defense.totalAC}
            <span style={{ color: '#666', fontSize: 12, marginLeft: 6 }}>
              (Armor {data.defense.armorAC}
              {data.defense.shieldBonus ? ` + Shield ${data.defense.shieldBonus}` : ''}
              {data.defense.extraAcBonus ? ` + Bonus ${data.defense.extraAcBonus}` : ''}
              )
            </span>
          </div>

          <div style={{ fontSize: 16 }}>
            <strong>Equipped weight:</strong>{' '}
            {data.equipment.equippedWeight.toFixed(2)} lb
            <span style={{ color: '#666', fontSize: 12, marginLeft: 6 }}>
              ({data.equipment.equippedCount} item{data.equipment.equippedCount === 1 ? '' : 's'} equipped)
            </span>
          </div>

          <div style={{ fontSize: 12, color: '#666' }}>
            DEX mod: {data.abilityScores.dexMod >= 0 ? `+${data.abilityScores.dexMod}` : data.abilityScores.dexMod}
          </div>
        </div>
      )}

      {!err && !data && !loading && <div>No data.</div>}
    </div>
  );
}
// app/characters/[id]/InventoryClient.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';

type Ruleset = 'SRD_2014' | 'SRD_2024';

type ItemDef = {
  id: string;
  srdKey: string | null;
  name: string;
  type: string | null;
  weight: number | null;
  rarity: string | null;
  requiresAttunement: boolean | null;
  text?: string | null;
  sourceAttribution?: string | null;
};

type InventoryItem = {
  id: string;
  quantity: number;
  attuned: boolean;
  notes: string | null;
  containerId: string | null;
  itemDef: ItemDef;
  equipped?: boolean; // optional in payload
};

type ListResponse = {
  page: number;
  pageSize: number;
  total: number;
  items: InventoryItem[];
};

type SearchResult = {
  page: number;
  pageSize: number;
  total: number;
  items: (ItemDef & { ruleset: Ruleset })[];
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

// Normalize type -> key
function toKey(s: string | null | undefined) {
  const v = (s ?? '').trim().toLowerCase();
  if (!v) return null;
  return v.replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '');
}

// Image thumbnail with resilient fallbacks
function ItemThumb({ srdKey, type, alt }: { srdKey: string | null; type: string | null; alt: string }) {
  const typeKey = toKey(type);
  const chain: string[] = [];

  if (srdKey) {
    chain.push(`/item-images/${srdKey}.webp`, `/item-images/${srdKey}.png`);
  }
  if (typeKey) {
    chain.push(`/item-images/_types/${typeKey}.webp`, `/item-images/_types/${typeKey}.png`);
  }
  chain.push(`/item-images/_generic.webp`, `/item-images/_generic.png`);

  const [idx, setIdx] = useState(0);
  const src = chain[idx] ?? `/item-images/_generic.webp`;

  return (
    <img
      src={src}
      alt={alt}
      width={56}
      height={56}
      style={{ borderRadius: 6, objectFit: 'cover', background: '#fafafa', border: '1px solid #eee' }}
      onError={() => setIdx((i) => (i + 1 < chain.length ? i + 1 : i))}
    />
  );
}

function TextWithToggle({ text, initialLimit = 400 }: { text: string; initialLimit?: number }) {
  const [expanded, setExpanded] = useState(false);
  if (text.length <= initialLimit) return <div style={{ whiteSpace: 'pre-wrap' }}>{text}</div>;
  const shown = expanded ? text : text.slice(0, initialLimit) + '…';
  return (
    <div style={{ whiteSpace: 'pre-wrap' }}>
      {shown}{' '}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{ padding: 0, margin: 0, border: 'none', background: 'transparent', color: '#0066cc' }}
      >
        {expanded ? 'Show less' : 'Show more'}
      </button>
    </div>
  );
}

export default function InventoryClient({
  characterId,
  ruleset,
}: {
  characterId: string;
  ruleset: Ruleset;
}) {
  // Listing state
  const [page, setPage] = useState<number>(1);
  const [pageSize] = useState<number>(20);
  const [q, setQ] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<ListResponse | null>(null);

  // Add form state (search)
  const [searchQ, setSearchQ] = useState<string>('');
  const [searching, setSearching] = useState<boolean>(false);
  const [results, setResults] = useState<SearchResult | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      if (q.trim()) params.set('q', q.trim());

      const res = await fetch(`/api/characters/${characterId}/inventory?` + params.toString(), {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      const j = (await res.json()) as ListResponse;
      setData(j);
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to load inventory');
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // Auto-refresh when other components broadcast inventory changes (e.g., equip)
    function onSaved() { load(); }
    window.addEventListener('inventory:saved', onSaved);
    window.addEventListener('inventory:changed', onSaved);
    return () => {
      window.removeEventListener('inventory:saved', onSaved);
      window.removeEventListener('inventory:changed', onSaved);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, q, characterId]);

  const totalWeight = useMemo(() => {
    if (!data) return 0;
    return data.items.reduce((sum, it) => {
      const w = typeof it.itemDef.weight === 'number' ? it.itemDef.weight : 0;
      return sum + w * it.quantity;
    }, 0);
  }, [data]);

  async function onSearch() {
    setSearching(true);
    try {
      const params = new URLSearchParams();
      params.set('q', searchQ.trim());
      params.set('ruleset', ruleset);
      params.set('page', '1');
      params.set('pageSize', '10');

      const res = await fetch('/api/items/search?' + params.toString(), {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      const j = (await res.json()) as SearchResult;
      setResults(j);
    } catch (e) {
      setResults(null);
    } finally {
      setSearching(false);
    }
  }

  async function addItem(itemDefId: string) {
    setAddingId(itemDefId);
    try {
      const res = await fetch(`/api/characters/${characterId}/inventory`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ itemDefId, quantity: 1 }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      await load();
      window.dispatchEvent(new CustomEvent('inventory:changed'));
    } catch (e: any) {
      alert('Add failed: ' + (e?.message ?? 'unknown'));
    } finally {
      setAddingId(null);
    }
  }

  async function saveItem(it: InventoryItem) {
    try {
      const res = await fetch(`/api/characters/${characterId}/inventory/${it.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          quantity: clamp(it.quantity, 1, 999),
          attuned: it.attuned,
          equipped: it.equipped ?? false,
          notes: it.notes ?? null,
          containerId: it.containerId ?? null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      await load();
      window.dispatchEvent(new CustomEvent('inventory:saved'));
    } catch (e: any) {
      alert('Save failed: ' + (e?.message ?? 'unknown'));
    }
  }

  async function deleteItem(id: string) {
    if (!confirm('Remove this item?')) return;
    try {
      const res = await fetch(`/api/characters/${characterId}/inventory/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok && res.status !== 204) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      await load();
      window.dispatchEvent(new CustomEvent('inventory:changed'));
    } catch (e: any) {
      alert('Delete failed: ' + (e?.message ?? 'unknown'));
    }
  }

  return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      {/* Filter & total */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search inventory (name/type/key)…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          style={{ padding: '0.4rem', minWidth: 260 }}
        />
        <div style={{ marginLeft: 'auto', fontSize: 12, color: '#555' }}>
          Total weight: {totalWeight.toFixed(2)} lb
        </div>
      </div>

      {/* Add form */}
      <div style={{ border: '1px solid #eee', borderRadius: 6, padding: '0.5rem', display: 'grid', gap: '0.5rem' }}>
        <div style={{ fontWeight: 600 }}>Add Item</div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search SRD items (by name/type/key)…"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            style={{ padding: '0.4rem', minWidth: 260 }}
          />
          <button onClick={onSearch} disabled={searching} style={{ padding: '0.4rem 0.6rem' }}>
            {searching ? 'Searching…' : 'Search'}
          </button>
        </div>
        {results && results.items.length > 0 && (
          <ul style={{ listStyle: 'none', paddingLeft: 0, display: 'grid', gap: '0.4rem', maxHeight: 240, overflowY: 'auto' }}>
            {results.items.map((d) => (
              <li key={d.id} style={{ border: '1px solid #ddd', borderRadius: 6, padding: '0.5rem' }}>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                  <ItemThumb srdKey={d.srdKey} type={d.type} alt={d.name} />
                  <div style={{ display: 'grid', gap: 4, flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{d.name}</div>
                    <div style={{ fontSize: 12, color: '#666' }}>
                      {d.type ?? '—'} · {typeof d.weight === 'number' ? `${d.weight} lb` : '—'} · {d.rarity ?? '—'}
                    </div>
                    {d.text && <div style={{ fontSize: 13, color: '#333' }}><TextWithToggle text={d.text} /></div>}
                  </div>
                  <div>
                    <button
                      onClick={() => addItem(d.id)}
                      disabled={addingId === d.id}
                      style={{ padding: '0.3rem 0.6rem' }}
                    >
                      {addingId === d.id ? 'Adding…' : 'Add'}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {results && results.items.length === 0 && <div style={{ fontSize: 12, color: '#666' }}>No matches.</div>}
      </div>

      {/* List */}
      {loading && <div>Loading…</div>}
      {err && <div style={{ color: 'crimson' }}>Error: {err}</div>}

      {!loading && !err && data && data.items.length === 0 && <div>No inventory yet.</div>}

      {!loading && !err && data && data.items.length > 0 && (
        <div style={{ display: 'grid', gap: '0.6rem' }}>
          {data.items.map((it) => (
            <div key={it.id} style={{ border: '1px solid #ddd', borderRadius: 6, padding: '0.6rem', display: 'grid', gap: '0.5rem' }}>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                <ItemThumb srdKey={it.itemDef.srdKey} type={it.itemDef.type} alt={it.itemDef.name} />
                <div style={{ display: 'grid', gap: 4, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <div style={{ fontWeight: 600 }}>{it.itemDef.name}</div>
                    {String(it.itemDef.sourceAttribution || '').toLowerCase() === 'custom' && (
                      <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 999, background: '#f0f8ff', color: '#0b63ce', border: '1px solid #d5e9ff' }}>
                        Custom
                      </span>
                    )}
                    <div style={{ fontSize: 12, color: '#666' }}>
                      {it.itemDef.type ?? '—'} · {typeof it.itemDef.weight === 'number' ? `${it.itemDef.weight} lb` : '—'} · {it.itemDef.rarity ?? '—'}
                      {it.itemDef.requiresAttunement ? ' · Requires attunement' : ''}
                    </div>
                  </div>

                  {/* Description */}
                  {it.itemDef.text && (
                    <div style={{ fontSize: 13, color: '#333' }}>
                      <TextWithToggle text={it.itemDef.text} />
                    </div>
                  )}

                  {/* Source link */}
                  {it.itemDef.srdKey && (
                    <div style={{ fontSize: 12 }}>
                      <a
                        href={
                          ruleset === 'SRD_2014'
                            ? `https://www.dnd5eapi.co/api/equipment/${it.itemDef.srdKey}`
                            : `https://open5e.com/search/?text=${encodeURIComponent(it.itemDef.name)}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Source
                      </a>
                    </div>
                  )}
                </div>

                {/* Delete */}
                <div>
                  <button
                    onClick={() => deleteItem(it.id)}
                    style={{ padding: '0.3rem 0.6rem', background: '#fff0f0', border: '1px solid #ffcccc' }}
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Inline edit row */}
              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span>Qty</span>
                  <input
                    type="number"
                    min={1}
                    max={999}
                    value={it.quantity}
                    onChange={(e) => {
                      const v = clamp(Number(e.target.value), 1, 999);
                      it.quantity = v;
                      setData((prev) => (prev ? { ...prev, items: prev.items.map((x) => (x.id === it.id ? { ...it } : x)) } : prev));
                    }}
                    style={{ width: '5rem', padding: '0.3rem' }}
                  />
                </label>

                <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={it.attuned}
                    onChange={(e) => {
                      it.attuned = e.target.checked;
                      setData((prev) => (prev ? { ...prev, items: prev.items.map((x) => (x.id === it.id ? { ...it } : x)) } : prev));
                    }}
                  />
                  <span>Attuned</span>
                </label>

                {/* NEW Equipped toggle */}
                <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={it.equipped ?? false}
                    onChange={(e) => {
                      it.equipped = e.target.checked;
                      setData((prev) => (prev ? { ...prev, items: prev.items.map((x) => (x.id === it.id ? { ...it } : x)) } : prev));
                    }}
                  />
                  <span>Equipped</span>
                </label>

                <label style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1 }}>
                  <span>Notes</span>
                  <input
                    type="text"
                    value={it.notes ?? ''}
                    onChange={(e) => {
                      it.notes = e.target.value;
                      setData((prev) => (prev ? { ...prev, items: prev.items.map((x) => (x.id === it.id ? { ...it } : x)) } : prev));
                    }}
                    style={{ padding: '0.3rem', flex: 1, minWidth: 240 }}
                  />
                </label>

                <button onClick={() => saveItem(it)} style={{ padding: '0.4rem 0.6rem' }}>
                  Save
                </button>
              </div>
            </div>
          ))}

          {/* Pagination */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              style={{ padding: '0.4rem 0.6rem' }}
            >
              Prev
            </button>
            <span>
              Page {data.page} of {Math.max(1, Math.ceil(data.total / data.pageSize))}
            </span>
            <button
              onClick={() =>
                setPage((p) => {
                  const last = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 20)));
                  return Math.min(last, p + 1);
                })
              }
              disabled={page * (data?.pageSize ?? 20) >= (data?.total ?? 0)}
              style={{ padding: '0.4rem 0.6rem' }}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
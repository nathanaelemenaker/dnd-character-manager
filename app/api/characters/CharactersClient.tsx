// app/characters/CharactersClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type Ruleset = 'SRD_2014' | 'SRD_2024';

type CharacterListItem = {
  id: string;
  name: string;
  level: number;
  ruleset: Ruleset;
  createdAt: string;
  updatedAt: string;
};

type ListResponse = {
  page: number;
  pageSize: number;
  total: number;
  items: CharacterListItem[];
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function CharactersClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const page = useMemo(() => {
    const p = Number.parseInt(searchParams.get('page') ?? '1', 10);
    return Number.isFinite(p) && p > 0 ? p : 1;
  }, [searchParams]);

  const pageSize = useMemo(() => {
    const ps = Number.parseInt(searchParams.get('pageSize') ?? '20', 10);
    let n = Number.isFinite(ps) && ps > 0 ? ps : 20;
    n = clamp(n, 1, 100);
    return n;
  }, [searchParams]);

  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState<string>('');
  const [ruleset, setRuleset] = useState<Ruleset>('SRD_2014');
  const [level, setLevel] = useState<number>(1);
  const [creating, setCreating] = useState<boolean>(false);

  async function fetchList(p: number, ps: number) {
    setLoading(true);
    setErr(null);
    try {
      const url = `/api/characters?page=${p}&pageSize=${ps}`;
      const res = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Accept': 'application/json' },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      const j = (await res.json()) as ListResponse;
      setData(j);
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to load');
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchList(page, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  function updateQuery(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(nextPage));
    params.set('pageSize', String(pageSize));
    router.push(`${pathname}?${params.toString()}`);
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      alert('Name is required.');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/characters', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          ruleset,
          level: clamp(level, 1, 20),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      const created = (await res.json()) as CharacterListItem;

      // Optimistically prepend
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          total: prev.total + 1,
          items: [created, ...prev.items],
        };
      });

      // Re-fetch to stay consistent with pagination & ordering
      await fetchList(page, pageSize);

      // Reset form
      setName('');
      setRuleset('SRD_2014');
      setLevel(1);
    } catch (e: any) {
      alert(`Create failed: ${e?.message ?? 'unknown_error'}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <h1>Characters</h1>

      <form onSubmit={onCreate} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Name *"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          style={{ padding: '0.4rem' }}
        />
        <select value={ruleset} onChange={(e) => setRuleset(e.target.value as Ruleset)} style={{ padding: '0.4rem' }}>
          <option value="SRD_2014">SRD_2014</option>
          <option value="SRD_2024">SRD_2024</option>
        </select>
        <input
          type="number"
          min={1}
          max={20}
          value={level}
          onChange={(e) => setLevel(clamp(Number(e.target.value), 1, 20))}
          style={{ width: '5rem', padding: '0.4rem' }}
        />
        <button type="submit" disabled={creating} style={{ padding: '0.5rem 0.8rem' }}>
          {creating ? 'Creating…' : 'Create'}
        </button>
      </form>

      {loading && <div>Loading…</div>}
      {err && <div style={{ color: 'crimson' }}>Error: {err}</div>}

      {!loading && !err && data && data.total === 0 && <div>No characters yet.</div>}

      {!loading && !err && data && data.items.length > 0 && (
        <ul style={{ listStyle: 'none', paddingLeft: 0, display: 'grid', gap: '0.5rem' }}>
          {data.items.map((c) => (
            <li key={c.id} style={{ border: '1px solid #ddd', borderRadius: 6, padding: '0.5rem 0.75rem' }}>
              <Link href={`/characters/${c.id}`} style={{ textDecoration: 'none' }}>
                <div style={{ fontWeight: 600 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: '#666' }}>
                  Level {c.level} · {c.ruleset} · Updated {new Date(c.updatedAt).toLocaleString()}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!loading && !err && data && (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            onClick={() => updateQuery(Math.max(1, page - 1))}
            disabled={page <= 1}
            style={{ padding: '0.4rem 0.6rem' }}
          >
            Prev
          </button>
          <span>
            Page {data.page} — {data.total} total
          </span>
          <button
            onClick={() => {
              const lastPage = Math.max(1, Math.ceil(data.total / data.pageSize));
              const next = Math.min(lastPage, page + 1);
              updateQuery(next);
            }}
            disabled={page * data.pageSize >= data.total}
            style={{ padding: '0.4rem 0.6rem' }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
``
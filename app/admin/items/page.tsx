// app/admin/items/page.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type Ruleset = 'SRD_2014' | 'SRD_2024';
type ItemDef = {
  id: string; ruleset: Ruleset; srdKey: string; name: string; type: string;
  weight: number | null; rarity: string | null; requiresAttunement: boolean | null;
  text: string | null; sourceAttribution: string; modifiers: any | null;
};

type ListResp = { page: number; pageSize: number; total: number; items: ItemDef[]; };

async function postJsonOrText(url: string) {
  const r = await fetch(url, { method: 'POST', credentials: 'include' });
  const ctype = r.headers.get('content-type') || '';
  const body = ctype.includes('application/json') ? await r.json().catch(()=>null) : await r.text().catch(()=>null);
  return { ok: r.ok, status: r.status, contentType: ctype, body };
}

function computeAcPreview(modifiers: any, dexMod: number) {
  if (!modifiers || typeof modifiers !== 'object') {
    return { armorAC: 10 + dexMod, shieldBonus: 0, extraAcBonus: 0, totalAC: 10 + dexMod };
  }
  let ac = 10 + dexMod;
  let shieldBonus = 0;
  let extraAcBonus = 0;

  if (typeof modifiers.acBase === 'number') {
    const maxDex = (typeof modifiers.maxDex === 'number') ? modifiers.maxDex : 10;
    const dexPart = Math.min(dexMod, maxDex);
    const base = modifiers.acBase + dexPart + (modifiers.acBonus ?? 0);
    ac = Math.max(ac, Math.floor(base));
  }
  if (typeof modifiers.shieldBonus === 'number') {
    shieldBonus = Math.floor(modifiers.shieldBonus);
  }
  if (typeof modifiers.acBonus === 'number' && modifiers.acBase === undefined) {
    extraAcBonus += Math.floor(modifiers.acBonus);
  }
  return { armorAC: ac, shieldBonus, extraAcBonus, totalAC: ac + shieldBonus + extraAcBonus };
}

function normalizeKey(s: string) {
  return (s ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '');
}

export default function AdminItemsPage() {
  // Query state
  const [q, setQ] = useState('');
  const [ruleset, setRuleset] = useState<''|Ruleset>('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);

  // List data
  const [data, setData] = useState<ListResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string|null>(null);

  // Add form state
  const [addOpen, setAddOpen] = useState<boolean>(true);
  const [form, setForm] = useState({
    ruleset: 'SRD_2014' as Ruleset,
    name: '',
    type: '',
    srdKey: '',
    weight: '',
    rarity: '',
    requiresAttunement: false,
    sourceAttribution: 'Custom',
    text: '',
    modifiers: '{\n  \n}',
  });

  // srdKey preflight
  const [keyStatus, setKeyStatus] = useState<null | { key: string; exists: boolean }>(null);
  const keyTimer = useRef<any>(null);
  function scheduleKeyCheck(nextKey: string) {
    if (keyTimer.current) clearTimeout(keyTimer.current);
    const key = normalizeKey(nextKey || form.name);
    if (!key) { setKeyStatus(null); return; }
    keyTimer.current = setTimeout(async () => {
      const r = await fetch(`/api/admin/items/check-srdkey?key=${encodeURIComponent(key)}`, { credentials: 'include' });
      const j = await r.json().catch(()=>null);
      if (typeof j?.exists === 'boolean') setKeyStatus({ key, exists: j.exists });
      else setKeyStatus(null);
    }, 300);
  }

  // Modifiers preview
  const [dexPreview, setDexPreview] = useState<number>(2);
  const modifiersPreview = (() => {
    try {
      const obj = JSON.parse(form.modifiers || '{}');
      return computeAcPreview(obj, dexPreview);
    } catch { return computeAcPreview(null, dexPreview); }
  })();

  // Bulk import
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState<'json'|'csv'>('json');
  const [bulkText, setBulkText] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  // URLs with current filters
  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set('page', String(page)); p.set('pageSize', String(pageSize));
    if (q.trim()) p.set('q', q.trim()); if (ruleset) p.set('ruleset', ruleset);
    return p.toString();
  }, [q, ruleset, page, pageSize]);
  const exportBase = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (ruleset) p.set('ruleset', ruleset);
    const qs = p.toString();
    return {
      json: `/api/admin/items/export/json${qs ? `?${qs}` : ''}`,
      csv: `/api/admin/items/export/csv${qs ? `?${qs}` : ''}`,
    };
  }, [q, ruleset]);

  async function load() {
    setLoading(true); setErr(null);
    try {
      const r = await fetch(`/api/admin/items?${params}`, { credentials: 'include' });
      if (!r.ok) throw new Error((await r.json().catch(()=>null))?.error ?? `HTTP ${r.status}`);
      setData(await r.json());
    } catch (e:any) { setErr(e?.message ?? 'load_failed'); } finally { setLoading(false); }
  }
  useEffect(()=>{ load(); /* eslint-disable-next-line */}, [params]);

  async function save(item: Partial<ItemDef> & { id: string }) {
    try {
      const r = await fetch('/api/admin/items', {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify(item),
      });
      if (!r.ok) throw new Error((await r.json().catch(()=>null))?.error ?? `HTTP ${r.status}`);
      await load();
    } catch (e:any) { alert('Save failed: ' + (e?.message ?? 'unknown')); }
  }

  async function del(id: string) {
    if (!confirm('Delete this item from the catalog? This will NOT alter existing character inventories that already reference it.')) return;
    try {
      const r = await fetch(`/api/admin/items/${id}`, { method:'DELETE', credentials:'include' });
      if (!r.ok && r.status !== 204) throw new Error((await r.json().catch(()=>null))?.error ?? `HTTP ${r.status}`);
      await load();
    } catch (e:any) { alert('Delete failed: ' + (e?.message ?? 'unknown')); }
  }

  async function syncOpen5e(r: Ruleset) {
    try {
      const res = await postJsonOrText(`/api/admin/sync/items/open5e?ruleset=${r}&limit=100&maxPages=50`);
      alert('Open5e sync:\n' + JSON.stringify(res, null, 2));
      await load();
    } catch (e:any) { alert('Sync failed: ' + (e?.message ?? 'unknown')); }
  }
  async function syncDnd5e() {
    try {
      const res = await postJsonOrText(`/api/admin/sync/items/dnd5e?ruleset=SRD_2014`);
      alert('dnd5e sync:\n' + JSON.stringify(res, null, 2));
      await load();
    } catch (e:any) { alert('Sync failed: ' + (e?.message ?? 'unknown')); }
  }

  async function onCreate() {
    // basic validation + auto key if blank
    const srdKeyManual = form.srdKey.trim();
    const srdKey = srdKeyManual || normalizeKey(form.name);
    const payload: any = {
      ruleset: form.ruleset,
      name: form.name.trim(),
      type: form.type.trim(),
      srdKey: srdKey || undefined,
      weight: form.weight === '' ? null : Number(form.weight),
      rarity: form.rarity.trim() || null,
      requiresAttunement: !!form.requiresAttunement,
      sourceAttribution: form.sourceAttribution.trim() || 'Custom',
      text: form.text.trim() || null,
    };
    try {
      payload.modifiers = form.modifiers?.trim() ? JSON.parse(form.modifiers) : {};
    } catch {
      alert('Modifiers must be valid JSON.');
      return;
    }
    try {
      const r = await fetch('/api/admin/items', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(()=>null);
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      setForm(s => ({ ...s, name:'', srdKey:'', weight:'', rarity:'', text:'' }));
      setKeyStatus(null);
      await load();
      alert(`Created: ${j.name} (${j.ruleset})`);
    } catch (e:any) {
      alert('Create failed: ' + (e?.message ?? 'unknown'));
    }
  }

  function onFormChange<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm(s => ({ ...s, [k]: v }));
    if (k === 'name' || k === 'srdKey') {
      scheduleKeyCheck(k === 'srdKey' ? String(v) : '');
    }
  }

  async function doBulkImport() {
    try {
      let payload: any;
      if (bulkMode === 'json') {
        let parsed: any = JSON.parse(bulkText);
        if (!Array.isArray(parsed)) parsed = { items: parsed };
        payload = parsed;
      } else {
        payload = { mode: 'csv', text: bulkText };
      }
      const r = await fetch('/api/admin/items/bulk', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(()=>null);
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      alert(`Bulk import:\n${JSON.stringify(j, null, 2)}`);
      setBulkText('');
      await load();
    } catch (e:any) {
      alert('Bulk import failed: ' + (e?.message ?? 'unknown'));
    }
  }

  function onPickFile(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      setBulkText(text);
      setBulkMode(f.name.toLowerCase().endsWith('.csv') ? 'csv' : 'json');
    };
    reader.readAsText(f);
  }

  async function downloadCatalog(fmt: 'json' | 'csv') {
    const url = fmt === 'json' ? exportBase.json : exportBase.csv;
    const r = await fetch(url, { credentials: 'include' });
    if (!r.ok) {
      const j = await r.json().catch(()=>null);
      alert(`Export failed: ${j?.error ?? `HTTP ${r.status}`}`);
      return;
    }
    const blob = await r.blob();
    const cd = r.headers.get('content-disposition') || '';
    const match = /filename="([^"]+)"/.exec(cd);
    const filename = match?.[1] ?? `items_export.${fmt}`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 2000);
  }

  return (
    <div style={{ padding:'1rem', display:'grid', gap:'0.75rem' }}>
      <h1>Admin · Items</h1>

      {/* Legend */}
      <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', flexWrap:'wrap', fontSize:12, color:'#333', padding:'0.5rem', border:'1px solid #eee', borderRadius:6 }}>
        <span style={{ fontWeight: 600, marginRight: 6 }}>Legend:</span>
        <span style={{ padding:'2px 6px', borderRadius:999, background:'#f0f8ff', color:'#0b63ce', border:'1px solid #d5e9ff' }}>Custom</span>
        <span style={{ padding:'2px 6px', borderRadius:999, background:'#f3f3f3', color:'#444', border:'1px solid #e5e5e5' }}>SRD</span>
        <span style={{ padding:'2px 6px', borderRadius:999, background:'#eef7ee', color:'#2f7d32', border:'1px solid #d8ecd8' }}>Open5e</span>
        <span style={{ padding:'2px 6px', borderRadius:999, background:'#fff7e6', color:'#9f6b00', border:'1px solid #ffe6b3' }}>dnd5eapi.co</span>
        <span style={{ marginLeft:'auto', color:'#666' }}>
          *Badge reflects <em>sourceAttribution</em>
        </span>
      </div>

      {/* Query + Sync + Export Row */}
      <div style={{ display:'flex', gap:'0.5rem', alignItems:'flex-end', flexWrap:'wrap' }}>
        <label style={{ display:'grid', gap:4 }}>
          <span style={{ fontSize:12, color:'#555' }}>Search (name, srdKey, type, source)</span>
          <input value={q} onChange={e=>{ setQ(e.target.value); setPage(1); }} placeholder="e.g., leather, shield, torch…" style={{ padding:'0.4rem', minWidth:260 }} />
        </label>

        <label style={{ display:'grid', gap:4 }}>
          <span style={{ fontSize:12, color:'#555' }}>Ruleset filter</span>
          <select value={ruleset} onChange={e=>{ setRuleset(e.target.value as any); setPage(1); }} style={{ padding:'0.4rem' }}>
            <option value="">All</option>
            <option value="SRD_2014">SRD_2014</option>
            <option value="SRD_2024">SRD_2024</option>
          </select>
        </label>

        <button onClick={load} style={{ padding:'0.45rem 0.7rem' }}>Refresh</button>

        <span style={{ marginLeft:'auto' }} />

        <button onClick={()=>setBulkOpen(v=>!v)} style={{ padding:'0.45rem 0.7rem' }}>
          {bulkOpen ? 'Hide Import' : 'Bulk Import'}
        </button>
        <button onClick={()=>downloadCatalog('json')} style={{ padding:'0.45rem 0.7rem' }}>Download JSON</button>
        <button onClick={()=>downloadCatalog('csv')} style={{ padding:'0.45rem 0.7rem' }}>Download CSV</button>
        <button onClick={()=>syncDnd5e()} style={{ padding:'0.45rem 0.7rem' }}>Sync dnd5eapi (2014)</button>
        <button onClick={()=>syncOpen5e('SRD_2014')} style={{ padding:'0.45rem 0.7rem' }}>Sync Open5e (2014)</button>
        <button onClick={()=>syncOpen5e('SRD_2024')} style={{ padding:'0.45rem 0.7rem' }}>Sync Open5e (2024)</button>
      </div>

      {/* Bulk Import Panel */}
      {bulkOpen && (
        <section style={{ border:'1px solid #ddd', borderRadius:8, padding:'0.75rem', display:'grid', gap:'0.6rem' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <h2 style={{ margin:0, fontSize:18 }}>Bulk Import</h2>
            <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
              <label style={{ display:'flex', gap:6, alignItems:'center' }}>
                <input type="radio" name="bulkMode" checked={bulkMode==='json'} onChange={()=>setBulkMode('json')} />
                <span>JSON</span>
              </label>
              <label style={{ display:'flex', gap:6, alignItems:'center' }}>
                <input type="radio" name="bulkMode" checked={bulkMode==='csv'} onChange={()=>setBulkMode('csv')} />
                <span>CSV</span>
              </label>
            </div>
          </div>

          <div style={{ fontSize:12, color:'#555' }}>
            {bulkMode==='json' ? (
              <div>
                Paste a JSON <code>Array&lt;Item&gt;</code> or <code>{`{ items: Array<Item> }`}</code>. Fields: <code>ruleset,name,type,srdKey?,weight?,rarity?,requiresAttunement?,sourceAttribution?,text?,modifiers?</code>.
              </div>
            ) : (
              <div>
                CSV headers: <code>ruleset,name,type,srdKey,weight,rarity,requiresAttunement,sourceAttribution,text,modifiers</code> (where <code>modifiers</code> is a JSON string like <code>{"{"}"acBase":11,"maxDex":10{"}"}</code>).
              </div>
            )}
          </div>

          <textarea value={bulkText} onChange={e=>setBulkText(e.target.value)} style={{ width:'100%', minHeight:160, fontFamily:'monospace', padding:'0.6rem' }} placeholder={bulkMode==='json' ? '[{ "ruleset":"SRD_2014","name":"Buckler","type":"Shield","modifiers":{"shieldBonus":1} }]' : 'ruleset,name,type,srdKey,weight,rarity,requiresAttunement,sourceAttribution,text,modifiers\nSRD_2014,Buckler,Shield,buckler,2,,false,Custom,,{"{"}"shieldBonus":1{"}"}'} />

          <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            <input type="file" accept=".json,.csv,text/csv,application/json" ref={fileRef} onChange={onPickFile} />
            <button onClick={doBulkImport} style={{ padding:'0.5rem 0.75rem' }}>Import</button>
          </div>
        </section>
      )}

      {/* Add Item Panel */}
      <section style={{ border:'1px solid #ddd', borderRadius:8, padding:'0.75rem', display:'grid', gap:'0.6rem' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <h2 style={{ margin:0, fontSize:18 }}>Add Item</h2>
          <button onClick={()=>setAddOpen(v=>!v)} style={{ marginLeft:'auto', padding:'0.35rem 0.6rem' }}>
            {addOpen ? 'Hide' : 'Show'}
          </button>
        </div>

        {addOpen && (
          <div style={{ display:'grid', gap:'0.6rem' }}>
            <div style={{ display:'flex', gap:'0.75rem', flexWrap:'wrap' }}>
              <label style={{ display:'grid', gap:4 }}>
                <span style={{ fontSize:12, color:'#555' }}>Ruleset</span>
                <select value={form.ruleset} onChange={e=>onFormChange('ruleset', e.target.value as Ruleset)} style={{ padding:'0.4rem' }}>
                  <option value="SRD_2014">SRD_2014</option>
                  <option value="SRD_2024">SRD_2024</option>
                </select>
              </label>

              <label style={{ display:'grid', gap:4 }}>
                <span style={{ fontSize:12, color:'#555' }}>Name</span>
                <input value={form.name} onChange={e=>onFormChange('name', e.target.value)} placeholder="Leather Armor" style={{ padding:'0.4rem', minWidth:220 }} />
              </label>

              <label style={{ display:'grid', gap:4 }}>
                <span style={{ fontSize:12, color:'#555' }}>Type</span>
                <input value={form.type} onChange={e=>onFormChange('type', e.target.value)} placeholder="Light Armor / Adventuring Gear / Shield / …" style={{ padding:'0.4rem', minWidth:240 }} />
              </label>

              <label style={{ display:'grid', gap:4 }}>
                <span style={{ fontSize:12, color:'#555' }}>srdKey (optional)</span>
                <input value={form.srdKey} onChange={e=>onFormChange('srdKey', e.target.value)} placeholder="auto-generated from name if blank" style={{ padding:'0.4rem', minWidth:220 }} />
                {keyStatus && (
                  <div style={{ fontSize:12 }}>
                    Key: <code>{keyStatus.key}</code>{' '}
                    {keyStatus.exists ? <span style={{ color:'crimson' }}> (already in use)</span> : <span style={{ color:'green' }}> (available)</span>}
                  </div>
                )}
              </label>

              <label style={{ display:'grid', gap:4 }}>
                <span style={{ fontSize:12, color:'#555' }}>Weight (lb)</span>
                <input type="number" step="0.1" value={form.weight} onChange={e=>onFormChange('weight', e.target.value)} placeholder="e.g., 10" style={{ padding:'0.4rem', width:120 }} />
              </label>

              <label style={{ display:'grid', gap:4 }}>
                <span style={{ fontSize:12, color:'#555' }}>Rarity</span>
                <input value={form.rarity} onChange={e=>onFormChange('rarity', e.target.value)} placeholder="Common / Uncommon / (blank)" style={{ padding:'0.4rem', width:160 }} />
              </label>

              <label style={{ display:'flex', gap:6, alignItems:'center' }}>
                <input type="checkbox" checked={form.requiresAttunement} onChange={e=>onFormChange('requiresAttunement', e.target.checked)} />
                <span>Requires attunement</span>
              </label>

              <label style={{ display:'grid', gap:4, minWidth:240, flex:1 }}>
                <span style={{ fontSize:12, color:'#555' }}>Source (attribution)</span>
                <input value={form.sourceAttribution} onChange={e=>onFormChange('sourceAttribution', e.target.value)} placeholder="Custom / SRD / Open5e / dnd5eapi.co / …" style={{ padding:'0.4rem' }} />
              </label>
            </div>

            <label style={{ display:'grid', gap:4 }}>
              <span style={{ fontSize:12, color:'#555' }}>Description (text)</span>
              <textarea value={form.text} onChange={e=>onFormChange('text', e.target.value)} placeholder="Freeform description…" style={{ width:'100%', minHeight:90, padding:'0.5rem' }} />
            </label>

            <div style={{ display:'grid', gap:'0.35rem', border:'1px solid #eee', borderRadius:6, padding:'0.6rem' }}>
              <label style={{ display:'grid', gap:4 }}>
                <span style={{ fontSize:12, color:'#555' }}>Modifiers (JSON)</span>
                <textarea
                  value={form.modifiers}
                  onChange={e=>onFormChange('modifiers', e.target.value)}
                  style={{ width:'100%', minHeight:140, fontFamily:'monospace', padding:'0.5rem' }}
                  placeholder='{"acBase": 11, "maxDex": 10}'
                />
              </label>

              <div style={{ fontSize:12, color:'#555' }}>
                <strong>About modifiers:</strong>
                <ul style={{ margin: '0.25rem 0 0.5rem 1rem' }}>
                  <li><code>acBase</code>: armor base AC; formula becomes <code>acBase + min(DEX mod, maxDex) + acBonus</code>. If omitted, baseline is <code>10 + DEX mod</code>.</li>
                  <li><code>maxDex</code>: max DEX modifier that applies (unset → effectively uncapped: 10 in our engine).</li>
                  <li><code>acBonus</code>: flat AC bonus. With <code>acBase</code> it’s part of the armor result; without <code>acBase</code> it stacks as an extra bonus (e.g., ring/cloak).</li>
                  <li><code>shieldBonus</code>: flat shield addition (typical shield is <code>2</code>).</li>
                </ul>
              </div>

              <div style={{ display:'flex', gap:'0.75rem', alignItems:'center', flexWrap:'wrap' }}>
                <label style={{ display:'grid', gap:2 }}>
                  <span style={{ fontSize:12, color:'#555' }}>DEX mod (preview)</span>
                  <input type="number" value={dexPreview} onChange={e=>setDexPreview(Number(e.target.value))} style={{ width:90, padding:'0.35rem' }} />
                </label>
                <div style={{ fontSize:12, color:'#333' }}>
                  <strong>Preview:</strong>{' '}
                  AC = <code>{modifiersPreview.totalAC}</code>{' '}
                  <span style={{ color:'#666' }}>
                    (Armor {modifiersPreview.armorAC}
                    {modifiersPreview.shieldBonus ? ` + Shield ${modifiersPreview.shieldBonus}` : ''}
                    {modifiersPreview.extraAcBonus ? ` + Bonus ${modifiersPreview.extraAcBonus}` : ''}
                    )
                  </span>
                </div>
              </div>
            </div>

            <div>
              <button onClick={onCreate} style={{ padding:'0.5rem 0.75rem' }}>Create item</button>
            </div>
          </div>
        )}
      </section>

      {/* List */}
      {loading && <div>Loading…</div>}
      {err && <div style={{ color:'crimson' }}>Error: {err}</div>}

      {!loading && !err && data && (
        <>
          <div style={{ fontSize:12, color:'#666' }}>
            Showing {(data.page-1)*data.pageSize+1}–{Math.min(data.page*data.pageSize, data.total)} of {data.total}
          </div>

          <div style={{ display:'grid', gap:'0.6rem' }}>
            {data.items.map((it)=>(
              <div key={it.id} style={{ border:'1px solid #ddd', borderRadius:6, padding:'0.6rem', display:'grid', gap:'0.5rem' }}>
                <div style={{ display:'grid', gap:'0.35rem' }}>
                  <div style={{ display:'flex', gap:'0.6rem', alignItems:'center', flexWrap:'wrap' }}>
                    <code style={{ fontSize:12 }} title="srdKey">{it.srdKey}</code>

                    {/* SOURCE BADGE */}
                    <span style={{
                      fontSize: 11, padding: '2px 6px', borderRadius: 999,
                      background: (() => {
                        const s = (it.sourceAttribution ?? '').toLowerCase();
                        if (s === 'custom') return '#f0f8ff';
                        if (s.includes('open5e')) return '#eef7ee';
                        if (s.includes('dnd5eapi')) return '#fff7e6';
                        return '#f3f3f3';
                      })(),
                      color: (() => {
                        const s = (it.sourceAttribution ?? '').toLowerCase();
                        if (s === 'custom') return '#0b63ce';
                        if (s.includes('open5e')) return '#2f7d32';
                        if (s.includes('dnd5eapi')) return '#9f6b00';
                        return '#444';
                      })(),
                      border: (() => {
                        const s = (it.sourceAttribution ?? '').toLowerCase();
                        if (s === 'custom') return '1px solid #d5e9ff';
                        if (s.includes('open5e')) return '1px solid #d8ecd8';
                        if (s.includes('dnd5eapi')) return '1px solid #ffe6b3';
                        return '1px solid #e5e5e5';
                      })()
                    }}>
                      {(it.sourceAttribution ?? 'SRD')}
                    </span>

                    <label style={{ display:'grid', gap:2 }}>
                      <span style={{ fontSize:12, color:'#555' }}>Ruleset</span>
                      <select value={it.ruleset} onChange={e=>save({ id:it.id, ruleset: e.target.value as Ruleset })} style={{ padding:'0.2rem' }}>
                        <option value="SRD_2014">SRD_2014</option>
                        <option value="SRD_2024">SRD_2024</option>
                      </select>
                    </label>

                    <label style={{ display:'grid', gap:2 }}>
                      <span style={{ fontSize:12, color:'#555' }}>Name</span>
                      <input value={it.name} onChange={e=>save({ id:it.id, name:e.target.value })} style={{ padding:'0.2rem', minWidth:240 }} />
                    </label>

                    <label style={{ display:'grid', gap:2 }}>
                      <span style={{ fontSize:12, color:'#555' }}>Type</span>
                      <input value={it.type} onChange={e=>save({ id:it.id, type:e.target.value })} style={{ padding:'0.2rem', minWidth:200 }} />
                    </label>

                    <label style={{ display:'grid', gap:2 }}>
                      <span style={{ fontSize:12, color:'#555' }}>Weight (lb)</span>
                      <input type="number" step="0.1" value={it.weight ?? ''} onChange={e=>save({ id:it.id, weight: e.target.value===''? null : Number(e.target.value) })} style={{ width:'7rem', padding:'0.2rem' }} />
                    </label>

                    <label style={{ display:'grid', gap:2 }}>
                      <span style={{ fontSize:12, color:'#555' }}>Rarity</span>
                      <input value={it.rarity ?? ''} onChange={e=>save({ id:it.id, rarity:e.target.value || null })} style={{ padding:'0.2rem', width:'10rem' }} />
                    </label>

                    <label style={{ display:'flex', gap:6, alignItems:'center' }}>
                      <input type="checkbox" checked={!!it.requiresAttunement} onChange={e=>save({ id:it.id, requiresAttunement: e.target.checked })} />
                      <span>Requires attunement</span>
                    </label>

                    <button onClick={()=>del(it.id)} style={{ padding:'0.3rem 0.6rem', background:'#fff0f0', border:'1px solid #ffcccc', marginLeft:'auto' }}>
                      Delete
                    </button>
                  </div>

                  <label style={{ display:'grid', gap:2 }}>
                    <span style={{ fontSize:12, color:'#555' }}>Description (text)</span>
                    <textarea value={it.text ?? ''} onChange={e=>save({ id:it.id, text:e.target.value || null })} style={{ width:'100%', minHeight:70, padding:'0.4rem' }} />
                  </label>

                  <div style={{ display:'grid', gap:'0.35rem', border:'1px solid #eee', borderRadius:6, padding:'0.6rem' }}>
                    <label style={{ display:'grid', gap:2 }}>
                      <span style={{ fontSize:12, color:'#555' }}>Modifiers (JSON)</span>
                      <textarea
                        defaultValue={JSON.stringify(it.modifiers ?? {}, null, 2)}
                        onBlur={e=>{
                          try {
                            const parsed = JSON.parse(e.currentTarget.value || '{}');
                            save({ id:it.id, modifiers: parsed });
                          } catch {
                            alert('Invalid JSON in modifiers');
                          }
                        }}
                        style={{ width:'100%', minHeight:110, fontFamily:'monospace', padding:'0.4rem' }}
                      />
                    </label>

                    <div style={{ fontSize:12, color:'#666' }}>
                      <strong>How the engine uses these:</strong>  
                      <ul style={{ margin: '0.25rem 0 0.25rem 1rem' }}>
                        <li>If <code>acBase</code> is set: <em>Armor AC</em> = <code>acBase + min(DEX mod, maxDex) + acBonus</code>, then add <code>shieldBonus</code> and any extra <code>acBonus</code> from items without <code>acBase</code>.</li>
                        <li>If <code>acBase</code> is not set: baseline is <code>10 + DEX mod</code>, plus any <code>acBonus</code> from rings/cloaks.</li>
                        <li><code>shieldBonus</code> is a flat addition (typical shield is <code>2</code>).</li>
                      </ul>
                      <div>Examples: Leather <code>{"{ acBase: 11, maxDex: 10 }"}</code> · Chain Shirt <code>{"{ acBase: 13, maxDex: 2 }"}</code> · Shield <code>{"{ shieldBonus: 2 }"}</code> · Ring <code>{"{ acBonus: 1 }"}</code></div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div style={{ display:'flex', gap:'0.5rem', alignItems:'center' }}>
            <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page<=1} style={{ padding:'0.4rem 0.6rem' }}>Prev</button>
            <span>Page {data.page} of {Math.max(1, Math.ceil(data.total / data.pageSize))}</span>
            <button
              onClick={()=>setPage(p=>{
                const last = Math.max(1, Math.ceil((data?.total ?? 0)/(data?.pageSize ?? 25)));
                return Math.min(last, p+1);
              })}
              disabled={page*data.pageSize >= data.total}
              style={{ padding:'0.4rem 0.6rem' }}
            >Next</button>
          </div>
        </>
      )}
    </div>
  );
}
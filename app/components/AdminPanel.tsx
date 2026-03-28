'use client';

// app/components/AdminPanel.tsx
import { useState, useEffect, useCallback } from 'react';

type UserRole = 'USER' | 'ADMIN' | 'SUPER_ADMIN';

type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  createdAt: string;
  _count: { characters: number };
};

type AdminCharacter = {
  id: string;
  name: string;
  level: number;
  race: string;
  ruleset: string;
  updatedAt: string;
  owner: { id: string; email: string; name: string | null };
};

type Props = {
  currentUserRole: UserRole;
  onClose: () => void;
};

const ROLE_LABELS: Record<UserRole, string> = {
  USER: 'User',
  ADMIN: 'Admin',
  SUPER_ADMIN: 'Super Admin',
};

const ROLE_COLORS: Record<UserRole, string> = {
  USER: 'var(--ink-light)',
  ADMIN: 'var(--gold)',
  SUPER_ADMIN: 'var(--red)',
};

export default function AdminPanel({ currentUserRole, onClose }: Props) {
  const [tab, setTab] = useState<'users' | 'characters'>('users');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [characters, setCharacters] = useState<AdminCharacter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Create user form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createEmail, setCreateEmail] = useState('');
  const [createName, setCreateName] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createError, setCreateError] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  // Reset password
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/users');
      if (!res.ok) throw new Error('Failed to load users');
      const data = await res.json();
      setUsers(data.users ?? data);
    } catch {
      setError('Could not load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCharacters = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/characters');
      if (!res.ok) throw new Error('Failed to load characters');
      const data = await res.json();
      setCharacters(data.characters ?? data);
    } catch {
      setError('Could not load characters.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'users') loadUsers();
    else loadCharacters();
  }, [tab, loadUsers, loadCharacters]);

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleImpersonate(userId: string) {
    const res = await fetch('/api/admin/impersonate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) {
      onClose();
      // Hard reload ensures TopNav re-mounts and re-fetches /api/auth/me
      // with the impersonate cookie already set
      window.location.href = '/characters';
    } else {
      const data = await res.json();
      alert(data.error || 'Could not impersonate user');
    }
  }

  async function handleDelete(userId: string, email: string) {
    if (!confirm(`Soft-delete ${email}? Their characters will be preserved.`)) return;
    const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
    if (res.ok) loadUsers();
    else {
      const data = await res.json();
      alert(data.error || 'Could not delete user');
    }
  }

  async function handleRoleChange(userId: string, role: UserRole) {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    if (res.ok) loadUsers();
    else {
      const data = await res.json();
      alert(data.error || 'Could not change role');
    }
  }

  async function handleResetPassword() {
    if (!resetUserId) return;
    if (resetPassword.length < 8) {
      setResetError('Password must be at least 8 characters');
      return;
    }
    setResetLoading(true);
    setResetError('');
    const res = await fetch(`/api/admin/users/${resetUserId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: resetPassword }),
    });
    setResetLoading(false);
    if (res.ok) {
      setResetUserId(null);
      setResetPassword('');
    } else {
      const data = await res.json();
      setResetError(data.error || 'Failed to reset password');
    }
  }

  async function handleCreateUser() {
    setCreateError('');
    if (!createEmail || !createPassword) {
      setCreateError('Email and password are required');
      return;
    }
    if (createPassword.length < 8) {
      setCreateError('Password must be at least 8 characters');
      return;
    }
    setCreateLoading(true);
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: createEmail, name: createName || undefined, password: createPassword }),
    });
    setCreateLoading(false);
    if (res.ok) {
      setShowCreateForm(false);
      setCreateEmail('');
      setCreateName('');
      setCreatePassword('');
      loadUsers();
    } else {
      const data = await res.json();
      setCreateError(data.error || 'Failed to create user');
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: 'var(--parchment)',
          border: '2px solid var(--border)',
          borderRadius: '8px',
          width: '100%',
          maxWidth: '860px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '1rem 1.5rem',
          borderBottom: '1px solid var(--border)',
          background: 'var(--parchment-dark)',
        }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', color: 'var(--ink)', fontSize: '1.25rem' }}>
            Admin Panel
          </h2>
          <button onClick={onClose} className="ink-btn" style={{ padding: '0.25rem 0.75rem' }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--parchment-dark)' }}>
          {(['users', 'characters'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '0.6rem 1.25rem',
                background: tab === t ? 'var(--parchment)' : 'transparent',
                border: 'none',
                borderBottom: tab === t ? '2px solid var(--gold)' : '2px solid transparent',
                cursor: 'pointer',
                fontFamily: 'var(--font-display)',
                fontSize: '0.9rem',
                color: tab === t ? 'var(--ink)' : 'var(--ink-light)',
                textTransform: 'capitalize',
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
          {loading && <p style={{ color: 'var(--ink-light)' }}>Loading…</p>}
          {error && <p style={{ color: 'var(--red)' }}>{error}</p>}

          {/* ── Users tab ── */}
          {!loading && tab === 'users' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                <button className="ink-btn" onClick={() => setShowCreateForm((v) => !v)}>
                  {showCreateForm ? 'Cancel' : '+ Create User'}
                </button>
              </div>

              {/* Create user form */}
              {showCreateForm && (
                <div className="panel" style={{ marginBottom: '1.25rem' }}>
                  <div className="panel-header">New User</div>
                  <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    <input
                      className="field-label"
                      placeholder="Email *"
                      value={createEmail}
                      onChange={(e) => setCreateEmail(e.target.value)}
                      style={{ padding: '0.4rem', borderRadius: '4px', border: '1px solid var(--border)', fontFamily: 'var(--font-body)', width: '100%' }}
                    />
                    <input
                      className="field-label"
                      placeholder="Name (optional)"
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      style={{ padding: '0.4rem', borderRadius: '4px', border: '1px solid var(--border)', fontFamily: 'var(--font-body)', width: '100%' }}
                    />
                    <input
                      type="password"
                      placeholder="Password * (min 8 chars)"
                      value={createPassword}
                      onChange={(e) => setCreatePassword(e.target.value)}
                      style={{ padding: '0.4rem', borderRadius: '4px', border: '1px solid var(--border)', fontFamily: 'var(--font-body)', width: '100%' }}
                    />
                    {createError && <p style={{ color: 'var(--red)', margin: 0, fontSize: '0.85rem' }}>{createError}</p>}
                    <button className="ink-btn" onClick={handleCreateUser} disabled={createLoading}>
                      {createLoading ? 'Creating…' : 'Create'}
                    </button>
                  </div>
                </div>
              )}

              {/* Reset password inline form */}
              {resetUserId && (
                <div className="panel" style={{ marginBottom: '1.25rem', borderColor: 'var(--gold)' }}>
                  <div className="panel-header">Reset Password</div>
                  <div className="panel-body" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input
                      type="password"
                      placeholder="New password (min 8 chars)"
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                      style={{ flex: 1, padding: '0.4rem', borderRadius: '4px', border: '1px solid var(--border)', fontFamily: 'var(--font-body)' }}
                    />
                    <button className="ink-btn" onClick={handleResetPassword} disabled={resetLoading}>
                      {resetLoading ? 'Saving…' : 'Save'}
                    </button>
                    <button className="ink-btn" onClick={() => { setResetUserId(null); setResetPassword(''); setResetError(''); }}>
                      Cancel
                    </button>
                  </div>
                  {resetError && <p style={{ color: 'var(--red)', margin: '0.5rem 0 0', fontSize: '0.85rem' }}>{resetError}</p>}
                </div>
              )}

              {/* Users table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-body)', fontSize: '0.95rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                    {['Name / Email', 'Role', 'Characters', 'Joined', 'Actions'].map((h) => (
                      <th key={h} style={{ padding: '0.4rem 0.6rem', color: 'var(--ink-light)', fontFamily: 'var(--font-display)', fontSize: '0.8rem', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '0.5rem 0.6rem' }}>
                        <div style={{ fontWeight: 600 }}>{u.name || '—'}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--ink-light)' }}>{u.email}</div>
                      </td>
                      <td style={{ padding: '0.5rem 0.6rem' }}>
                        {currentUserRole === 'SUPER_ADMIN' && u.role !== 'SUPER_ADMIN' ? (
                          <select
                            value={u.role}
                            onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole)}
                            style={{ background: 'var(--parchment)', border: '1px solid var(--border)', borderRadius: '4px', fontFamily: 'var(--font-body)', padding: '0.2rem', color: ROLE_COLORS[u.role] }}
                          >
                            <option value="USER">User</option>
                            <option value="ADMIN">Admin</option>
                          </select>
                        ) : (
                          <span style={{ color: ROLE_COLORS[u.role], fontWeight: 600 }}>{ROLE_LABELS[u.role]}</span>
                        )}
                      </td>
                      <td style={{ padding: '0.5rem 0.6rem', textAlign: 'center' }}>{u._count.characters}</td>
                      <td style={{ padding: '0.5rem 0.6rem', fontSize: '0.85rem', color: 'var(--ink-light)' }}>
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '0.5rem 0.6rem' }}>
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                          <button
                            className="ink-btn"
                            style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem' }}
                            onClick={() => { setResetUserId(u.id); setResetPassword(''); setResetError(''); }}
                          >
                            Reset PW
                          </button>
                          {u.role !== 'SUPER_ADMIN' && (
                            <button
                              className="ink-btn"
                              style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem' }}
                              onClick={() => handleImpersonate(u.id)}
                            >
                              Impersonate
                            </button>
                          )}
                          {u.role !== 'SUPER_ADMIN' && (
                            <button
                              className="ink-btn"
                              style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', color: 'var(--red)', borderColor: 'var(--red)' }}
                              onClick={() => handleDelete(u.id, u.email)}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* ── Characters tab ── */}
          {!loading && tab === 'characters' && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-body)', fontSize: '0.95rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                  {['Character', 'Owner', 'Level', 'Ruleset', 'Last Updated'].map((h) => (
                    <th key={h} style={{ padding: '0.4rem 0.6rem', color: 'var(--ink-light)', fontFamily: 'var(--font-display)', fontSize: '0.8rem', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {characters.map((c) => (
                  <tr
                    key={c.id}
                    style={{ borderBottom: '1px solid var(--border-light)', cursor: 'pointer' }}
                    onClick={() => { onClose(); window.location.href = `/characters/${c.id}`; }}
                  >
                    <td style={{ padding: '0.5rem 0.6rem', fontWeight: 600 }}>{c.name}</td>
                    <td style={{ padding: '0.5rem 0.6rem', fontSize: '0.85rem', color: 'var(--ink-light)' }}>
                      {c.owner.name || c.owner.email}
                    </td>
                    <td style={{ padding: '0.5rem 0.6rem' }}>{c.level}</td>
                    <td style={{ padding: '0.5rem 0.6rem', fontSize: '0.85rem' }}>{c.ruleset}</td>
                    <td style={{ padding: '0.5rem 0.6rem', fontSize: '0.85rem', color: 'var(--ink-light)' }}>
                      {new Date(c.updatedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

// app/components/ImpersonationBanner.tsx
import { useState } from 'react';

type Props = {
  targetEmail: string;
  onExit: () => void;
};

export default function ImpersonationBanner({ targetEmail, onExit }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleExit() {
    setLoading(true);
    await fetch('/api/admin/impersonate', { method: 'DELETE' });
    onExit();
    window.location.replace('/characters');
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: 'var(--red, #8b1a1a)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
        padding: '0.4rem 1rem',
        fontFamily: 'var(--font-body, Georgia, serif)',
        fontSize: '0.9rem',
        fontWeight: 600,
      }}
    >
      <span>👁 Viewing as {targetEmail}</span>
      <button
        onClick={handleExit}
        disabled={loading}
        style={{
          background: 'rgba(255,255,255,0.2)',
          border: '1px solid rgba(255,255,255,0.5)',
          color: '#fff',
          borderRadius: '4px',
          padding: '0.15rem 0.65rem',
          cursor: 'pointer',
          fontSize: '0.85rem',
        }}
      >
        {loading ? 'Exiting…' : 'Exit'}
      </button>
    </div>
  );
}

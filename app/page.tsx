import Link from 'next/link';

export default function HomePage() {
  return (
    <div style={{
      minHeight: 'calc(100vh - 44px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{ textAlign: 'center', padding: '2rem 1.5rem', maxWidth: 560, width: '100%' }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 3,
          color: 'var(--border)',
          textTransform: 'uppercase',
          marginBottom: 16,
        }}>
          ✦ D&amp;D 5th Edition ✦
        </div>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 42,
          fontWeight: 700,
          color: 'var(--ink)',
          margin: '0 0 16px',
          lineHeight: 1.1,
          letterSpacing: '0.5px',
        }}>
          The Realm Awaits
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: 17,
          color: 'var(--ink-light)',
          fontStyle: 'italic',
          margin: '0 0 36px',
          lineHeight: 1.7,
        }}>
          Track your characters, chronicle your campaigns,<br />
          and never lose a session to memory.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/characters">
            <button className="ink-btn" style={{ fontSize: 14, padding: '11px 28px' }}>
              My Characters
            </button>
          </Link>
          <Link href="/campaigns">
            <button className="ink-btn ghost" style={{ fontSize: 14, padding: '11px 28px' }}>
              Campaigns
            </button>
          </Link>
        </div>
        <div style={{ marginTop: 48, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-light)' }} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 10, color: 'var(--border)', letterSpacing: 3 }}>✦</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-light)' }} />
        </div>
        <p style={{ marginTop: 20, fontSize: 12, color: 'var(--border)', fontStyle: 'italic' }}>
          A private companion for the party of <strong style={{ fontStyle: 'normal', color: 'var(--ink-light)' }}>Emenaker</strong>
        </p>
      </div>
    </div>
  );
}

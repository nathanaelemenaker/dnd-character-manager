import Link from 'next/link';

export default function HomePage() {
  return (
    <div style={{ maxWidth: 640, margin: '3rem auto', display: 'grid', gap: 24 }}>

      {/* Hero */}
      <div style={{ textAlign: 'center', padding: '2rem 1rem 1.5rem' }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 3,
          color: 'var(--border)',
          textTransform: 'uppercase',
          marginBottom: 12,
        }}>
          ✦ D&amp;D 5th Edition ✦
        </div>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 36,
          fontWeight: 700,
          color: 'var(--ink)',
          margin: '0 0 12px',
          lineHeight: 1.15,
          letterSpacing: '0.5px',
        }}>
          The Realm Awaits
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: 16,
          color: 'var(--ink-light)',
          fontStyle: 'italic',
          margin: '0 0 28px',
          lineHeight: 1.6,
        }}>
          Track your characters, chronicle your campaigns,<br />
          and never lose a session to memory.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/characters">
            <button className="ink-btn" style={{ fontSize: 13, padding: '10px 24px' }}>
              My Characters
            </button>
          </Link>
          <Link href="/campaigns">
            <button className="ink-btn ghost" style={{ fontSize: 13, padding: '10px 24px' }}>
              Campaigns
            </button>
          </Link>
        </div>
      </div>

      {/* Divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, height: '1px', background: 'var(--border-light)' }} />
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 10, color: 'var(--border)', letterSpacing: 2 }}>✦</span>
        <div style={{ flex: 1, height: '1px', background: 'var(--border-light)' }} />
      </div>

      {/* Quick links */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Link href="/characters" style={{ textDecoration: 'none' }}>
          <div className="panel" style={{ cursor: 'pointer', transition: 'border-color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--gold)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = '')}>
            <div className="panel-header">Characters</div>
            <div className="panel-body" style={{ fontSize: 13, color: 'var(--ink-light)', fontStyle: 'italic' }}>
              View and manage your party's character sheets.
            </div>
          </div>
        </Link>
        <Link href="/campaigns" style={{ textDecoration: 'none' }}>
          <div className="panel" style={{ cursor: 'pointer', transition: 'border-color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--gold)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = '')}>
            <div className="panel-header">Campaigns</div>
            <div className="panel-body" style={{ fontSize: 13, color: 'var(--ink-light)', fontStyle: 'italic' }}>
              Session recordings, notes, and campaign history.
            </div>
          </div>
        </Link>
      </div>

    </div>
  );
}

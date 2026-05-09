'use client';

import Link from 'next/link';
import { useRecording } from '@/context/RecordingContext';

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function FloatingRecordingBar() {
  const {
    recordingState, activeCampaignId, activeSessionId,
    elapsed, uploadProgress, errorMsg,
    pauseRecording, resumeRecording, stopRecording, handleRetry, clearCompleted,
  } = useRecording();

  if (recordingState === 'idle') return null;

  const sessionLink = activeCampaignId && activeSessionId
    ? `/campaigns/${activeCampaignId}/sessions/${activeSessionId}`
    : null;

  // ── Recording ──────────────────────────────────────────────────────────────
  if (recordingState === 'recording') {
    return (
      <div className="recording-bar" style={barStyle('var(--red)', 'rgba(139,26,26,0.06)')}>
        <span style={dotStyle('var(--red)', true)} />
        <span style={timerStyle('var(--red)')}>{formatDuration(elapsed)}</span>
        <span style={labelStyle}>Recording</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="ink-btn ghost" style={btnStyle} onClick={pauseRecording}>⏸ Pause</button>
          <button className="ink-btn danger" style={btnStyle} onClick={stopRecording}>⏹ Stop &amp; Upload</button>
        </div>
        <style>{pulse}</style>
      </div>
    );
  }

  // ── Paused ─────────────────────────────────────────────────────────────────
  if (recordingState === 'paused') {
    return (
      <div className="recording-bar" style={barStyle('var(--gold)', 'rgba(201,162,39,0.06)')}>
        <span style={dotStyle('var(--gold)', false)} />
        <span style={timerStyle('var(--gold)')}>{formatDuration(elapsed)}</span>
        <span style={labelStyle}>Paused</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="ink-btn" style={btnStyle} onClick={resumeRecording}>▶ Resume</button>
          <button className="ink-btn danger" style={btnStyle} onClick={stopRecording}>⏹ Stop &amp; Upload</button>
        </div>
      </div>
    );
  }

  // ── Uploading ──────────────────────────────────────────────────────────────
  if (recordingState === 'uploading') {
    const pct = uploadProgress ? parseInt(uploadProgress) : 0;
    return (
      <div className="recording-bar" style={barStyle('var(--border-light)', 'var(--parchment-dark)', true)}>
        <span style={{ fontSize: 15 }}>📤</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--ink)', marginBottom: 4 }}>
            {uploadProgress ? `Uploading… ${uploadProgress}` : 'Preparing upload…'}
          </div>
          <div style={{ background: 'var(--border-light)', borderRadius: 3, height: 5, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 3, background: 'var(--gold)', width: `${pct}%`, transition: 'width 0.3s ease' }} />
          </div>
        </div>
        <span style={{ fontSize: 11, color: 'var(--border)', fontStyle: 'italic', flexShrink: 0 }}>
          Keep this page open
        </span>
      </div>
    );
  }

  // ── Pending / Processing ───────────────────────────────────────────────────
  if (recordingState === 'pending' || recordingState === 'processing') {
    return (
      <div className="recording-bar" style={barStyle('rgba(201,162,39,0.4)', 'rgba(201,162,39,0.06)')}>
        <span style={{ fontSize: 15 }}>⏳</span>
        <span style={labelStyle}>
          Transcription {recordingState === 'pending' ? 'queued' : 'in progress'}…
        </span>
        {sessionLink && (
          <Link href={sessionLink} style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--border)', textDecoration: 'underline' }}>
            View session →
          </Link>
        )}
      </div>
    );
  }

  // ── Done ───────────────────────────────────────────────────────────────────
  if (recordingState === 'done') {
    return (
      <div className="recording-bar" style={barStyle('rgba(46,125,50,0.3)', 'rgba(46,125,50,0.06)')}>
        <span style={{ fontSize: 15 }}>✓</span>
        <span style={{ ...labelStyle, color: '#2e7d32' }}>Transcript ready</span>
        {sessionLink && (
          <Link href={sessionLink} style={{ fontSize: 11, color: '#2e7d32', textDecoration: 'underline' }}>
            View session →
          </Link>
        )}
        <button className="ink-btn ghost" style={{ ...btnStyle, marginLeft: 'auto' }} onClick={clearCompleted}>
          ✕
        </button>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (recordingState === 'error') {
    return (
      <div className="recording-bar" style={barStyle('rgba(139,26,26,0.3)', 'rgba(139,26,26,0.06)')}>
        <span style={{ fontSize: 15 }}>⚠️</span>
        <span style={{ fontSize: 12, color: 'var(--red)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {errorMsg || 'Transcription error'}
        </span>
        {sessionLink && (
          <Link href={sessionLink} style={{ fontSize: 11, color: 'var(--red)', textDecoration: 'underline', flexShrink: 0 }}>
            View session →
          </Link>
        )}
        <button className="ink-btn ghost" style={{ ...btnStyle, flexShrink: 0 }} onClick={handleRetry}>
          ↺ Retry
        </button>
      </div>
    );
  }

  return null;
}

// ── Shared styles ────────────────────────────────────────────────────────────

function barStyle(borderColor: string, bg: string, tall = false): React.CSSProperties {
  return {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: tall ? '10px 16px' : '8px 16px',
    background: bg,
    borderTop: `1.5px solid ${borderColor}`,
    boxShadow: '0 -2px 8px rgba(0,0,0,0.08)',
  };
}

function dotStyle(color: string, animated: boolean): React.CSSProperties {
  return {
    width: 9,
    height: 9,
    borderRadius: '50%',
    background: color,
    display: 'inline-block',
    flexShrink: 0,
    animation: animated ? 'pulse 1s ease-in-out infinite' : undefined,
  };
}

function timerStyle(color: string): React.CSSProperties {
  return {
    fontFamily: 'var(--font-display)',
    fontSize: 13,
    fontWeight: 700,
    color,
    minWidth: 52,
    flexShrink: 0,
  };
}

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--border)',
};

const btnStyle: React.CSSProperties = {
  fontSize: 11,
  padding: '3px 9px',
};

const pulse = `@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`;

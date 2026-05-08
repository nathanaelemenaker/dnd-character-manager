'use client';

import { useEffect } from 'react';
import { useRecording } from '@/context/RecordingContext';

interface RecordButtonProps {
  campaignId: string;
  sessionId: string;
  // Server-side status loaded on page mount (for sessions already in progress)
  initialStatus: string | null;
  initialError?: string | null;
  onTranscriptReady: (transcript: string) => void;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function RecordButton({
  campaignId, sessionId, initialStatus, initialError, onTranscriptReady,
}: RecordButtonProps) {
  const {
    recordingState, activeSessionId, elapsed, uploadProgress, errorMsg, completedTranscript,
    startRecording, stopRecording, pauseRecording, resumeRecording, handleRetry, clearCompleted,
  } = useRecording();

  // Is this RecordButton's session the one currently active in the context?
  const isThisSession = activeSessionId === sessionId;

  // When context finishes transcription for this session, fire the callback
  useEffect(() => {
    if (isThisSession && recordingState === 'done' && completedTranscript) {
      onTranscriptReady(completedTranscript);
    }
  }, [isThisSession, recordingState, completedTranscript, onTranscriptReady]);

  // Determine what state to display:
  // - If context is active for this session, use context state
  // - Otherwise fall back to initialStatus (server-side state from page load)
  const displayState = isThisSession ? recordingState : (initialStatus ?? 'idle');
  const displayError = isThisSession ? errorMsg : (initialError ?? '');

  // ── Done ────────────────────────────────────────────────────────────────────
  if (displayState === 'done') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', background: 'rgba(46,125,50,0.08)',
        border: '1.5px solid rgba(46,125,50,0.3)', borderRadius: 5,
      }}>
        <span style={{ fontSize: 18 }}>✓</span>
        <span style={{ fontSize: 13, color: '#2e7d32', fontFamily: 'var(--font-display)', fontWeight: 700 }}>
          Transcript ready
        </span>
        <span style={{ fontSize: 12, color: 'var(--border)', fontStyle: 'italic' }}>
          — auto-filled below
        </span>
        {isThisSession && (
          <button className="ink-btn ghost" style={{ fontSize: 11, marginLeft: 'auto' }} onClick={clearCompleted}>
            ✕ Dismiss
          </button>
        )}
      </div>
    );
  }

  // ── Pending / Processing ────────────────────────────────────────────────────
  if (displayState === 'pending' || displayState === 'processing') {
    return (
      <div style={{
        padding: '14px 16px', background: 'rgba(201,162,39,0.06)',
        border: '1.5px solid rgba(201,162,39,0.4)', borderRadius: 5,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 18 }}>⏳</span>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
            Transcription {displayState === 'pending' ? 'queued' : 'in progress'}…
          </span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--border)', lineHeight: 1.6 }}>
          faster-whisper is processing your audio on the server. This can take anywhere from a few
          minutes to several hours depending on recording length and server hardware.
          You can close this page — it will keep running. Come back and refresh to check progress.
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--border)', fontStyle: 'italic' }}>
          Checking for updates every 30 seconds…
        </div>
      </div>
    );
  }

  // ── Error ───────────────────────────────────────────────────────────────────
  if (displayState === 'error') {
    return (
      <div style={{
        padding: '14px 16px', background: 'rgba(139,26,26,0.06)',
        border: '1.5px solid rgba(139,26,26,0.3)', borderRadius: 5,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--red)' }}>
            Transcription error
          </span>
        </div>
        {displayError && (
          <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10, fontStyle: 'italic' }}>
            {displayError}
          </div>
        )}
        <button className="ink-btn ghost" style={{ fontSize: 11 }} onClick={handleRetry}>
          ↺ Try again
        </button>
      </div>
    );
  }

  // ── Uploading ───────────────────────────────────────────────────────────────
  if (displayState === 'uploading') {
    const pct = uploadProgress ? parseInt(uploadProgress) : 0;
    return (
      <div style={{
        padding: '12px 14px', background: 'var(--parchment-dark)',
        border: '1.5px solid var(--border-light)', borderRadius: 5,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 16 }}>📤</span>
          <span style={{ fontSize: 13, color: 'var(--ink)', fontStyle: 'italic', flex: 1 }}>
            {uploadProgress ? `Uploading… ${uploadProgress}` : 'Preparing upload…'}
          </span>
        </div>
        <div style={{ background: 'var(--border-light)', borderRadius: 3, height: 6, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 3, background: 'var(--gold)',
            width: `${pct}%`, transition: 'width 0.3s ease',
          }} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--border)', fontStyle: 'italic', marginTop: 6 }}>
          Keep this page open until upload completes.
        </div>
      </div>
    );
  }

  // ── Paused ──────────────────────────────────────────────────────────────────
  if (displayState === 'paused') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 14px', background: 'rgba(201,162,39,0.06)',
        border: '1.5px solid var(--gold)', borderRadius: 5,
      }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--gold)', display: 'inline-block', flexShrink: 0 }} />
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--gold)', minWidth: 60 }}>
          {formatDuration(elapsed)}
        </span>
        <span style={{ fontSize: 12, color: 'var(--border)', flex: 1 }}>Paused</span>
        <button className="ink-btn" style={{ fontSize: 12 }} onClick={resumeRecording}>▶ Resume</button>
        <button className="ink-btn danger" style={{ fontSize: 12 }} onClick={stopRecording}>⏹ Stop &amp; Upload</button>
      </div>
    );
  }

  // ── Recording ───────────────────────────────────────────────────────────────
  if (displayState === 'recording') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 14px', background: 'rgba(139,26,26,0.06)',
        border: '1.5px solid var(--red)', borderRadius: 5,
      }}>
        <span style={{
          width: 10, height: 10, borderRadius: '50%', background: 'var(--red)',
          display: 'inline-block', animation: 'pulse 1s ease-in-out infinite', flexShrink: 0,
        }} />
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--red)', minWidth: 60 }}>
          {formatDuration(elapsed)}
        </span>
        <span style={{ fontSize: 12, color: 'var(--border)', flex: 1 }}>Recording…</span>
        <button className="ink-btn ghost" style={{ fontSize: 12 }} onClick={pauseRecording}>⏸ Pause</button>
        <button className="ink-btn danger" style={{ fontSize: 12 }} onClick={stopRecording}>⏹ Stop &amp; Upload</button>
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
      </div>
    );
  }

  // ── Idle ────────────────────────────────────────────────────────────────────
  return (
    <div>
      <button
        className="ink-btn"
        style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}
        onClick={() => startRecording(campaignId, sessionId)}
      >
        <span style={{ fontSize: 16 }}>🎙</span>
        Record Audio
      </button>
      <div style={{ fontSize: 11, color: 'var(--border)', fontStyle: 'italic', marginTop: 6 }}>
        Records in your browser — navigate freely while recording. Upload when you're done.
      </div>
    </div>
  );
}

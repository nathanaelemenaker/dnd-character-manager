'use client';

import { useEffect, useRef, useState } from 'react';

type RecordState = 'idle' | 'recording' | 'uploading' | 'pending' | 'processing' | 'done' | 'error';

interface RecordButtonProps {
  campaignId: string;
  sessionId: string;
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
  const [state, setState] = useState<RecordState>(() => {
    if (initialStatus === 'pending' || initialStatus === 'processing') return initialStatus;
    if (initialStatus === 'done') return 'done';
    if (initialStatus === 'error') return 'error';
    return 'idle';
  });
  const [errorMsg, setErrorMsg] = useState(initialStatus === 'error' ? (initialError ?? '') : '');
  const [elapsed, setElapsed] = useState(0);
  const [uploadProgress, setUploadProgress] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll when pending/processing
  useEffect(() => {
    if (state !== 'pending' && state !== 'processing') {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/sessions/${sessionId}`);
        if (!res.ok) return;
        const data = await res.json();
        const log = data.session;
        if (log.transcriptStatus === 'done') {
          setState('done');
          onTranscriptReady(log.rawTranscript ?? '');
        } else if (log.transcriptStatus === 'error') {
          setState('error');
          setErrorMsg(log.transcriptError ?? 'Transcription failed');
        } else if (log.transcriptStatus === 'processing') {
          setState('processing');
        }
      } catch { /* ignore poll errors */ }
    }, 30_000);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [state, campaignId, sessionId, onTranscriptReady]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = handleUpload;
      recorder.start(1000); // collect chunks every second

      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
      setState('recording');
    } catch (e: any) {
      setErrorMsg(e?.message?.includes('Permission')
        ? 'Microphone permission denied. Allow microphone access in your browser and try again.'
        : `Could not start recording: ${e?.message}`);
      setState('error');
    }
  }

  function stopRecording() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    streamRef.current?.getTracks().forEach(t => t.stop());
    mediaRecorderRef.current?.stop();
    setState('uploading');
  }

  async function handleUpload() {
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
    const sizeMB = (blob.size / 1024 / 1024).toFixed(1);
    setUploadProgress(`Uploading ${sizeMB} MB…`);

    try {
      const form = new FormData();
      form.append('audio', blob, 'session.webm');

      const res = await fetch(
        `/api/campaigns/${campaignId}/sessions/${sessionId}/transcribe`,
        { method: 'POST', body: form }
      );

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `Upload failed (${res.status})`);
      }

      setState('pending');
      setUploadProgress('');
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Upload failed');
      setState('error');
      setUploadProgress('');
    }
  }

  async function handleRetry() {
    // Clear the error state on the server
    await fetch(`/api/campaigns/${campaignId}/sessions/${sessionId}/transcribe`, {
      method: 'DELETE',
    }).catch(() => {});
    setState('idle');
    setErrorMsg('');
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (state === 'done') {
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
      </div>
    );
  }

  if (state === 'pending' || state === 'processing') {
    return (
      <div style={{
        padding: '14px 16px', background: 'rgba(201,162,39,0.06)',
        border: '1.5px solid rgba(201,162,39,0.4)', borderRadius: 5,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 18 }}>⏳</span>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
            Transcription {state === 'pending' ? 'queued' : 'in progress'}…
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

  if (state === 'error') {
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
        {errorMsg && (
          <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10, fontStyle: 'italic' }}>
            {errorMsg}
          </div>
        )}
        <button className="ink-btn ghost" style={{ fontSize: 11 }} onClick={handleRetry}>
          ↺ Try again
        </button>
      </div>
    );
  }

  if (state === 'uploading') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', background: 'var(--parchment-dark)',
        border: '1.5px solid var(--border-light)', borderRadius: 5,
      }}>
        <span style={{ fontSize: 16 }}>📤</span>
        <span style={{ fontSize: 13, color: 'var(--ink)', fontStyle: 'italic' }}>
          {uploadProgress || 'Preparing upload…'}
        </span>
      </div>
    );
  }

  if (state === 'recording') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 14px', background: 'rgba(139,26,26,0.06)',
        border: '1.5px solid var(--red)', borderRadius: 5,
      }}>
        {/* Pulsing dot */}
        <span style={{
          width: 10, height: 10, borderRadius: '50%', background: 'var(--red)',
          display: 'inline-block', animation: 'pulse 1s ease-in-out infinite',
          flexShrink: 0,
        }} />
        <span style={{
          fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700,
          color: 'var(--red)', minWidth: 60,
        }}>
          {formatDuration(elapsed)}
        </span>
        <span style={{ fontSize: 12, color: 'var(--border)', flex: 1 }}>
          Recording…
        </span>
        <button
          className="ink-btn danger"
          style={{ fontSize: 12 }}
          onClick={stopRecording}
        >
          ⏹ Stop &amp; Upload
        </button>
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
      </div>
    );
  }

  // idle
  return (
    <div>
      <button
        className="ink-btn"
        style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}
        onClick={startRecording}
      >
        <span style={{ fontSize: 16 }}>🎙</span>
        Record Audio
      </button>
      <div style={{ fontSize: 11, color: 'var(--border)', fontStyle: 'italic', marginTop: 6 }}>
        Records in your browser — audio is uploaded to the server when you stop, then
        transcribed by faster-whisper in the background. Safe to close this page after uploading.
      </div>
    </div>
  );
}

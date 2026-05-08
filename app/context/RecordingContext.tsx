'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { saveRecording, deleteRecording } from '@/lib/recordingStore';

export type RecordState =
  | 'idle' | 'recording' | 'paused' | 'uploading'
  | 'pending' | 'processing' | 'done' | 'error';

interface RecordingContextValue {
  recordingState: RecordState;
  activeSessionId: string | null;
  activeCampaignId: string | null;
  elapsed: number;
  uploadProgress: string;
  errorMsg: string;
  completedTranscript: string;
  startRecording: (campaignId: string, sessionId: string) => Promise<void>;
  stopRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  handleRetry: () => Promise<void>;
  clearCompleted: () => void;
  recoverRecording: (campaignId: string, sessionId: string, blob: Blob, elapsed: number) => void;
}

const RecordingContext = createContext<RecordingContextValue | null>(null);

export function useRecording() {
  const ctx = useContext(RecordingContext);
  if (!ctx) throw new Error('useRecording must be used within RecordingProvider');
  return ctx;
}

export function RecordingProvider({ children }: { children: React.ReactNode }) {
  const [recordingState, setRecordingState] = useState<RecordState>('idle');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [uploadProgress, setUploadProgress] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [completedTranscript, setCompletedTranscript] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const snapshotRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Keep current sessionId/campaignId accessible inside interval callbacks
  const activeSessionIdRef = useRef<string | null>(null);
  const activeCampaignIdRef = useRef<string | null>(null);
  const elapsedRef = useRef(0);

  // Keep refs in sync with state
  useEffect(() => { activeSessionIdRef.current = activeSessionId; }, [activeSessionId]);
  useEffect(() => { activeCampaignIdRef.current = activeCampaignId; }, [activeCampaignId]);
  useEffect(() => { elapsedRef.current = elapsed; }, [elapsed]);

  // Warn before tab close / refresh when recording or uploading
  useEffect(() => {
    const shouldWarn = (
      recordingState === 'recording' ||
      recordingState === 'paused' ||
      recordingState === 'uploading'
    );
    if (!shouldWarn) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [recordingState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      if (snapshotRef.current) clearInterval(snapshotRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // Poll while pending/processing
  useEffect(() => {
    if (recordingState !== 'pending' && recordingState !== 'processing') {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    if (!activeSessionId || !activeCampaignId) return;

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/campaigns/${activeCampaignId}/sessions/${activeSessionId}`);
        if (!res.ok) return;
        const data = await res.json();
        const log = data.session;
        if (log.transcriptStatus === 'done') {
          setRecordingState('done');
          setCompletedTranscript(log.rawTranscript ?? '');
        } else if (log.transcriptStatus === 'error') {
          setRecordingState('error');
          setErrorMsg(log.transcriptError ?? 'Transcription failed');
        } else if (log.transcriptStatus === 'processing') {
          setRecordingState('processing');
        }
      } catch { /* ignore poll errors */ }
    }, 30_000);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [recordingState, activeSessionId, activeCampaignId]);

  function startSnapshotInterval() {
    if (snapshotRef.current) clearInterval(snapshotRef.current);
    snapshotRef.current = setInterval(() => {
      const sid = activeSessionIdRef.current;
      const cid = activeCampaignIdRef.current;
      if (sid && cid && chunksRef.current.length > 0) {
        saveRecording(sid, cid, chunksRef.current, elapsedRef.current).catch(() => {});
      }
    }, 30_000);
  }

  function stopSnapshotInterval() {
    if (snapshotRef.current) { clearInterval(snapshotRef.current); snapshotRef.current = null; }
  }

  const startRecording = useCallback(async (campaignId: string, sessionId: string) => {
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
      recorder.onstop = () => handleUpload(campaignId, sessionId);
      recorder.start(1000);

      setActiveCampaignId(campaignId);
      setActiveSessionId(sessionId);
      activeSessionIdRef.current = sessionId;
      activeCampaignIdRef.current = campaignId;
      setElapsed(0);
      elapsedRef.current = 0;
      setErrorMsg('');
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
      startSnapshotInterval();
      setRecordingState('recording');
    } catch (e: any) {
      setErrorMsg(e?.message?.includes('Permission')
        ? 'Microphone permission denied. Allow microphone access and try again.'
        : `Could not start recording: ${e?.message}`);
      setRecordingState('error');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pauseRecording = useCallback(() => {
    mediaRecorderRef.current?.pause();
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    stopSnapshotInterval();
    // Save snapshot immediately on pause
    const sid = activeSessionIdRef.current;
    const cid = activeCampaignIdRef.current;
    if (sid && cid && chunksRef.current.length > 0) {
      saveRecording(sid, cid, chunksRef.current, elapsedRef.current).catch(() => {});
    }
    setRecordingState('paused');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resumeRecording = useCallback(() => {
    mediaRecorderRef.current?.resume();
    timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    startSnapshotInterval();
    setRecordingState('recording');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopRecording = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    stopSnapshotInterval();
    streamRef.current?.getTracks().forEach(t => t.stop());
    mediaRecorderRef.current?.stop();
    setRecordingState('uploading');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUpload(campaignId: string, sessionId: string, recoveredBlob?: Blob) {
    const blob = recoveredBlob ?? new Blob(chunksRef.current, { type: 'audio/webm' });
    const sizeMB = (blob.size / 1024 / 1024).toFixed(1);
    setUploadProgress(`0% — 0 of ${sizeMB} MB`);

    try {
      const form = new FormData();
      form.append('audio', blob, 'session.webm');

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `/api/campaigns/${campaignId}/sessions/${sessionId}/transcribe`);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            const loadedMB = (e.loaded / 1024 / 1024).toFixed(1);
            setUploadProgress(`${pct}% — ${loadedMB} of ${sizeMB} MB`);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            try {
              reject(new Error(JSON.parse(xhr.responseText).error ?? `Upload failed (${xhr.status})`));
            } catch {
              reject(new Error(`Upload failed (${xhr.status})`));
            }
          }
        };
        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.send(form);
      });

      // Upload succeeded — clear the crash-recovery snapshot
      deleteRecording(sessionId).catch(() => {});
      setRecordingState('pending');
      setUploadProgress('');
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Upload failed');
      setRecordingState('error');
      setUploadProgress('');
    }
  }

  // Called by RecordButton when the user chooses to recover a saved recording
  const recoverRecording = useCallback((
    campaignId: string,
    sessionId: string,
    blob: Blob,
    savedElapsed: number,
  ) => {
    setActiveCampaignId(campaignId);
    setActiveSessionId(sessionId);
    activeSessionIdRef.current = sessionId;
    activeCampaignIdRef.current = campaignId;
    setElapsed(savedElapsed);
    elapsedRef.current = savedElapsed;
    setRecordingState('uploading');
    handleUpload(campaignId, sessionId, blob);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRetry = useCallback(async () => {
    if (!activeCampaignId || !activeSessionId) return;
    await fetch(`/api/campaigns/${activeCampaignId}/sessions/${activeSessionId}/transcribe`, {
      method: 'DELETE',
    }).catch(() => {});
    setRecordingState('idle');
    setErrorMsg('');
    setActiveSessionId(null);
    setActiveCampaignId(null);
  }, [activeCampaignId, activeSessionId]);

  const clearCompleted = useCallback(() => {
    setRecordingState('idle');
    setActiveSessionId(null);
    setActiveCampaignId(null);
    setCompletedTranscript('');
  }, []);

  return (
    <RecordingContext.Provider value={{
      recordingState, activeSessionId, activeCampaignId,
      elapsed, uploadProgress, errorMsg, completedTranscript,
      startRecording, stopRecording, pauseRecording, resumeRecording,
      handleRetry, clearCompleted, recoverRecording,
    }}>
      {children}
    </RecordingContext.Provider>
  );
}

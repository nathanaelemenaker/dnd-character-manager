/**
 * IndexedDB store for crash-recovery of in-progress audio recordings.
 * Saves a snapshot of the assembled audio blob every 30 seconds while recording.
 * On page reload, the session page can detect a saved recording and offer to re-upload it.
 */

const DB_NAME = 'dnd-sheet-recordings';
const DB_VERSION = 1;
const STORE = 'recordings';

export interface SavedRecording {
  sessionId: string;
  campaignId: string;
  blob: Blob;
  elapsed: number;   // seconds recorded at time of snapshot
  savedAt: number;   // Date.now()
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'sessionId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveRecording(
  sessionId: string,
  campaignId: string,
  chunks: Blob[],
  elapsed: number,
): Promise<void> {
  if (!chunks.length) return;
  const blob = new Blob(chunks, { type: 'audio/webm' });
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ sessionId, campaignId, blob, elapsed, savedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadRecording(sessionId: string): Promise<SavedRecording | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(sessionId);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteRecording(sessionId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(sessionId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

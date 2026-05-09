// app/lib/claudeCache.ts
// Client-side localStorage cache for Claude API lookups (race traits, subclass guides, etc.)
// Cached results expire after TTL_MS (default 7 days) to pick up any future corrections.

const PREFIX = 'dnd_claude_cache:';
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CacheEntry {
  value: string;
  expiresAt: number;
}

function cacheKey(type: string, identifier: string): string {
  return PREFIX + type + ':' + identifier.toLowerCase().replace(/\s+/g, '_');
}

export function cacheGet(type: string, identifier: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(cacheKey(type, identifier));
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() > entry.expiresAt) {
      localStorage.removeItem(cacheKey(type, identifier));
      return null;
    }
    return entry.value;
  } catch {
    return null;
  }
}

export function cacheSet(type: string, identifier: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    const entry: CacheEntry = { value, expiresAt: Date.now() + TTL_MS };
    localStorage.setItem(cacheKey(type, identifier), JSON.stringify(entry));
  } catch {
    // Storage full or unavailable — fail silently
  }
}

export function cacheClear(type?: string): void {
  if (typeof window === 'undefined') return;
  try {
    const keysToDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith(type ? PREFIX + type : PREFIX)) keysToDelete.push(k);
    }
    keysToDelete.forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

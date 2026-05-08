'use client';

import { useEffect } from 'react';
import { RecordingProvider } from '@/context/RecordingContext';
import FloatingRecordingBar from './FloatingRecordingBar';

// Inline script injected into <head> to apply theme before first paint (no flash)
const themeScript = `
(function() {
  try {
    var t = localStorage.getItem('dnd-theme');
    document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light');
  } catch(e) {}
})();
`;

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  // Register service worker for PWA / offline support
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {/* silently ignore */});
    }
  }, []);

  return (
    <>
      {/* Apply saved theme before first paint to prevent flash */}
      <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      <RecordingProvider>
        {children}
        <FloatingRecordingBar />
      </RecordingProvider>
    </>
  );
}

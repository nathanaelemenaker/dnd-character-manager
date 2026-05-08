'use client';

import { RecordingProvider } from '@/context/RecordingContext';
import FloatingRecordingBar from './FloatingRecordingBar';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <RecordingProvider>
      {children}
      <FloatingRecordingBar />
    </RecordingProvider>
  );
}

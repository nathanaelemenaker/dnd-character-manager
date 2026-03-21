// app/layout.tsx
import './globals.css'; // keep if you have it; remove if not present
import type { Metadata } from 'next';
import TopNav from './components/TopNav';

export const metadata: Metadata = {
  title: 'D&D Sheet',
  description: 'Character manager',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, Arial, sans-serif' }}>
        {/* Global top navigation with admin indicator + tab (SSR; no flicker) */}
        <TopNav />
        <main style={{ padding: '0.75rem', display: 'grid', gap: '1rem' }}>{children}</main>
      </body>
    </html>
  );
}

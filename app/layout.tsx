// app/layout.tsx
import './globals.css';
import type { Metadata } from 'next';
import TopNav from './components/TopNav';

export const metadata: Metadata = {
  title: 'D&D 5e Character Manager',
  description: 'Self-hosted D&D 5e character sheet manager',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <TopNav />
        <main style={{ padding: '0.75rem' }}>{children}</main>
      </body>
    </html>
  );
}

// app/layout.tsx
import './globals.css';
import type { Metadata } from 'next';
import TopNav from './components/TopNav';
import ClientLayout from './components/ClientLayout';

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
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#1a1a1a" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="DnD Sheet" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body>
        <ClientLayout>
          <TopNav />
          <main style={{ padding: '0.75rem', paddingBottom: '3.5rem' }}>{children}</main>
        </ClientLayout>
      </body>
    </html>
  );
}

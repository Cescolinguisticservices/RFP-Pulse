import type { Metadata } from 'next';

import { NextAuthSessionProvider } from '@/components/session-provider';

import './globals.css';

export const metadata: Metadata = {
  title: 'RFP Pulse',
  description: 'AI-driven multi-tenant RFP response management.',
};

export default function RootLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <NextAuthSessionProvider>{children}</NextAuthSessionProvider>
      </body>
    </html>
  );
}

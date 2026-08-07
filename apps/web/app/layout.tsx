import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import AppProviders from '@/components/AppProviders';
import AppShell from '@/components/AppShell';
import './themes.css';

export const metadata: Metadata = {
  title: 'Game of Life Studio',
  description: 'Multi-organism Game of Life battle simulator',
};

// data-theme is hardcoded this story — there is only one theme (Clinical Lab), so there is
// nothing yet to read from gol:settings and nothing to flash. The FOUC inline script (AR-37) and
// the gol:settings read belong to Story 6.5, once a second theme exists to switch to. Do not add
// an inline <script>, do not read gol:settings here, do not add suppressHydrationWarning.
//
// Stays a SERVER component — ThemeProvider/styled()/sx all require 'use client' (Emotion has no
// RSC support), which is why that boundary starts one level down in AppProviders instead of here.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="clinical-lab">
      <body>
        <AppProviders>
          <AppShell>{children}</AppShell>
        </AppProviders>
      </body>
    </html>
  );
}

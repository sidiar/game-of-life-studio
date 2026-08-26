import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import AppProviders from '@/components/layout/AppProviders';
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
//
// AppShell is deliberately NOT mounted here (this story). A root-layout shell renders on EVERY
// route, and the battle route's chrome is the battle title alone — the two shells belong to route
// groups now: app/(gallery)/layout.tsx wears AppShell, app/(battle)/layout.tsx is the battle
// chassis. This layout keeps only what genuinely is global: the document, the token layer, and the
// provider stack. Note that the <main> landmark moved with the shells, so this file owns none.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="clinical-lab">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}

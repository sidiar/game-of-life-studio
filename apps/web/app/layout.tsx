import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import AppProviders from '@/components/layout/AppProviders';
import './themes.css';

const SITE_URL = 'https://game-of-life-studio.com';
const SITE_NAME = 'Game of Life Studio';
const DESCRIPTION =
  'Design organisms with their own rules, drop them into one petri dish, and watch a ' +
  'multi-organism Game of Life battle play out in your browser.';

// The site's identity for search engines and link previews (LinkedIn, dev.to, Slack, X).
// metadataBase turns the file-convention images (app/opengraph-image.png, app/icon.svg) into the
// absolute URLs crawlers require. A route that sets only `title` inherits everything else here,
// but Next does NOT merge nested `openGraph` objects — a route that sets its own `openGraph`
// replaces this one wholesale.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: 'Ariel Sidi', url: 'https://www.linkedin.com/in/arielsidi/' }],
  creator: 'Ariel Sidi',
  keywords: ["Conway's Game of Life", 'cellular automata', 'simulation', 'Next.js'],
  openGraph: {
    type: 'website',
    url: '/',
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: DESCRIPTION,
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_NAME,
    description: DESCRIPTION,
  },
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

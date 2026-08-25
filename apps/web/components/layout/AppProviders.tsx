'use client';

import type { ReactNode } from 'react';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import golTheme from '@/lib/theme';

// output: 'export' prerenders every route at build time, so Emotion runs on the server.
// AppRouterCacheProvider collects those server-inserted <style> tags into the streamed HTML so
// hydration doesn't re-insert them — without it, the static export flashes unstyled content on
// first paint (NFR-8.5) even though `next dev` looks fine, because dev streams styles in and
// never exercises this path (Story 1.9 Dev Notes, silent-failure trap).
//
// v16-appRouter is the versioned entry point matching this repo's Next major; it re-exports the
// v13 implementation under the hood.
export default function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AppRouterCacheProvider options={{ key: 'gol' }}>
      <ThemeProvider theme={golTheme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}

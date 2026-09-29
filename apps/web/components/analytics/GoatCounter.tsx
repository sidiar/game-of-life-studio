'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';

// Visit counting with GoatCounter (https://www.goatcounter.com): no cookies and no personal data,
// so no consent banner. The dashboard is https://gols.goatcounter.com.
export const GOATCOUNTER_ENDPOINT = 'https://gols.goatcounter.com/count';
export const GOATCOUNTER_SCRIPT = 'https://gc.zgo.at/count.js';
export const PRODUCTION_HOST = 'game-of-life-studio.com';

declare global {
  interface Window {
    goatcounter?: { count?: (vars: { path: string }) => void };
  }
}

/** Only the deployed site counts — never `next dev`, the e2e server, CI or a preview host. */
export function isProductionHost(hostname: string): boolean {
  return hostname === PRODUCTION_HOST || hostname === `www.${PRODUCTION_HOST}`;
}

const subscribeNever = () => () => {};

/**
 * count.js counts the document load on its own, but App Router navigations never reload the
 * document — so every later pathname change is counted here. The first pathname seen is skipped:
 * it is the load count.js already records.
 */
export function usePageviewCounter(enabled: boolean, pathname: string) {
  const lastCounted = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (lastCounted.current === null) {
      lastCounted.current = pathname;
      return;
    }
    if (lastCounted.current === pathname) return;
    lastCounted.current = pathname;
    window.goatcounter?.count?.({ path: pathname });
  }, [enabled, pathname]);
}

/** Appends count.js once, as the snippet from the GoatCounter dashboard would. */
function injectCountScript() {
  if (document.querySelector(`script[src="${GOATCOUNTER_SCRIPT}"]`)) return;
  const script = document.createElement('script');
  script.async = true;
  script.src = GOATCOUNTER_SCRIPT;
  script.dataset.goatcounter = GOATCOUNTER_ENDPOINT;
  document.body.appendChild(script);
}

export default function GoatCounter() {
  const pathname = usePathname();
  // useSyncExternalStore, not useState + useEffect: the server snapshot (false) keeps the static
  // export free of the script, and the client snapshot reads the real hostname after hydration.
  const enabled = useSyncExternalStore(
    subscribeNever,
    () => isProductionHost(window.location.hostname),
    () => false,
  );

  // A plain DOM append, not next/script: <Script> pulls ~4.6 KB gzip of loader into every
  // route's first-load JS to insert one async tag.
  useEffect(() => {
    if (enabled) injectCountScript();
  }, [enabled]);
  usePageviewCounter(enabled, pathname);

  return null;
}

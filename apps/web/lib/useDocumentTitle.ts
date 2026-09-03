'use client';

import { useEffect, useRef } from 'react';

/**
 * Keeps `document.title` in sync with a value the page owns, and puts every hazard that job turns
 * out to carry in ONE place. Extracted from `<BattlePage>` (2026-09-03), where it was Story 2.11's
 * AC6; the page now states WHAT the tab should read and this file holds HOW that is made to stick.
 *
 * `null` means **claim nothing** — still loading, not found, errored. It stops the re-assertion
 * below without inventing a title, so the tab keeps reading whatever was there on mount.
 *
 * ⚠️ ONE MOUNTED CONSUMER AT A TIME. The pre-existing title is captured on mount and restored on
 * unmount, so two overlapping instances would have the second capture the FIRST's title and then
 * restore it — stranding a stale name in the tab. Today that cannot happen (one `<BattlePage>`, and
 * Architecture Decision K unmounts routes hard), and the dev-only guard below reports it the moment
 * it stops being true rather than leaving the next consumer to discover it as a cosmetic mystery.
 *
 * ⚠️ Not usable from `packages/*` — `document` is a DOM type and only `apps/web` has the `dom` lib.
 *
 * ❌ No `typeof document` guard: `useEffect` never runs during the static export's prerender. (The
 * `colors` memo in `<BattlePage>` DOES need one, because it runs during render — not a convention
 * to copy from there to here.)
 */

// Dev-only, and module-scope on purpose: it counts instances across the whole app, which is exactly
// the scope the capture/restore contract is stated in. Never read in production — the guard costs
// one increment per mount and the warning is what has value, not the count.
let mountedInstances = 0;

export function useDocumentTitle(title: string | null): void {
  // What the observer below re-asserts. A ref, not state: it is written from one effect and read
  // from a callback the OTHER effect owns, and nothing renders it — routing it through state would
  // add a commit per keystroke to change something that lives outside React entirely.
  const desiredTitleRef = useRef<string | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    mountedInstances += 1;
    if (mountedInstances > 1) {
      console.error(
        `useDocumentTitle: ${mountedInstances} instances are mounted at once. This hook captures ` +
          'and restores the pre-existing document.title, so overlapping instances will restore ' +
          "each other's titles and strand a stale one in the tab. Give the shared title one owner, " +
          'or make the capture a module-level stack.',
      );
    }
    return () => {
      mountedInstances -= 1;
    };
  }, []);

  /**
   * The observer, and the pre-existing title's capture-and-restore. Both live in THIS effect
   * because they share `previousTitle`: the value must be read at the same moment the observer is
   * installed, or the "title before anyone claimed it" the cleanup restores is not the one that was
   * actually there.
   *
   * ⚠️ Correction to the comment this was extracted from (2026-09-03), which said the two were
   * split across the cleanup in a load-bearing ORDER — disconnect before restore, or "the observer
   * fights its own unmount". Measured in jsdom: it does not. Both statements run synchronously in
   * one task, and `MutationObserver.disconnect()` EMPTIES the record queue, so the record for the
   * restore write is discarded and no callback is ever delivered — with either ordering. The order
   * below is kept as the clearer one to read, not as a guarantee anything depends on. Do not
   * reintroduce the ordering claim; it does not survive a mutation test (reversing the two lines
   * reddens nothing, which is how this was found).
   *
   * Why an observer at all, discovered empirically rather than documented anywhere: Next 16's App
   * Router metadata (the `MetadataBoundary` / `OutletBoundary` machinery behind `export const
   * metadata` in `app/layout.tsx`) commits the root layout's STATIC `<title>` into the real DOM
   * once, ASYNCHRONOUSLY, during initial hydration — observed (against the BUILT static export
   * served from `out/`, never against `next dev`) landing strictly AFTER the consumer's own first
   * title write, on every load. A plain `document.title = …` effect loses that race and leaves the
   * tab reading the static app name at rest until the next keystroke forces a second write. The
   * observer re-asserts synchronously whenever anything else changes the title, which defeats the
   * race without depending on ITS timing — a `requestAnimationFrame` or `setTimeout` delay would be
   * a guess at a framework internal that owes no stability contract.
   *
   * A client navigation away must not leave the tab reading the last entity's name: Next may not
   * rewrite a `<title>` it believes is unchanged between two `'use client'` routes sharing one
   * static `metadata.title`, which is what the restore is for.
   */
  useEffect(() => {
    const previousTitle = document.title;

    // ⚠️ The re-assertions are BOUNDED, and that bound is the whole safety story. A
    // `MutationObserver` callback that writes back what it just observed re-queues itself as a
    // MICROTASK, so two agents that each insist on their own title never reach a fixed point and
    // the microtask queue never drains — the event loop starves and the tab freezes hard (no paint,
    // no timers, no input, no CDP; verified against the built export in review, where the page
    // never recovered). The whitespace read-back below closes the one instance of this found in
    // development; this counter closes the CLASS, for every other title writer a consumer cannot
    // know about (a second instance in a test, a browser extension, an analytics snippet, a later
    // story that prefixes a dirty marker). The race being defended against needs exactly ONE
    // correction, so a budget this generous cannot be reached by legitimate use: re-writing the
    // SAME title never spends it, because the equality check short-circuits first. Losing the tab
    // title is a cosmetic failure; hanging the page is not, so this fights a fixed number of rounds
    // and then loses loudly rather than wedging the tab.
    const MAX_TITLE_CORRECTIONS = 10;
    let corrections = 0;

    const observer = new MutationObserver(() => {
      if (desiredTitleRef.current === null || document.title === desiredTitleRef.current) return;
      if (corrections >= MAX_TITLE_CORRECTIONS) {
        observer.disconnect();
        return;
      }
      corrections += 1;
      document.title = desiredTitleRef.current;
    });
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });

    return () => {
      observer.disconnect();
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    // ⚠️ Nulling the ref only STOPS re-asserting; it does not UNDO a title already written. A
    // consumer that goes from a real title to `null` on a MOUNTED instance therefore strands the
    // old one in the tab — `deferred-work.md`'s `battleId`-swap entry, unreachable while every
    // consumer reaches this state only before its first write or after a hard route unmount.
    if (title === null) {
      desiredTitleRef.current = null;
      return;
    }

    document.title = title;

    // Read back what the browser actually STORED, not the string just assigned. The HTML spec's
    // `document.title` getter strips and collapses ASCII whitespace, so a value ending in a space
    // (an entirely normal mid-typing state, e.g. "New ") goes in as "New  · Suffix" (two spaces)
    // and comes back out as "New · Suffix" (one). Storing the un-normalised string would make the
    // observer's `document.title !== desiredTitleRef.current` comparison PERMANENTLY TRUE — browser
    // normalises, observer reassigns, browser normalises again — a same-tick re-trigger loop with
    // no macrotask in between, which starves the event loop and hangs every further keystroke and,
    // from outside the page, every further Playwright/CDP command. Found by an e2e that typed a
    // literal space.
    desiredTitleRef.current = document.title;
  }, [title]);
}

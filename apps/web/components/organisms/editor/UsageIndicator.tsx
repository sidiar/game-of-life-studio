'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { styled } from '@mui/material/styles';
import { battleCountLabel, ruleTargetCountLabel } from '@/lib/organisms/usageLabels';

/**
 * FR-1.7's usage indicator, the editor footer's only content (Story 4.20, UX-DR6): "Used in [N]
 * Battle(s)" always, "Targeted by [M] organism rule(s)" only when M > 0, each with a read-only
 * disclosure listing the names behind its count.
 *
 * ⚠️ It DERIVES NOTHING (FD11). The counts and the names are resolved at `<OrganismEditorModal>`,
 * from the ONE `resolveOrganismUsage` / `buildRuleReferenceIndex` pair every surface reads
 * (Decision H, Decision E.5), and arrive here as a `string[]` and a number — the same split
 * `<OrganismCard>` and `resolveDisplayOrganisms` already use. Nothing from `@gol/domain` is
 * imported here, and adding an import of it would be the second derivation the consistency AC
 * exists to prevent.
 *
 * ⚠️ NOT a MUI `Popover` (FD3). A `Popover` IS a `Modal`, so it would nest a second focus trap and
 * a second `aria-hidden` layer inside the fullScreen editor `Dialog` — the interaction class
 * `project-context.md`'s live-region/`inert` rule records — for a panel that needs neither: the
 * only focusable thing in one is its own scroll region, and nothing in it is INTERACTIVE (FR-1.7,
 * M7 — names only, no link, no navigation, the editor may be a modal over an in-progress battle).
 * A plain absolutely-positioned panel is also what the mockup itself implements.
 *
 * Two independent disclosures, not one shared panel (FD12): `organism-editor-design.md:120` reads
 * as one ("the popover gains a second read-only section"), but written that way the `N = 0, M > 0`
 * case needs a trigger that is text when one count is zero and a button when the other is not —
 * making AC3's "zero renders without expansion" depend on a count it is not about. Recorded as a
 * deliberate divergence for the next UX touch.
 *
 * `D1`–`D5` below are the owner's review decisions on this story, recorded in
 * `docs/implementation-artifacts/4-20-usage-visibility-ui.md` (Review Findings) — that file is
 * where each label resolves; `spec:check` does not know them.
 */

type PanelKey = 'battles' | 'rules';

export interface UsageIndicatorProps {
  /** The battle names behind N, in `resolveOrganismUsage` entry order — already resolved through
   * `battleDisplayName` (`usageBattleNames`). ⚠️ Its LENGTH is N: there is no second count prop,
   * so the label and the list cannot disagree (AC5). */
  battleNames: readonly string[];
  /**
   * M — a count of RULES (`index.get(id)?.length ?? 0` over `buildRuleReferenceIndex`), which is
   * NOT `referencingNames.length`: one organism targeting this one from two rules is `M = 2` with
   * one name (Decision E.5, FD13). Hence a prop of its own.
   */
  ruleCount: number;
  /** The DISTINCT organism names behind M (`referencingOrganismNames`), already resolved through
   * the `Unnamed organism` fallback. */
  referencingNames: readonly string[];
}

// Mockup: `.editor-footer`'s content row (`clinical-lab-theme/organism-editor.html:818-828`) minus
// its `justify-content: space-between`, which exists there to push the mockup's Save button to the
// far end. Save stays in the header (FD1), so the two labels simply sit side by side.
const Row = styled('div')({
  display: 'flex',
  alignItems: 'center',
  gap: '25px',
  flexWrap: 'wrap',
});

// The panel is absolutely positioned against its own label, so each label is a containing block.
const Note = styled('div')({
  position: 'relative',
});

// Mockup: `.footer-usage-note` (`:325-335`). `cursor: pointer` and the accent live on the
// `Trigger` below — a zero count is not clickable, so neither belongs to the shared rules.
const noteRules = {
  fontSize: '11px',
  color: 'var(--gol-text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
} as const;

const NoteText = styled('span')(noteRules);

// `<BackButton>`'s reset, shrunk to a text-sized control: a real `<button>` (this is a disclosure,
// not a decoration) with no chrome of its own.
//
// ⚠️ No `transition`. The mockup's `.footer-usage-note` has none either, but every styled control
// in this editor carries the note: a scan landing mid-fade measures a contrast no settled state
// has (Stories 2.13/2.14/2.15 each lost one there).
//
// The mockup paints the COUNT in `--gol-accent` (`.footer-usage-note strong`). The label is one
// exported string here (AC5 — the footer and `<OrganismInUseDialog>` must not be able to disagree
// about the copy), so there is no element around the digits to colour; the accent lands on the
// disclosure caret and the mockup's hover underline instead. `--gol-accent` on every background is
// already gated ≥ 4.5:1 (`themeTokens.test.ts`), so the caret is legible, not decorative-only.
const Trigger = styled('button')({
  ...noteRules,
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  background: 'transparent',
  border: 'none',
  padding: 0,
  fontFamily: 'inherit',
  fontWeight: 400,
  cursor: 'pointer',
  '&:hover': {
    textDecoration: 'underline',
  },
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
  },
});

const Caret = styled('span')({
  color: 'var(--gol-accent)',
  fontWeight: 600,
});

// Mockup: `.usage-popover` (`:348-361`). `bottom: 150%` opens it UPWARD — the footer is the last
// thing in the editor, so a panel below it would open off-viewport.
//
// The mockup's `box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5)` is `--gol-shadow-tooltip` here: AR-46
// bans the `rgba()` literal in a component, and that token is already the house's "floating over
// content" black shadow (the organism-dot tooltip's). The mockup's own `text-transform: none` /
// `letter-spacing: normal` resets are kept — the panel sits inside an uppercased, letter-spaced
// label and its names are prose.
//
// `maxWidth` pairs with `NameItem`'s single-line truncation below: without it a 100-character
// battle name (`MAX_BATTLE_NAME_LENGTH`) sets the panel's width instead, and nothing would be
// truncated (owner's decision on review item D2, 2026-09-24).
const Panel = styled('div')({
  position: 'absolute',
  bottom: '150%',
  left: 0,
  minWidth: '200px',
  maxWidth: '320px',
  background: 'var(--gol-bg-hover)',
  border: '1px solid var(--gol-border)',
  padding: '10px 12px',
  zIndex: 30,
  boxShadow: 'var(--gol-shadow-tooltip)',
  textTransform: 'none',
  letterSpacing: 'normal',
});

// Mockup: `.usage-popover-title`.
const PanelTitle = styled('p')({
  fontSize: '10px',
  color: 'var(--gol-text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  margin: '0 0 8px',
});

// Mockup: `.usage-popover ul` / `li`, minus the `li::before` `⚔` glyph — a generated-content glyph
// is read by some screen readers as part of the name, and this list is the accessible answer to
// "which battles", not decoration.
// ⚠️ The list, not the `Panel`, is the scroll region (owner's decision on review item D2,
// 2026-09-24): the panel opens UPWARD from the last row of the editor, so an organism placed in
// more battles than fit between the footer and the viewport top had its FIRST names clipped off
// the top of the window and unreachable — nothing scrolled, and neither `toBeVisible` nor axe sees
// clipping. Capping the list rather than the whole panel keeps `PanelTitle` pinned above it.
//
// `tabIndex={0}` + an accessible name (`aria-labelledby` → `PanelTitle`, so the name is the title
// already on screen rather than a second string to keep in sync) is what axe's
// `scrollable-region-focusable` requires of a scrollable container with no focusable content — and
// it is why AC3's original "nothing inside either panel is focusable" is amended to "nothing
// inside it is interactive": the FR-1.7 / M7 constraint is about NAVIGATING away from an unsaved
// battle, which a scroll container cannot do.
const NameList = styled('ul')({
  listStyle: 'none',
  margin: 0,
  padding: 0,
  maxHeight: 'min(60vh, 400px)',
  overflowY: 'auto',
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
  },
});

// One line per name (owner's decision on review item D2, 2026-09-24), where this used to be
// `overflowWrap: 'anywhere'`: a long name wrapping over two or three rows inflates the very height
// `NameList`'s cap is bounding, and makes the row count unpredictable. The DOM keeps the FULL text,
// so a screen reader still reads the whole name — the truncation is visual only. The `…` is the
// browser's single-character ellipsis, which is the house rendering, not a deviation.
const NameItem = styled('li')({
  fontSize: '12px',
  color: 'var(--gol-text-primary)',
  padding: '4px 0',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

export default function UsageIndicator({
  battleNames,
  ruleCount,
  referencingNames,
}: UsageIndicatorProps) {
  // Ephemeral UI state (RFC-005 Decision 1): which ONE panel is open, never two booleans — "at
  // most one open at a time" is then the type's doing rather than a pair of effects keeping two
  // flags apart.
  const [openPanel, setOpenPanel] = useState<PanelKey | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // The trigger that opened the current panel — where Escape returns focus (AC4).
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const idPrefix = useId();

  // `trigger.focus()` on every open, not only where the engine already did it: on Safari (WebKit's
  // Mac port) a mouse click does NOT focus a `<button>` — form controls are not mouse-focusable
  // there — so without this, focus stays on the Dialog paper and "focus is on the trigger while
  // the panel is open" (AC4) is a Chromium fact rather than a browser guarantee. CI's WebKit is
  // the GTK port, which does focus on click, so the e2e matrix cannot see the difference.
  const toggle = useCallback((key: PanelKey, trigger: HTMLButtonElement) => {
    trigger.focus();
    openerRef.current = trigger;
    setOpenPanel((current) => (current === key ? null : key));
  }, []);

  // ⚠️ One press closes ONE layer (owner's decision on review item D5, 2026-09-24). A HELD Escape
  // used to close the panel and then the EDITOR: the effect below closes the panel on the first
  // keydown, React flushes and the effect's cleanup removes the listener long before the key's
  // auto-repeat arrives (a 250–500 ms OS delay, then a ~30 ms period), so the next repeated keydown
  // reached MUI's root handler — and with no dirty guard until Story 4.23, that takes the draft.
  // MUI's `useModal` does not check `event.repeat` either, so the guard lives here: once Escape has
  // closed a panel, every Escape keydown with `repeat` set is stopped until the matching keyup ends
  // the hold. A deliberate second press has `repeat === false`, so it still closes the editor.
  //
  // The armed listeners ARE the flag — the ref holds their disarm — and they are added imperatively
  // rather than from an effect on purpose: the effect below is armed on `openPanel`, so its cleanup
  // runs at the very moment the guard has to start. A keyup that never arrives (the window loses
  // focus mid-hold) leaves the guard armed, which is harmless: it only ever stops keydowns that
  // carry `repeat`, and those exist only inside a hold — which also means the keyup disarm is
  // hygiene with no observable effect (a fresh hold's first keydown never carries `repeat`), so
  // no test pins it. The guard's boundary is the flag itself: a platform that delivers
  // auto-repeat as keyup/keydown pairs without `repeat` (X11 without detectable auto-repeat, some
  // remote-desktop bridges) is outside it, and there a held Escape still closes both layers.
  const disarmRepeatGuardRef = useRef<(() => void) | null>(null);
  const swallowRepeatsUntilKeyUp = useCallback(() => {
    disarmRepeatGuardRef.current?.();
    function onRepeatedKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && event.repeat) event.stopPropagation();
    }
    function onKeyUp(event: KeyboardEvent) {
      if (event.key === 'Escape') disarm();
    }
    function disarm() {
      document.removeEventListener('keydown', onRepeatedKeyDown, true);
      document.removeEventListener('keyup', onKeyUp, true);
      disarmRepeatGuardRef.current = null;
    }
    document.addEventListener('keydown', onRepeatedKeyDown, true);
    document.addEventListener('keyup', onKeyUp, true);
    disarmRepeatGuardRef.current = disarm;
  }, []);

  // The guard outlives the panel by design, so unmount is the one close path that must disarm it.
  useEffect(() => () => disarmRepeatGuardRef.current?.(), []);

  // ⚠️ FD4 — the whole reason this listener exists. MUI's `Modal` handles Escape in a React
  // `onKeyDown` on the modal ROOT, an ancestor of this footer, so an unstopped `keydown` closes the
  // EDITOR and takes the user's unsaved draft with it — for a key press whose only visible effect
  // should be closing a list of names.
  //
  // A `document` CAPTURE listener, armed only while a panel is open (the `pointerdown` shape
  // below), rather than an `onKeyDown` on the footer: a React handler here sees only a keydown
  // whose TARGET is inside the footer, and two reachable paths put focus elsewhere with a panel
  // open — Tab / Shift+Tab out of the footer (the panel stays open, decision D1), and a Safari
  // click on the trigger (see `toggle`). A click inside the panel is NOT one of them since D2: it
  // lands focus on the name list's `tabIndex={0}` scroll region, still inside the footer — before
  // that it landed on the Dialog paper's `tabIndex=-1`, and was the path that first exposed this.
  // `stopPropagation` from a `document` CAPTURE listener cancels the BUBBLE phase, and MUI's
  // `useModal` handles Escape in a bubble-phase `onKeyDown` — that is what keeps the first Escape
  // from MUI. It is NOT that this listener runs before React's: in the App Router Next calls
  // `hydrateRoot(document)`, so React's delegated capture and bubble listeners sit on `document`
  // too, registered before ours, and an `onKeyDownCapture` anywhere in the tree would still see
  // the key. A second, DELIBERATE press — no panel open, and `repeat` false so the auto-repeat
  // guard above ignores it — falls through to the editor as it always has. Nothing else catches
  // this: it typechecks, the panel does close, and only an assertion that the editor is STILL
  // OPEN sees it (review, 2026-09-23 — reproduced on the local WebKit project before the listener
  // moved).
  //
  // ⚠️ Focus returns to the OPENER on every KEYBOARD path, including a keydown whose target is a
  // control the user chose — the name field, a rule `<select>`, or a native select popup opened
  // with Alt+Down, which dispatches its Escape at the document on Firefox and WebKit. That is
  // deliberately NOT what an outside POINTERDOWN does (decision D1: focus follows the press), and
  // the asymmetry is the conventional one, kept by the owner's decision on review item D4
  // (2026-09-24): a pointer user has chosen the spot focus lands on, a keyboard user has chosen
  // nothing and needs one defined landing place, which AC4 names as the trigger. Do NOT reconcile
  // the two dismissals into a single rule — they differ on purpose. The accepted cost is recorded
  // in `deferred-work.md` (Escape from a control outside the footer moves the caret off it), with
  // "restore only when the target is inside `rootRef`, the paper or `body`" as the named revisit.
  useEffect(() => {
    if (openPanel === null) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // An Escape that cancels an IME composition is the IME's, not ours: Firefox and WebKit
      // deliver it as `key: 'Escape'` with `isComposing` / `keyCode` 229 (D1 leaves a panel open
      // while focus is in the name field, so this is reachable). Mirror MUI's own root handler,
      // which skips `which === 229` — pass it through untouched, and MUI ignores it too.
      if (event.isComposing || event.keyCode === 229) return;
      event.stopPropagation();
      // A keydown carrying `repeat` is a HOLD that began before this panel opened (a panel opened
      // with Enter/Space mid-hold, while the guard below was already armed). Swallowing it keeps
      // the editor; NOT closing on it keeps D5's "one press closes one layer" — otherwise the
      // guard's `stopPropagation` leaves this sibling listener running and one hold takes two.
      if (event.repeat) return;
      setOpenPanel(null);
      openerRef.current?.focus();
      swallowRepeatsUntilKeyUp();
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [openPanel, swallowRepeatsUntilKeyUp]);

  // Outside dismissal, armed ONLY while a panel is open (FD5): the mockup keeps a permanent
  // `click` listener, which is one more thing to unbind correctly on every close path. Events
  // inside this footer are ignored, or the trigger's own press would close and immediately reopen
  // the panel (pointerdown closes, the click that follows toggles it back).
  useEffect(() => {
    if (openPanel === null) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) return;
      setOpenPanel(null);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [openPanel]);

  // No `autoFocus` into a panel: nothing in one is interactive, so opening moves focus nowhere but
  // the trigger (`toggle`), and Escape brings it back there (`openerRef`). An outside `pointerdown`
  // does NOT: focus follows the press — the field the user clicked, the list they scrolled, or the
  // paper — because a restore here would either be overridden by the click's own `mousedown` focus
  // or steal focus from a field the user chose. That is the owner's decision on review item D1
  // (2026-09-24), and it is why AC4 and Task 3 read "after Escape, focus is on the trigger": an
  // outside press is deliberately NOT a focus-restoring path. Tabbing away leaves the panel open,
  // also accepted there — Escape from outside the footer still closes the panel, not the editor.
  const disclosure = (
    key: PanelKey,
    label: string,
    names: readonly string[],
    panelTitle: string,
  ) => {
    const isOpen = openPanel === key;
    const panelId = `${idPrefix}-${key}-panel`;
    const titleId = `${idPrefix}-${key}-title`;
    return (
      <Note>
        <Trigger
          type="button"
          onClick={(event) => toggle(key, event.currentTarget)}
          aria-expanded={isOpen}
          // Unconditional (AC3): axe-core's `aria-valid-attr-value` skips the id-exists check for
          // `aria-controls` while `aria-expanded="false"`, so a collapsed disclosure naming its
          // not-yet-rendered panel is clean — and AT announces the relationship either way.
          aria-controls={panelId}
          {...{ [`data-usage-${key}`]: '' }}
        >
          {label}
          <Caret aria-hidden="true">▾</Caret>
        </Trigger>
        {isOpen && (
          <Panel id={panelId} {...{ [`data-usage-${key}-panel`]: '' }}>
            <PanelTitle id={titleId}>{panelTitle}</PanelTitle>
            {/* The scroll region: focusable with an accessible name, so a capped list is
                reachable by keyboard and clean under axe's `scrollable-region-focusable`. */}
            <NameList tabIndex={0} aria-labelledby={titleId}>
              {names.map((name, index) => (
                // The index is part of the key on purpose: two battles, or two organisms, may
                // legitimately resolve to the SAME display name (`Untitled Battle`,
                // `Unnamed organism`), and a name-only key would collide into a React warning the
                // e2e's clean-console assertion fails on.
                <NameItem key={`${name}-${index}`}>{name}</NameItem>
              ))}
            </NameList>
          </Panel>
        )}
      </Note>
    );
  };

  return (
    <Row ref={rootRef}>
      {battleNames.length === 0 ? (
        // AC3: a zero count is plain text — no button, no `aria-expanded`, no panel (UX-DR6's
        // "without expansion"; NFR-4.1 — no affordance that does nothing).
        <NoteText data-usage-battles-empty>{battleCountLabel(0)}</NoteText>
      ) : (
        disclosure(
          'battles',
          battleCountLabel(battleNames.length),
          battleNames,
          'Used in these Battles',
        )
      )}
      {/* AC2: M === 0 renders NOTHING for this half — never "Targeted by 0". */}
      {ruleCount > 0 &&
        disclosure(
          'rules',
          ruleTargetCountLabel(ruleCount),
          referencingNames,
          'Targeted by these organisms',
        )}
    </Row>
  );
}

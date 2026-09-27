'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { styled } from '@mui/material/styles';
import type { ConditionDraft, OrganismOption } from '@/lib/organisms/conditionDraft';
import {
  moveRule,
  removeRule,
  updateRuleConditions,
  updateRulePayload,
  type RuleDraft,
} from '@/lib/organisms/ruleDraft';
import { ruleDeleteLabel } from '@/lib/organisms/ruleDeleteCopy';
import { useInertBackground } from '@/lib/useInertBackground';
import AddRuleButton from './AddRuleButton';
import RuleCard from './RuleCard';
import RuleDeleteConfirmDialog from './RuleDeleteConfirmDialog';

/**
 * The Survival Rules column's list — or, with zero rules, the centred empty state (Story 4.10,
 * AC2/AC3/AC5). Fully controlled: `<OrganismEditorModal>` owns `rules` inside the one draft object
 * and passes an updater-style setter (FD8), the same reasoning `setDominance`'s functional form
 * carries — two rule mutations landing in one batch cannot clobber each other.
 *
 * **Focus follows the list diff (FD6)** — the three required moves (the new card's Summary on add,
 * a neighbour's Summary on delete, the empty state's CTA when the last card goes) are driven by
 * one effect keyed on `rules`, diffing against the previous render's ids. A `pendingFocus` ref set
 * by the handlers was rejected: the header's "+ Add Rule" lives in the layout's `rulesAction` slot,
 * OUTSIDE this component, and a diff needs no coordination with it. `autoFocus` on the newest card
 * was rejected too — a seeded list (Story 4.17) would autofocus its last card on mount, and it
 * races MUI's focus trap on the dialog's first paint.
 *
 * **Story 4.12 — reordering.** One commit path (`commitMove`) for both inputs: a keyboard move
 * (immediate, FD2) and a pointer drop. `drag` is ephemeral UI state — the drop indicator renders
 * from it — mirrored in `dragRef` for the HANDLERS: pointer events arrive faster than a render
 * commits, and the drop must land in the slot the last `pointermove` chose, not the one the last
 * render saw; reading the ref keeps every `setDrag` updater pure (no layout inside it) and every
 * handler's deps honest. `setDrag` is only called when `toIndex` actually changes, so a 60Hz
 * `pointermove` costs no render while the pointer stays in one slot. The GEOMETRY (which
 * slot the pointer is over) lives here, not in `<RuleCard>`, because a lone card has no siblings
 * to measure against — the card owns only the pointer plumbing (capture, guards). `pendingFocusId`
 * is a ref because the FD6 effect below reads it on the render the reorder produces, exactly the
 * way the add/delete branches already work; a legitimate `pendingFocus` HERE (unlike for add, FD6's
 * rejection) because the initiator is inside this component, not the layout's header slot.
 * `announcement`'s `seq` remounts the status `<span>` on every move so an identical sentence
 * (down, then up, then down) is announced each time, not suppressed as unchanged text (FD4). The
 * Escape listener (FD6) is added on `document` in the CAPTURE phase, for exactly the life of a
 * drag, and calls `stopPropagation()` — MUI's `Modal` closes on any un-stopped Escape `keydown`
 * (v9 has no `disableEscapeKeyDown`) and does not consult `defaultPrevented`; a document capture
 * listener runs before both the modal's and this handle's own `onKeyDown` on every engine, which
 * matters because WebKit does not focus a `<button>` on `pointerdown`, so the handle's own
 * `onKeyDown` cannot be the cancel path there. (Story 4.12) (FR-2.6) (UX-DR11) (UX-DR17)
 *
 * **Story 4.26 — the delete confirmation.** `handleDelete` no longer removes a rule; it REQUESTS
 * one (FD1: the confirmation lives here, the owner of the list, the FD6 focus effect, the drag
 * state and the `cardControl` lookup). `confirming` (`{ id, label } | null`) is the mounted window,
 * mirrored in a ref (the `dragRef` idiom) so a second request — a `dblClick`'s second click, or a
 * held Enter's auto-repeat reopening the request before this render has committed — reads the
 * LATCH synchronously and is refused, rather than racing `confirming` state that has not yet
 * flushed. `confirmOpen` drives the fade alone (the `useLeaveGuard` / `useOrganismEditorModal`
 * three-phase shape). The outcome (`'confirm' | 'cancel'`) is read ONLY in the dialog's `onExited`
 * (FD3 — no stacked unwinding: removing the rule in the same commit as closing the dialog would run
 * the FD6 focus move while the confirmation still holds the focus trap, and `focus()` into a still
 * -inert subtree is a silent no-op). On `'confirm'` the removal runs there and the FD6 effect below
 * — unmodified — performs AC2's focus move, because the confirmation has already unmounted and
 * focus has fallen to `<body>`, which reads as loose. On `'cancel'` nothing in `rules` changes, so
 * FD6 (keyed on `rules`) never re-fires; a dedicated effect keyed on `confirming` clearing restores
 * focus to the ✕ that opened the dialog instead — always, with no "is focus loose" check (unlike
 * the modal's own restore effect): the confirmation's background is `inert` for the whole fade, so
 * the user cannot have placed focus anywhere real. `useInertBackground(confirming !== null)` makes
 * the rest of the editor honestly non-interactive while the confirmation is up, over the module
 * -level claims registry that already makes this safe nested inside the editor's own inert window
 * (Story 4.22).
 */

// `.rules-header` reasoning aside, the list itself has no mockup chrome of its own beyond
// `list-style: none` — `role="list"` explicit because it drops in Safari otherwise
// (`<PopulationStats>`/`<CardGrid>` idiom).
const RulesList = styled('ol')({
  listStyle: 'none',
  margin: 0,
  padding: 0,
});

// The design doc's ASCII empty state (`organism-editor-design.md:420-442`) — no mockup markup
// exists for it in either theme.
const EmptyState = styled('div')({
  textAlign: 'center',
  padding: '60px 20px',
  color: 'var(--gol-text-secondary)',
});

const EmptyIcon = styled('div')({
  fontSize: '48px',
  opacity: 0.3,
  marginBottom: '16px',
});

// A `<p>`, not a heading (FD5) — a conditional `<h4>` under the column's own `<h3>` would appear
// and disappear with the list, and would change the Story 4.4 e2e's enumeration of every heading.
const EmptyTitle = styled('p')({
  fontSize: '16px',
  fontWeight: 600,
  color: 'var(--gol-text-primary)',
  margin: '0 0 8px',
});

const EmptyDescription = styled('p')({
  fontSize: '13px',
  lineHeight: 1.6,
  maxWidth: '360px',
  margin: '0 auto 20px',
});

// The `<ColorPickerField>` copy (`:228-235`) — second caller; the third lifts it into
// `fieldStyles.ts` (the Story 4.7 threshold).
const VisuallyHidden = styled('div')({
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
});

export interface RulesEditorProps {
  rules: readonly RuleDraft[];
  organisms: readonly OrganismOption[];
  /**
   * Updater-style, like `setState`: the modal applies it inside ONE functional `setDraft`, so two
   * rule mutations in one batch cannot clobber each other (FD8). The list helpers in
   * `ruleDraft.ts` are what callers pass.
   */
  onRulesChange(update: (rules: readonly RuleDraft[]) => readonly RuleDraft[]): void;
  /**
   * The modal's `addRule` — the SAME callback the header's `<AddRuleButton>` calls, so the id is
   * minted in one place (the modal) for both controls. The empty state's CTA calls this; nothing
   * in here mints an id.
   */
  onAddRule(): void;
  /** Story 4.13's Save-time override, threaded through to every `<RuleCard>`. */
  showAllErrors: boolean;
  /** Story 4.26, FD6: an imperative escape hatch the caller can use to close something of its own
   * (`<OrganismEditorModal>`'s usage panel) before the confirmation mounts — must not move focus
   * itself. Optional: a caller with nothing to close passes none. */
  onBeforeDeleteConfirm?(): void;
}

/** The delete confirmation's mounted window (Story 4.26, FD1) — open OR still fading. `null` means
 * unmounted. */
interface DeleteConfirming {
  id: string;
  label: string;
}

/** The reorder gesture in progress: `fromIndex` is where the drag started, `toIndex` is the
 * CURRENT candidate drop slot (0 … rules.length − 1, the moved rule's index in the result). */
interface DragState {
  id: string;
  fromIndex: number;
  toIndex: number;
}

export default function RulesEditor({
  rules,
  organisms,
  onRulesChange,
  onAddRule,
  showAllErrors,
  onBeforeDeleteConfirm,
}: RulesEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const prevIdsRef = useRef<readonly string[] | null>(null);
  const pendingFocusIdRef = useRef<string | null>(null);
  const instructionsId = useId();

  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [announcement, setAnnouncement] = useState<{ text: string; seq: number } | null>(null);
  const dragging = drag !== null;

  // The one writer of both halves — the ref is what the handlers read, the state is what renders.
  const updateDrag = useCallback((next: DragState | null) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  // Story 4.26 (FD1, FD3): the delete confirmation's three-phase state, the `useLeaveGuard` /
  // `useOrganismEditorModal` shape. `confirmingRef` is the REQUEST LATCH `handleDelete` reads
  // (never `confirming` itself — a second request arriving before this render commits, the
  // `dblClick`'s second click or a held Enter's auto-repeat, must see the mount synchronously, the
  // same reason `dragRef` exists beside `drag`). `confirmOutcomeRef` is read only from the dialog's
  // `onExited` (FD3), never from `onConfirm`/`onCancel` themselves.
  const [confirming, setConfirming] = useState<DeleteConfirming | null>(null);
  const confirmingRef = useRef<DeleteConfirming | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const confirmOutcomeRef = useRef<'confirm' | 'cancel' | null>(null);
  // Story 4.26: the id to restore focus to once a CANCELLED confirmation's exit fade has finished
  // (the effect below, keyed on `confirming` clearing). Set only on the cancel outcome — the
  // confirm outcome hands its focus move to the pre-existing FD6 list-diff effect instead.
  const cancelFocusIdRef = useRef<string | null>(null);

  // The rest of the editor is genuinely non-interactive for the whole confirmation window (open OR
  // fading) — the module-level claims registry (`useInertBackground.ts`, since Story 4.22) makes
  // this safe nested inside the editor's own inert window. Placed ABOVE the focus effects below:
  // its cleanup (lifting `inert`) must run before any of them call `.focus()`, and React runs every
  // effect's cleanup for a commit before any effect's setup (the `<OrganismEditorModal>` FD7
  // placement rule, copied).
  useInertBackground(confirming !== null);

  const handleChange = useCallback(
    (id: string, patch: Partial<RuleDraft['payload']>) =>
      onRulesChange((current) => updateRulePayload(current, id, patch)),
    [onRulesChange],
  );

  // Story 4.26: a REQUEST, not a removal (FD1). Refused while a confirmation is already mounted
  // (the ref latch) or the id no longer exists (a stale event from an already-removed card).
  const handleDelete = useCallback(
    (id: string) => {
      if (confirmingRef.current !== null) return;
      const index = rules.findIndex((rule) => rule.id === id);
      if (index === -1) return;
      // A drag's document-capture Escape listener (Story 4.12) would otherwise eat the
      // confirmation's own Escape — closed before the dialog ever mounts.
      updateDrag(null);
      // FD6: closes something of the caller's (the usage panel) before the confirmation mounts, so
      // its own Escape/outside-pointerdown listener can never intercept the confirmation's Escape.
      onBeforeDeleteConfirm?.();
      const label = ruleDeleteLabel(rules[index].payload.summary, index);
      const next: DeleteConfirming = { id, label };
      confirmingRef.current = next;
      setConfirming(next);
      setConfirmOpen(true);
    },
    [rules, updateDrag, onBeforeDeleteConfirm],
  );

  const handleDeleteCancel = useCallback(() => {
    confirmOutcomeRef.current = 'cancel';
    setConfirmOpen(false);
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    confirmOutcomeRef.current = 'confirm';
    setConfirmOpen(false);
  }, []);

  // FD3: the ONE place either outcome takes effect, always AFTER the confirmation's own fade has
  // finished — never stacked in the same commit as the click (the Story 4.22 FD9 / 4.23 FD6 rule).
  const handleDeleteExited = useCallback(() => {
    const outcome = confirmOutcomeRef.current;
    confirmOutcomeRef.current = null;
    const closed = confirmingRef.current;
    confirmingRef.current = null;
    setConfirming(null);
    if (closed === null) return;
    if (outcome === 'confirm') {
      // The status region unmounts with the list (Story 4.12); a sentence left in state would
      // remount with the next list, verbatim, describing rules that no longer exist.
      if (rules.length === 1) setAnnouncement(null);
      onRulesChange((current) => removeRule(current, closed.id));
      // AC2's focus move is the pre-existing FD6 list-diff effect's — the confirmation has already
      // unmounted, and focus is on `<body>`, which that effect reads as loose.
    } else {
      // AC3: the confirmation's background was inert for the whole fade, so the user cannot have
      // placed focus anywhere real — restore unconditionally, no "is focus loose" check (unlike
      // the modal's own restore effect; there is no other dialog stacked to consider here).
      cancelFocusIdRef.current = closed.id;
    }
  }, [onRulesChange, rules.length]);

  // Story 4.26, AC3: the cancel-outcome focus restore, an effect keyed on `confirming` clearing —
  // FD6 (below) is keyed on `rules`, which a cancel never changes, so it would never re-fire for
  // this path.
  useEffect(() => {
    if (confirming !== null) return;
    const id = cancelFocusIdRef.current;
    cancelFocusIdRef.current = null;
    if (id === null) return;
    rootRef.current
      ?.querySelector<HTMLElement>(`[data-rule-id="${CSS.escape(id)}"] [data-rule-delete]`)
      ?.focus();
  }, [confirming]);

  const handleConditionsChange = useCallback(
    (id: string, update: (conditions: readonly ConditionDraft[]) => readonly ConditionDraft[]) =>
      onRulesChange((current) => updateRuleConditions(current, id, update)),
    [onRulesChange],
  );

  // The one commit path both a keyboard move and a pointer drop share (Story 4.12). A no-op
  // (unknown id, or the clamped target equals the rule's current index) announces nothing and
  // moves no focus — `moveRule` itself returns the same array reference for either case.
  const commitMove = useCallback(
    (id: string, toIndex: number) => {
      const from = rules.findIndex((rule) => rule.id === id);
      const to = Math.max(0, Math.min(rules.length - 1, toIndex));
      if (from === -1 || from === to) return;
      pendingFocusIdRef.current = id;
      setAnnouncement((a) => ({
        text: `Rule moved to position ${to + 1} of ${rules.length}`,
        seq: (a?.seq ?? 0) + 1,
      }));
      onRulesChange((current) => moveRule(current, id, to));
    },
    [rules, onRulesChange],
  );

  const handleMove = useCallback(
    (id: string, toIndex: number) => {
      // Arrow keys are live mid-drag in Chromium (the handle takes focus on `pointerdown`); a
      // keyboard move would re-render the list under a `fromIndex` captured at pointerdown, so
      // the drop would compare against a stale origin.
      if (dragRef.current !== null) return;
      commitMove(id, toIndex);
    },
    [commitMove],
  );

  const handleDragStart = useCallback(
    (id: string) => {
      if (dragRef.current !== null) return;
      const fromIndex = rules.findIndex((rule) => rule.id === id);
      if (fromIndex === -1) return;
      updateDrag({ id, fromIndex, toIndex: fromIndex });
    },
    [rules, updateDrag],
  );

  // Geometry: the slot is the count of OTHER cards whose midpoint sits above the pointer. Every
  // callback checks the card's id against the drag's — a second primary pointer (pen + mouse)
  // starts nothing above, but its card has captured and keeps reporting; those reports are not
  // this drag's. The `toIndex` guard keeps a same-slot move a no-op render.
  const handleDragOver = useCallback(
    (id: string, clientY: number) => {
      const d = dragRef.current;
      const root = rootRef.current;
      if (d === null || d.id !== id || root === null) return;
      const others = Array.from(root.querySelectorAll<HTMLElement>('[data-rule-id]')).filter(
        (el) => el.getAttribute('data-rule-id') !== d.id,
      );
      const toIndex = others.filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.top + rect.height / 2 < clientY;
      }).length;
      if (toIndex !== d.toIndex) updateDrag({ ...d, toIndex });
    },
    [updateDrag],
  );

  const handleDragEnd = useCallback(
    (id: string) => {
      const d = dragRef.current;
      if (d === null || d.id !== id) return;
      updateDrag(null);
      if (d.toIndex !== d.fromIndex) commitMove(d.id, d.toIndex);
    },
    [commitMove, updateDrag],
  );

  const handleDragCancel = useCallback(
    (id: string) => {
      const d = dragRef.current;
      if (d === null || d.id !== id) return;
      updateDrag(null);
    },
    [updateDrag],
  );

  // Escape mid-drag (Story 4.12, FD6): a `document` CAPTURE listener, alive only for the life of
  // a drag, keyed on the drag's NULLNESS (not the object) so a `toIndex` change mid-drag does not
  // re-subscribe. `stopPropagation` — not `preventDefault` — because MUI's `Modal` closes on any
  // un-stopped Escape `keydown` and does not check `defaultPrevented`; a capture listener runs
  // before both the modal's root handler and this handle's own `onKeyDown` on every engine, which
  // is why this is the cancel path even in WebKit (no focus on `pointerdown` there).
  useEffect(() => {
    if (!dragging) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      updateDrag(null);
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [dragging, updateDrag]);

  useEffect(() => {
    const ids = rules.map((rule) => rule.id);
    const prev = prevIdsRef.current;
    const root = rootRef.current;

    // The dragged card left the list mid-drag (deleted from the keyboard, or by the parent): its
    // `<li>` is gone, so `lostpointercapture` fires on a detached node React never hears, and
    // without this the drag would stay open — every new drag refused, the Escape listener live.
    const d = dragRef.current;
    if (d !== null && !ids.includes(d.id)) updateDrag(null);

    if (prev === null) {
      // First run — a seeded list (Story 4.17) must not steal focus on mount.
      prevIdsRef.current = ids;
      return;
    }

    // `CSS.escape`, because the id is a schema-level `string().min(1)`, not a uuid: a create
    // mints uuids, but an edit session (Story 4.17) seeds ids from persisted records, and a `"`
    // or `\` in one would otherwise make `querySelector` throw inside this effect and unmount the
    // editor.
    const cardControl = (id: string, control: string) =>
      root?.querySelector<HTMLElement>(`[data-rule-id="${CSS.escape(id)}"] ${control}`);

    if (ids.length === prev.length + 1) {
      const addedId = ids.find((id) => !prev.includes(id));
      if (addedId !== undefined) {
        cardControl(addedId, '[data-rule-summary]')?.focus();
      }
    } else if (ids.length === prev.length - 1) {
      // The first position where the lists diverge is the removed card's — and when the LAST
      // card went, it is `prev`'s last index, because `ids[i]` is `undefined` there.
      const removedIndex = prev.findIndex((id, i) => ids[i] !== id);

      // "Loose" focus (`<BattleEditorView>`'s `focusIsLoose` idiom, adapted). Focus on a real
      // control INSIDE the list — a mouse-click Delete in a browser that does not focus buttons
      // on click, with the user parked in another card — is left alone. Everything else counts
      // as loose, including a focus OUTSIDE this component: the deleted button is gone, so focus
      // has fallen to `<body>`, and MUI's `FocusTrap` polls every 50 ms and re-focuses the dialog
      // root when it finds `<body>` — a race this effect can lose, which is why "outside the
      // list" must also qualify, exactly as the battle editor's `closest('[role="dialog"]')` does.
      const active = document.activeElement;
      const focusIsLoose = active === null || active === document.body || !root?.contains(active);
      if (focusIsLoose) {
        if (ids.length === 0) {
          root?.querySelector<HTMLElement>('[data-add-rule="empty"]')?.focus();
        } else {
          // The neighbour's Summary, not its Delete (Story 4.10 AC5): Enter activates a
          // `<button>` on keydown and auto-repeats, so landing on another destructive control
          // would let a held or double-tapped Enter cascade deletions with no confirmation and
          // no undo. The neighbour is the card that took the removed index, else the new last
          // card; its Delete is one Shift+Tab back (Option+Shift+Tab where Safari's default
          // keyboard settings skip buttons).
          const targetId = ids[Math.min(removedIndex, ids.length - 1)];
          if (targetId !== undefined) {
            cardControl(targetId, '[data-rule-summary]')?.focus();
          }
        }
      }
    } else if (ids.length === prev.length) {
      // Same-length changes (a summary keystroke, an action change, a condition edit inside
      // `<ConditionsEditor>`) move no focus, EXCEPT a reorder (Story 4.12), which re-focuses the
      // moved card's handle: React re-inserts the moved `<li>` with `insertBefore`, which removes
      // the node first, and every engine's focus-fixup blurs a node that is removed — so the
      // handle the user was on has lost focus by the time this effect runs.
      const pending = pendingFocusIdRef.current;
      if (pending !== null) {
        cardControl(pending, '[data-drag-handle]')?.focus();
      }
    }

    // Always cleared, whatever branch ran — a ref set by a move whose `onRulesChange` turned out
    // to be a no-op (a stale `rules` prop) must never fire on the next keystroke (AC8).
    pendingFocusIdRef.current = null;
    prevIdsRef.current = ids;
  }, [rules, updateDrag]);

  // The drop target, computed once per render (not per card): `others` excludes the dragged rule,
  // so `drag.toIndex` indexes directly into it. A target index at or past the end paints the
  // LAST card's `after` edge rather than a slot that does not exist (FD5).
  let dropTargetId: string | null = null;
  let dropSide: 'before' | 'after' | null = null;
  if (drag !== null && drag.toIndex !== drag.fromIndex) {
    const others = rules.filter((rule) => rule.id !== drag.id);
    if (drag.toIndex < others.length) {
      dropTargetId = others[drag.toIndex]?.id ?? null;
      dropSide = 'before';
    } else {
      dropTargetId = others[others.length - 1]?.id ?? null;
      dropSide = 'after';
    }
  }

  return (
    <div ref={rootRef}>
      {rules.length === 0 ? (
        <EmptyState data-rules-empty-state>
          <EmptyIcon aria-hidden="true">◯</EmptyIcon>
          <EmptyTitle>No Rules Defined</EmptyTitle>
          <EmptyDescription>
            Add rules to define when cells are born, survive, or die during simulation.
          </EmptyDescription>
          <AddRuleButton type="button" data-add-rule="empty" onClick={onAddRule}>
            + Add Rule
          </AddRuleButton>
        </EmptyState>
      ) : (
        <>
          <RulesList role="list" aria-label="Survival rules">
            {rules.map((rule, index) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                index={index}
                organisms={organisms}
                onChange={handleChange}
                onDelete={handleDelete}
                onConditionsChange={handleConditionsChange}
                onMove={handleMove}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                onDragCancel={handleDragCancel}
                dragging={drag?.id === rule.id}
                dropIndicator={dropTargetId === rule.id ? dropSide : null}
                describedBy={instructionsId}
                showAllErrors={showAllErrors}
              />
            ))}
          </RulesList>
          <VisuallyHidden id={instructionsId}>
            Press Up Arrow or Down Arrow to move this rule. With a pointer, drag the handle.
          </VisuallyHidden>
          {/* Always mounted while the list renders — a move needs >= 2 rules, so "exists before
              its content changes" holds for every reachable announcement (the 4.9 FD3 idiom). A
              cancelled or no-op drag/keystroke announces nothing; `key={seq}` remounts the `<span>`
              on every move so the SAME sentence twice (down, up, down) is announced each time,
              rather than suppressed as unchanged text (FD4). */}
          <VisuallyHidden role="status" data-reorder-status>
            {announcement !== null && <span key={announcement.seq}>{announcement.text}</span>}
          </VisuallyHidden>
        </>
      )}
      {/* Story 4.26: rendered iff a delete is requested — the empty-state branch never opens one
          (only a card's ✕ does). Imported statically above; this file is already inside the
          editor's own lazy chunk. */}
      {confirming !== null && (
        <RuleDeleteConfirmDialog
          open={confirmOpen}
          ruleLabel={confirming.label}
          onCancel={handleDeleteCancel}
          onConfirm={handleDeleteConfirm}
          onExited={handleDeleteExited}
        />
      )}
    </div>
  );
}

---
baseline_commit: 71bc1a054e748beb71ded2764dc5b42b133bcb0c
---

# Story 4.12: Rule Reordering

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to reorder rules by priority,
so that I control which rule wins within a phase.

## Acceptance Criteria

From `epics.md#Story 4.12: Rule Reordering` (`:1128-1138`), decomposed into what a reviewer can
check independently. AC4–AC11 are repo-derived: the obligations Story 4.10's shipped `<RuleCard>` /
`<RulesEditor>` / `ruleDraft.ts` (its FD4 handle, its FD6 focus effect, its deferred "handle ships
`disabled` until 4.12" entry), Story 4.11's live-region and focus habits, `<PetriDishCanvas>`'s
Pointer Events idiom, the token layer and the CI gates impose. The **dirty scope** that "order"
activates is Story 4.23's; the **persistence** of the order is Story 4.16's (the draft array IS the
order — nothing here touches a repository, AR-2 / AR-27); the **preview** that runs the order is
Story 4.15's; the **engine** that applies it is Epic 3's and is untouched. No dependency is added
(FD1).

1. **A pointer drag on the handle reorders the card, with the AC's three visuals.** `pointerdown`
   (primary button, `isPrimary`) on `[data-drag-handle]` starts a drag; while it lasts the dragged
   card's `<li>` carries `data-dragging` and paints **semi-transparent and elevated** — `opacity:
   0.5`, `borderColor: var(--gol-accent)`, `boxShadow: var(--gol-shadow-tile-hover)` (the existing
   accent-glow token, Story 1.10 — no new token, no `rgba` literal, AR-46); the card adjacent to the
   insertion point carries `data-drop="before"` or `data-drop="after"` and paints a **2px
   `--gol-accent` line** in the 12px gap between cards (a `::before`/`::after` pseudo-element on the
   `<li>`, `position: absolute`, `top: -7px` / `bottom: -7px`, `left: 0; right: 0`, `pointerEvents:
   'none'`); the indicator is shown **only when the drop would change the order** (FD5). On
   `pointerup` the rule moves to the indicated position and every card **renumbers** (`Rule N` is
   derived from `index`, Story 4.10 — nothing stores it); `data-dragging` and `data-drop` are
   gone. The insertion index is the number of *other* cards whose vertical midpoint
   (`getBoundingClientRect()`) lies above `clientY` — 0 … n−1, the moved rule's index in the
   **result**. The handle takes `setPointerCapture` so the drag survives the pointer leaving the
   handle, the card or the column (the `<PetriDishCanvas>` Task 5 mechanism, guarded `?.` for
   jsdom); `touchAction: 'none'` + `userSelect: 'none'` on the handle (the `<BattleEditorView>`
   rule: declarative CSS set before the gesture, never `preventDefault` on pointerdown). No
   `transition` anywhere (the axe-mid-fade rule Stories 2.13–2.15 each lost one to; 4.10's cards
   already have none). (FR-2.6, UX-DR11, NFR-4.2)

2. **Reordering is fully keyboard-operable from the focused handle: ArrowUp / ArrowDown move the
   rule one position, immediately.** The handle is an **enabled** `<button>` (Story 4.10 FD4: "4.12
   removes one attribute and adds handlers") — the card's first Tab stop, before Delete. `ArrowUp`
   on `Reorder rule N` moves the rule to index N−2, `ArrowDown` to index N; the key is
   `preventDefault`ed in both cases **and at the boundaries** (first card + ArrowUp, last card +
   ArrowDown), where nothing changes — the column must not scroll under a consumed key. No
   grab/drop mode, no Space/Enter, no Home/End (FD2; recorded). Any other key is left alone.
   After a move (keyboard **or** pointer), **focus lands on the moved card's handle** — the browser
   blurs a node React re-inserts (`insertBefore` removes it first), so `<RulesEditor>`'s effect
   re-focuses `[data-rule-id="…"] [data-drag-handle]` on the render that carries the new order
   (FD3). A move whose target equals the current index is a no-op with no focus move and no
   announcement. (UX-DR17)

3. **List order is the priority, and nothing here interprets it.** The draft's `survivalRules`
   array order is what `<RulesEditor>` renders, what `moveRule` permutes and what Story 4.16 will
   persist (RFC-004 §2.4 / §2.3: `ORDER = priority`, first match wins **within a phase** — Die in
   Phase 1, Born/Survive in Phase 2, M10). No phase grouping, no "Die rules first" sorting, no
   per-action sections: the list is one ordered list and the engine partitions it at compile time
   (`compileEvaluators.ts`, Story 3.4). The rule's `id` survives the move (RFC-004 §2.4 — identity
   is stable across reordering; `key={rule.id}` is what keeps each card's `useId`s and its
   condition rows' `touched` state with it). (FR-2.6, M10)

4. **`moveRule` is a pure helper in `ruleDraft.ts` with the file's same-reference contract.**
   `moveRule(rules, id, toIndex)` returns the **same array reference** when `id` matches nothing or
   when the clamped target equals the rule's current index; otherwise a new array with the rule at
   `clamp(toIndex, 0, rules.length − 1)`, every other rule **by reference**, in their previous
   relative order, and `rules` unmutated. The modal's `setSurvivalRules` already hands back the same
   draft for a same-reference update, so a boundary keystroke costs no render.
   (Story 4.10 FD8)

5. **Screen-reader users hear the result, and the handle describes itself.** `<RulesEditor>`
   renders, after the `<ol>` and only while the list renders, (a) a visually-hidden instructions
   node (`id` from `useId`) with the text **"Press Up Arrow or Down Arrow to move this rule. With a
   pointer, drag the handle."**, referenced by every handle's `aria-describedby` (the design doc's
   "Describe drag-to-reorder functionality", `:737`), and (b) an **always-mounted**, visually-hidden
   `role="status"` region (`data-reorder-status`) that receives **"Rule moved to position N of M"**
   after every completed move (N = 1-based result index, M = rule count) — always mounted because a
   live region must exist before its content changes (Story 4.9 FD3), visually hidden because the
   renumbered labels already carry the change for sighted users. The text is rendered as a
   `<span key={seq}>` where `seq` increments per move, so the **same** sentence twice (down, up,
   down) is a fresh node each time and is announced each time (FD4). A cancelled or no-op drag
   announces nothing. The `VisuallyHidden` rule set is `<ColorPickerField>`'s (`:228-235`),
   copied — second caller; the third lifts it into `fieldStyles.ts` (the Story 4.7 threshold).
   Story 4.10's "no live region for add/delete" stands: there, focus movement carries the change;
   here focus stays on the same control. (UX-DR17)

6. **A drag can be cancelled, and Escape mid-drag does not close the editor.** `pointercancel`,
   `lostpointercapture`, a `pointermove` whose `buttons` bitmask has bit 0 clear (the
   `<PetriDishCanvas>` trap-5 self-heal — capture lost somewhere the handle never heard about), and
   **Escape** all end the drag with **no change** and no announcement. Escape is caught by a
   `keydown` listener `<RulesEditor>` adds to `document` in the **capture** phase for exactly the
   life of a drag (effect keyed on `drag !== null`, removed on cleanup); it calls
   `stopPropagation()` so MUI's `Modal` — which closes on any un-stopped Escape `keydown` and has no
   `disableEscapeKeyDown` in v9 (the `<OrganismEditorModal>` comment) — never sees it. In WebKit
   `pointerdown` does not focus a `<button>`, so the handle's own `onKeyDown` cannot be the cancel
   path; document capture runs before React's root listener on every engine (FD6). Escape with no
   drag active is untouched (the dialog closes as today; Story 4.23 guards it).

7. **A pointer that is not the drag's is ignored; a second pointerdown mid-drag starts nothing.**
   The card records the active `pointerId` in a ref on `pointerdown` and ignores every
   `pointermove` / `pointerup` / `pointercancel` carrying another id (the `<PetriDishCanvas>` AC7
   rule); a `pointerdown` while a drag is active returns early. `<RulesEditor>` ignores
   `onDragStart` while `drag !== null`, and `onDragOver` / `onDragEnd` / `onDragCancel` when
   `drag === null` (the state after an Escape cancel, with the pointer still captured).

8. **Focus follows the moved card, and every other same-length change stays inert.** The Story
   4.10 FD6 effect keeps its add / delete branches **byte-identical**. Its same-length branch gains
   one clause: if `pendingFocusIdRef.current` is set, focus that card's `[data-drag-handle]`
   (scoped to `rootRef`, `CSS.escape`d — the existing `cardControl` helper) and clear the ref. The
   ref is **always cleared** when the effect runs, whatever branch ran, so a ref set by a move whose
   `onRulesChange` turned out to be a no-op (a stale `rules` prop) cannot steal focus on the next
   keystroke. A summary keystroke, an action change, a condition edit — no ref set — move nothing
   (the existing test). A `pendingFocus` ref is legitimate **here**, unlike for add (4.10 FD6
   rejected it): the initiator is the handle, inside this component, so no coordination with the
   layout's header slot is needed. (UX-DR17, Story 4.10 AC5's non-destructive-target reasoning: the
   handle is not a destructive control.)

9. **`RULE_ACTIONS` moves to `@gol/domain` — the "next `ruleDraft.ts` touch" the 4.11 deferred entry
   names.** `survivalRuleSchema.ts` exports `RULE_ACTIONS: readonly RuleAction[] =
   SurvivalRuleSchema.shape.payload.shape.action.options` and `type RuleAction`, beside the four
   condition constants (same comment, same "never a second literal tuple" rule); `index.ts` exports
   both (`export type` for the type); `ruleDraft.ts` re-exports them so every existing importer is
   unchanged (`export { RULE_ACTIONS, type RuleAction } from '@gol/domain'`). Domain per-file
   coverage stays **100%** (a constant adds no branches; `survivalRuleSchema.test.ts` pins the
   value and its order). `packages/simulation` untouched. (AR-39, AR-45)

10. **axe passes in every settled state; it is never run mid-drag.** vitest-axe: `<RulesEditor>`
    with three rules after a keyboard move (status region populated) → `[]`; `<RuleCard>` with the
    enabled handle → `[]`. `@axe-core/playwright` on `/organisms` with three cards after a keyboard
    reorder → `[]`. The dragged card's `opacity: 0.5` halves every contrast ratio on it for the
    life of the gesture — a transient pointer state, not a settled one (the design doc's own
    "becomes semi-transparent"), so no scan lands there (FD7; recorded). The enabled handle's
    `--gol-text-tertiary` glyph on `--gol-bg-secondary` is the gated pair Story 4.10's `CharCount`
    already passes with; hover `--gol-accent` (the mockup's `.drag-handle:hover`, `:561-563`) and
    the focus ring `2px solid var(--gol-accent)` offset 2px (the Delete button's). **No new token**
    — `themes.css` and `themeTokens.test.ts` untouched. (UX-DR17, NFR-8.3, AR-46)

11. **Every existing guard is retargeted only where this story legitimately changes the DOM.**
    (a) `RuleCard.test.tsx` (a) `toBeDisabled()` → `toBeEnabled()`; (g) "genuinely disabled and a
    click calls nothing" → "enabled, and a plain click calls neither `onChange`, `onDelete` nor
    `onMove`"; `renderCard` gains the new required props (Task 5). (b) `RulesEditor.test.tsx` —
    no existing assertion changes; the `Harness` is unchanged (the new props are internal to
    `<RulesEditor>`). (c) `organisms.spec.ts` 4.10 keyboard test: after `+ Add Condition`, one
    `Tab` → `Reorder rule 2` (now enabled, the next card's first stop), then `Tab` → `Delete rule
    2`; title loses "and the handle is skipped", gains "→ Reorder"; the 4.10 "drag handle is
    disabled" test becomes `toBeEnabled()`. (d) `OrganismEditorModal.test.tsx` — **no edits** to
    the existing cases (none asserts the handle's state). Everything else — `ConditionRow` /
    `ConditionsEditor` (+ tests), `OrganismEditorLayout` (+ test), the 4.1–4.9 and 4.11 e2e
    blocks — **unedited**. (AR-44)

12. **The bundle gate passes and no route's first load moves.** `RULE_ACTIONS` rides
    `survivalRuleSchema.ts` (already in every first load — bytes). Everything else reaches the
    client through `OrganismEditorModal.tsx` (the lazy chunk): the handlers, `moveRule`, the two
    hidden nodes. `/` (340), `/battle` (310), `/battle/new` (310), `/organisms` (305) stay within
    ±0.5 KB of `main`; the editor chunk grows (expect ≈ +1.0–1.5 KB gzip). **No budget is raised.**
    `npm run ci:dev > ci.log 2>&1; echo $?` locally; CI on the PR checked with `gh run list --limit
    1` **after the PR opens**.

## Tasks / Subtasks

- [x] **Task 1 — `RULE_ACTIONS` to `@gol/domain`** (AC: 9)
  - [x] `packages/domain/src/survivalRuleSchema.ts`, after `CONDITION_PROPERTIES`:
        ```ts
        export type RuleAction = z.infer<typeof SurvivalRuleSchema>['payload']['action'];
        // The action universe, read off the schema (the Story 4.10 RULE_ACTIONS rule, moved here in
        // Story 4.12 for symmetry with the condition constants above). Consumers: the editor's
        // action <select> and badge (`ruleDraft.ts` re-exports it), the test-utils matrix.
        export const RULE_ACTIONS: readonly RuleAction[] =
          SurvivalRuleSchema.shape.payload.shape.action.options;
        ```
        (`SurvivalRuleSchema` is declared above it at `:78`; place the constant after the schema.)
  - [x] `packages/domain/src/index.ts`: export `RULE_ACTIONS` and `type RuleAction`
        (`isolatedModules` — `export type`).
  - [x] `survivalRuleSchema.test.ts`: in `describe('condition universe')` (or a sibling `'action
        universe'`): `RULE_ACTIONS` equals `['born', 'survive', 'die']` in order and each member
        parses through `SurvivalRuleSchema.shape.payload.shape.action`.
  - [x] `apps/web/lib/organisms/ruleDraft.ts`: delete the local `RuleAction` type and
        `RULE_ACTIONS` const; add `export { RULE_ACTIONS, type RuleAction } from '@gol/domain';`
        and `import { type RuleAction } from '@gol/domain'` for local use. The `SurvivalRuleSchema`
        import stays only if something else still uses it (nothing does — drop it).
        `ruleDraft.test.ts`'s `RULE_ACTIONS` describe runs **unedited** (it imports from
        `./ruleDraft`, which re-exports).

- [x] **Task 2 — `moveRule`, pure** (AC: 4)
  - [x] `ruleDraft.ts`, after `removeRule`:
        ```ts
        /** Moves the rule with `id` to `toIndex` (clamped to the list), every other rule by
         * reference and in its previous relative order. Returns the SAME array reference when `id`
         * matches nothing or the clamped target IS the rule's current index — a boundary ArrowUp on
         * the first card must not re-render the list (Story 4.12, FR-2.6: order is priority). */
        export function moveRule(
          rules: readonly RuleDraft[],
          id: string,
          toIndex: number,
        ): readonly RuleDraft[] {
          const from = rules.findIndex((rule) => rule.id === id);
          const moved = rules[from];
          if (from === -1 || moved === undefined) return rules;
          const to = Math.max(0, Math.min(rules.length - 1, toIndex));
          if (to === from) return rules;
          const rest = rules.filter((rule) => rule.id !== id);
          return [...rest.slice(0, to), moved, ...rest.slice(to)];
        }
        ```
  - [x] `ruleDraft.test.ts`, `describe('moveRule')` with a three-rule fixture (`BORN`, `SURVIVE`
        and a third via `createNewRuleDraft('x')`): (a) down `[B,S,X]` → `moveRule(rules, B.id, 2)`
        = `[S,X,B]`, `next[0]` **is** `SURVIVE`, `next[1]` **is** `X`; (b) up `moveRule(rules,
        X.id, 0)` = `[X,B,S]`; (c) one step each way; (d) same index → same reference; (e) unknown
        id → same reference; (f) `toIndex: 99` → last, `-1` → first (clamped), and `toIndex: 2`
        on the last rule → same reference (clamp then identity); (g) `rules` unmutated
        (`toEqual` the original after the call); (h) `next.length === rules.length` and the id set
        is unchanged — a fast-check property over `fc.integer()` for `toIndex` and `fc.nat({ max:
        4 })` for the source index on a five-rule list: result is a permutation, `moved` is at
        `clamp(toIndex)`, others keep relative order (`lib/battle/resizeGrid.test.ts` precedent).

- [x] **Task 3 — `<RuleCard>`: the handle acts** (AC: 1, 2, 6, 7, 10, 11a)
  - [x] Props gain (all **required** — an optional prop is how a later caller ships a dead handle,
        the 4.9 FD1 reasoning):
        ```ts
        /** Keyboard reorder (ArrowUp → index − 1, ArrowDown → index + 1); clamping is the parent's. */
        onMove(id: string, toIndex: number): void;
        /** Pointer drag, semantic — geometry and state are <RulesEditor>'s; this card owns only the
         * pointer plumbing (capture, button and pointerId guards, the buttons-bitmask self-heal). */
        onDragStart(id: string): void;
        onDragOver(clientY: number): void;
        onDragEnd(): void;
        onDragCancel(): void;
        /** This card is the one being dragged (`data-dragging` on the <li>). */
        dragging: boolean;
        /** The accent line to paint on this card, or none (`data-drop` on the <li>). */
        dropIndicator: 'before' | 'after' | null;
        /** The list-level instructions node — every handle's `aria-describedby`. */
        describedBy: string;
        ```
  - [x] `DragHandle`: delete `'&:disabled'` and `cursor: 'default'`; add `cursor: 'grab'`,
        `'&:active': { cursor: 'grabbing' }`, `'&:hover': { color: 'var(--gol-accent)' }`
        (`.drag-handle:hover`, `:561-563`), `'&:focus-visible': { outline: '2px solid
        var(--gol-accent)', outlineOffset: '2px' }`, `touchAction: 'none'`, `userSelect: 'none'`.
        Rewrite its comment: what each of the two CSS gestures prevents (the `<BattleEditorView>`
        `:360-372` reasoning, cited), why no `preventDefault`.
  - [x] `Card` (`<li>`): `position: 'relative'`; add
        ```ts
        '&[data-dragging]': {
          opacity: 0.5,
          borderColor: 'var(--gol-accent)',
          boxShadow: 'var(--gol-shadow-tile-hover)',
        },
        '&[data-drop="before"]::before': { ...dropLine, top: '-7px' },
        '&[data-drop="after"]::after': { ...dropLine, bottom: '-7px' },
        ```
        with a module-level `const dropLine = { content: '""', position: 'absolute', left: 0,
        right: 0, height: '2px', background: 'var(--gol-accent)', pointerEvents: 'none' } as
        const;` (two literal selectors, one rule set — never a selector built from the prop
        value).
        Comment: the 12px `marginBottom` gap is where the line sits (−7px centres 2px in it); an
        empty-content pseudo-element on a non-control joins no accessible name (contrast with the
        4.9 FD4 swatch case); the three literal `data-*` selectors keep `themeTokens.test.ts`'s
        `var(` scan honest (the 4.10 `ActionBadge` rule).
  - [x] Markup: `<Card data-dragging={dragging || undefined} data-drop={dropIndicator ??
        undefined}>` (an attribute absent, never `"false"`, so `[data-dragging]` selectors and
        `toHaveAttribute` stay boolean). The handle:
        ```tsx
        <DragHandle
          type="button"
          aria-label={`Reorder rule ${n}`}
          aria-describedby={describedBy}
          data-drag-handle
          onKeyDown={handleKeyDown}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onLostPointerCapture={handlePointerCancel}
        >
        ```
        Handlers (`useCallback` where the deps are stable; a `pointerIdRef = useRef<number |
        null>(null)`):
        - `handleKeyDown`: `ArrowUp` → `event.preventDefault(); onMove(rule.id, index - 1)`;
          `ArrowDown` → `event.preventDefault(); onMove(rule.id, index + 1)`; anything else
          returns. (The boundary clamp and the no-op are `moveRule`'s / the parent's — the card
          does not know the list length.)
        - `handlePointerDown`: `if (event.button !== 0 || !event.isPrimary || pointerIdRef.current
          !== null) return; pointerIdRef.current = event.pointerId; event.currentTarget
          .setPointerCapture?.(event.pointerId); onDragStart(rule.id);` — the `?.` guard is
          jsdom 30 (trap 1), cited.
        - `handlePointerMove`: `if (event.pointerId !== pointerIdRef.current) return; if ((event
          .buttons & 1) === 0) { end(); onDragCancel(); return; } onDragOver(event.clientY);`
          where `end()` clears the ref and calls `event.currentTarget.releasePointerCapture?.
          (pointerId)` guarded by `hasPointerCapture?.()`.
        - `handlePointerUp`: same id guard → `end(); onDragEnd();`.
        - `handlePointerCancel` (also `onLostPointerCapture`): same id guard → `end();
          onDragCancel();`. `lostpointercapture` fires after our own `releasePointerCapture` in
          `end()` too — by then `pointerIdRef` is `null`, so the guard drops it (state this in the
          comment: the order is release → ref cleared → `lostpointercapture` ignored).
  - [x] Header comment: retire FD4's "disabled" clause and the "Followers: Story 4.12 …" line;
        add the split (pointer plumbing here, geometry and state in `<RulesEditor>` — why: the
        card has no siblings to measure), the `key={rule.id}` identity sentence (AC3), `(Story
        4.12) (FR-2.6) (UX-DR11) (UX-DR17)`.
  - [x] `RuleCard.test.tsx`: `renderCard` adds `onMove`, `onDragStart`, `onDragOver`, `onDragEnd`,
        `onDragCancel` as returned `vi.fn()`s (non-overridable, the existing rule), `dragging:
        false`, `dropIndicator: null`, `describedBy: 'instr'` (overridable), and renders a `<span
        id="instr">` beside the `<ol>` so the `describedby` resolves for axe. Retarget (a) and (g)
        per AC11a. Add:
        (m) **the handle is described**: `getAttribute('aria-describedby') === 'instr'`.
        (n) **ArrowDown / ArrowUp call `onMove` with index ± 1 and are consumed**: `index: 2` →
            `fireEvent.keyDown(handle, { key: 'ArrowDown' })` returns `false` (default prevented)
            and `onMove` called with `(RULE.id, 3)`; `ArrowUp` → `(RULE.id, 1)`; at `index: 0`,
            `ArrowUp` → `(RULE.id, -1)` (the card does not clamp — assert it, so a later "helpful"
            clamp in the card is caught).
        (o) **other keys are left alone**: `Enter`, `Space` (`' '`), `ArrowLeft`, `Home` → `onMove`
            not called, `fireEvent.keyDown` returns `true`.
        (p) **pointer plumbing**: `fireEvent.pointerDown(handle, { button: 0, isPrimary: true,
            pointerId: 1 })` → `onDragStart(RULE.id)` once; `pointerMove` `{ pointerId: 1, buttons:
            1, clientY: 240 }` → `onDragOver(240)`; `pointerUp` `{ pointerId: 1 }` → `onDragEnd()`
            once; a second `pointerMove` after the up → `onDragOver` **not** called again (the ref
            is cleared).
        (q) **guards**: `pointerDown` with `button: 2` → nothing; with `isPrimary: false` →
            nothing; a `pointerMove` with `pointerId: 2` mid-drag → nothing; a `pointerMove` with
            `buttons: 0` mid-drag → `onDragCancel()` and a following `pointerUp` → `onDragEnd`
            **not** called; `pointerCancel` mid-drag → `onDragCancel()`; a second `pointerDown`
            mid-drag → `onDragStart` still called once.
        (r) **state props reach the `<li>`**: `dragging: true` → the `listitem` has
            `data-dragging`; `dropIndicator: 'after'` → `data-drop="after"`; both default →
            neither attribute present.
        (s) axe → `[]` with the enabled handle (the existing case now covers it — keep it).
        jsdom has no layout: never assert the pseudo-element, the cursor or the opacity.

- [x] **Task 4 — `<RulesEditor>`: state, geometry, announcement, focus** (AC: 1, 2, 5, 6, 7, 8,
      10)
  - [x] State and refs: `const [drag, setDrag] = useState<{ id: string; fromIndex: number;
        toIndex: number } | null>(null)` (ephemeral UI state — the three-category rule; **not** a
        ref, because the indicator renders from it; `setDrag` is called only when `toIndex`
        changes, so a 60 Hz `pointermove` costs no render while the pointer stays in one slot);
        `const [announcement, setAnnouncement] = useState<{ text: string; seq: number } | null>
        (null)`; `const pendingFocusIdRef = useRef<string | null>(null)`; `const instructionsId =
        useId()`. Keep `rootRef` / `prevIdsRef`.
  - [x] `commitMove(id, toIndex)` (the one path both inputs share):
        ```ts
        const from = rules.findIndex((rule) => rule.id === id);
        const to = Math.max(0, Math.min(rules.length - 1, toIndex));
        if (from === -1 || from === to) return;
        pendingFocusIdRef.current = id;
        setAnnouncement((a) => ({ text: `Rule moved to position ${to + 1} of ${rules.length}`, seq: (a?.seq ?? 0) + 1 }));
        onRulesChange((current) => moveRule(current, id, to));
        ```
        `handleMove = useCallback((id, toIndex) => commitMove(id, toIndex), [rules,
        onRulesChange])` — it reads `rules` for the clamp and the sentence; a per-render callback is
        fine here (no hot path; the card's `useCallback`s take it as a dep, as `handleChange` is
        today).
  - [x] Pointer callbacks: `handleDragStart(id)` → `if (drag !== null) return; const fromIndex =
        rules.findIndex(...); if (fromIndex === -1) return; setDrag({ id, fromIndex, toIndex:
        fromIndex })`. `handleDragOver(clientY)` → `if (drag === null) return;` measure
        `root.querySelectorAll<HTMLElement>('[data-rule-id]')` in DOM order, skip the dragged
        card's, `toIndex = count of rects with (top + height / 2) < clientY`; `if (toIndex !==
        drag.toIndex) setDrag({ ...drag, toIndex })`. `handleDragEnd()` → `if (drag === null)
        return; const { id, fromIndex, toIndex } = drag; setDrag(null); if (toIndex !== fromIndex)
        commitMove(id, toIndex)`. `handleDragCancel()` → `setDrag(null)`. (Use the functional
        `setDrag((d) => …)` form inside `handleDragOver` if the closure over `drag` proves stale
        between pointer events — measure with the test in (f) below; the guard `d === null ||
        d.toIndex === toIndex ? d : { ...d, toIndex }` keeps the same-reference no-op.)
  - [x] Escape (AC6): `useEffect(() => { if (drag === null) return; const onKeyDown = (event:
        KeyboardEvent) => { if (event.key !== 'Escape') return; event.stopPropagation();
        setDrag(null); }; document.addEventListener('keydown', onKeyDown, true); return () =>
        document.removeEventListener('keydown', onKeyDown, true); }, [drag])` — keyed on the
        **nullness** (`drag !== null`) rather than the object, so a `toIndex` change does not
        re-subscribe: `const dragging = drag !== null;` … `[dragging]`. Comment: why capture on
        `document` (MUI `Modal`'s Escape handler is a React `onKeyDown` on the modal root; React
        listens at its root container; a `document` capture listener runs before both on every
        engine; `disableEscapeKeyDown` is gone in v9), why `stopPropagation` not
        `preventDefault` (MUI does not check `defaultPrevented`), why WebKit rules out the handle's
        own `onKeyDown` (no focus on pointerdown).
  - [x] Per-card derived props (in the `rules.map`): `dragging = drag?.id === rule.id`;
        `dropIndicator`: `null` unless `drag !== null && drag.toIndex !== drag.fromIndex`; then
        compute `others = rules.filter((r) => r.id !== drag.id)`; the card `others[drag.toIndex]`
        (when `drag.toIndex < others.length`) gets `'before'`, else `others[others.length - 1]`
        gets `'after'`; every other card `null`. Compute the target id **once per render** above
        the map (`dropTargetId` + `dropSide`), not per card.
  - [x] The focus effect (AC8): the same-length branch becomes
        ```ts
        } else if (ids.length === prev.length) {
          const pending = pendingFocusIdRef.current;
          if (pending !== null) cardControl(pending, '[data-drag-handle]')?.focus();
        }
        pendingFocusIdRef.current = null;   // every run — a stale ref must never fire later (AC8)
        prevIdsRef.current = ids;
        ```
        Keep the trailing comment, now: "Same-length changes move no focus, EXCEPT a reorder (Story
        4.12), which re-focuses the moved card's handle: React re-inserts the moved `<li>` and the
        browser blurs a node that is removed, so the handle the user was on has lost focus by the
        time this runs."
  - [x] Markup, inside the list branch, **after** the `<ol>` (an `<ol>` may hold only `<li>`s):
        ```tsx
        <VisuallyHidden id={instructionsId}>
          Press Up Arrow or Down Arrow to move this rule. With a pointer, drag the handle.
        </VisuallyHidden>
        <VisuallyHidden role="status" data-reorder-status>
          {announcement !== null && <span key={announcement.seq}>{announcement.text}</span>}
        </VisuallyHidden>
        ```
        `VisuallyHidden = styled('div')` with `<ColorPickerField>`'s rule set (`:228-235`), copied
        (second caller — comment says so). The status region is inside the list branch: with zero
        rules there is nothing to announce and the empty state mounts instead (the region
        re-mounts with the list; a move is only possible with ≥ 2 rules, so "exists before its
        content changes" holds for every reachable announcement).
  - [x] Pass to every `<RuleCard>`: `onMove={handleMove}`, `onDragStart={handleDragStart}`,
        `onDragOver={handleDragOver}`, `onDragEnd={handleDragEnd}`,
        `onDragCancel={handleDragCancel}`, `dragging`, `dropIndicator`,
        `describedBy={instructionsId}`.
  - [x] Header comment: the reorder paragraph — one commit path for two inputs, why the geometry
        lives here, why `drag` is state and `pendingFocusId` a ref, the Escape listener, `(Story
        4.12) (FR-2.6) (UX-DR11) (UX-DR17)`; the FD6 paragraph's "same-length" sentence gains the
        reorder exception.
  - [x] `RulesEditor.test.tsx` — `Harness` unchanged; a `rectsFor(tops)` helper that
        `vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ top, height: 100, bottom: top +
        100, left: 0, right: 500, width: 500, x: 0, y: top, toJSON() {} })` on each `[data-rule-id]`
        in DOM order with tops `0 / 112 / 224` (the `<PetriDishCanvas>` `RECT` idiom — jsdom
        performs no layout). Add:
        (n) **ArrowDown moves the rule, renumbers, re-focuses the moved handle, announces**: with
            `THREE`, `.focus()` on `Reorder rule 1`, `user.keyboard('{ArrowDown}')` → badges
            `Survive, Born, Die`; `activeElement` is `Reorder rule 2` (the same rule, now second —
            assert via the group `Rule 2` containing an Action combobox valued `born`); status
            region text `Rule moved to position 2 of 3`; `latest[0]` **is** `THREE[1]`, `latest[2]`
            **is** `THREE[2]`.
        (o) **ArrowUp moves it back; the identical sentence is a fresh node**: continue from (n)
            with `{ArrowUp}` → original order, `Reorder rule 1` focused; then `{ArrowDown}` again
            → the status `<span>` is a **different element** from the one after (n) (hold a
            reference; `not.toBe`).
        (p) **boundaries are consumed no-ops**: `Reorder rule 1` + `{ArrowUp}`, `Reorder rule 3` +
            `{ArrowDown}` → `latest` **is** the array before (same reference via `onState`), focus
            unchanged, status region empty. Assert `preventDefault` via `fireEvent.keyDown(...)
            === false` on the boundary key.
        (q) **a pointer drag down**: `rectsFor([0, 112, 224])`; `fireEvent.pointerDown(handle1, {
            button: 0, isPrimary: true, pointerId: 1 })` → the first `listitem` has
            `data-dragging`, no `data-drop` anywhere (same slot); `pointerMove` `{ pointerId: 1,
            buttons: 1, clientY: 300 }` → the third `listitem` has `data-drop="after"`, the others
            none; `pointerUp` → badges `Survive, Die, Born`; no `data-dragging` / `data-drop`;
            `activeElement` is `Reorder rule 3`; status `Rule moved to position 3 of 3`.
        (r) **a pointer drag up, `before` indicator**: from handle 3, `clientY: 40` → the first
            `listitem` has `data-drop="before"`; up → `Die, Born, Survive`.
        (s) **a pointer drag back to its own slot commits nothing**: handle 2, move to `clientY:
            300` (indicator on card 3), then `clientY: 160` (own slot — indicator gone), up →
            `latest` is the same reference as before, no announcement.
        (t) **Escape cancels and is stopped**: render the `Harness` inside `<div
            onKeyDown={spy}>`; mid-drag (after (q)'s move) `fireEvent.keyDown(handle1, { key:
            'Escape' })` → no `data-dragging`, no `data-drop`, `spy` **not** called; the following
            `pointerUp` → order unchanged, `latest` same reference. Then, with no drag active,
            `fireEvent.keyDown(handle1, { key: 'Escape' })` → `spy` called once (the listener is
            gone).
        (u) **pointercancel cancels**: mid-drag `fireEvent.pointerCancel(handle1, { pointerId: 1
            })` → attributes gone, order unchanged.
        (v) **a second pointer is ignored**: mid-drag `pointerDown(handle2, { pointerId: 2, button:
            0, isPrimary: false })` → still exactly one `data-dragging`, on card 1; `pointerMove(
            handle1, { pointerId: 2, buttons: 1, clientY: 300 })` → no indicator moves.
        (w) **existing same-length changes still move no focus**: the existing summary / action /
            condition cases already cover it — add one assertion to (n): after the move, a
            summary keystroke in `Rule 3` leaves focus there (the ref was cleared).
        (x) axe → `[]` after (n) (status populated).

- [x] **Task 5 — `<OrganismEditorModal>` integration** (AC: 2, 6)
  - [x] `OrganismEditorModal.tsx`: **no code change** — `<RulesEditor>` owns everything. Update
        the `survivalRules` sentence in the header comment ("… and Story 4.12's order").
  - [x] `OrganismEditorModal.test.tsx`, appended, scoped `within(rulesRegion)`: (9) add three rules
        via the header action, set the second's Action to `survive`, focus `Reorder rule 2`,
        `{ArrowUp}` → `Rule 1`'s Action is `survive`, `activeElement` is `Reorder rule 1`; (10)
        **Escape mid-drag does not close the dialog**: `pointerDown` on `Reorder rule 1`, then
        `fireEvent.keyDown(handle, { key: 'Escape' })` → the `onClose` mock **not** called; after
        `pointerUp`, `fireEvent.keyDown(handle, { key: 'Escape' })` → `onClose` called (the
        listener is gone and the dialog's own path works) — this is the one test that proves the
        capture listener against the **real** MUI `Dialog`.

- [x] **Task 6 — e2e against the served static export** (AC: 1, 2, 5, 6, 10, 11c)
  - [x] `organisms.spec.ts`: retarget the two 4.10 tests per AC11c. Append `test.describe('rule
        reordering (Story 4.12)')` after the 4.11 block, forking `openRules` / `cardGroup` (local to
        their describes) plus `handle(rules, n)` = `rules.getByRole('button', { name: `Reorder
        rule ${n}`, exact: true })`, `badges(rules)` = `rules.locator('[data-rule-badge]')
        .allTextContents()`, and `threeCards(page)` = header add ×3, card 2 → `survive`, card 3 →
        `die` (the 4.10 axe test's setup). Tests:
        1. **Keyboard: ArrowUp moves, renumbers, keeps focus on the moved card, announces; the top
           is a consumed no-op; zero console errors**: `threeCards`; `handle(3).focus()`;
           `ArrowUp` → badges `['Born', 'Die', 'Survive']`, `handle(2)` `toBeFocused()`,
           `rules.locator('[data-reorder-status]')` `toHaveText('Rule moved to position 2 of
           3')`; `ArrowUp` → `['Die', 'Born', 'Survive']`, `handle(1)` focused, status `… 1 of
           3`; `ArrowUp` → unchanged, still `handle(1)`; `ArrowDown` → `['Born', 'Die',
           'Survive']`, `handle(2)`. Every literal badge text carries the `ruleActionLabel`
           source comment (or import the labels — the spec imports only `@gol/*`, and
           `ruleActionLabel` lives in `apps/web/lib`; use literals with the comment, as 4.10 does).
        2. **Pointer: drag card 1 below card 3 — dragging state, `after` indicator, drop
           renumbers**: `threeCards`; `boxOf(handle(1))` and `boxOf(cardGroup(3))`;
           `page.mouse.move(hx, hy)`, `mouse.down()` → `rules.locator('li[data-dragging]')`
           `toHaveCount(1)` and `toContainText('Rule 1')`; `mouse.move(hx, g3.y + g3.height + 4,
           { steps: 8 })` → `rules.locator('li[data-drop="after"]')` `toHaveCount(1)` and
           `toContainText('Rule 3')`; `mouse.up()` → badges `['Survive', 'Die', 'Born']`, no
           `[data-dragging]`, no `[data-drop]`, `handle(3)` `toBeFocused()`.
        3. **Pointer: drag card 3 above card 1 — `before` indicator**: move to `g1.y + 4` → card 1
           `li[data-drop="before"]`; up → `['Die', 'Born', 'Survive']`.
        4. **Escape mid-drag cancels and the editor stays open**: down on `handle(1)`, move below
           card 3, `page.keyboard.press('Escape')` → no `[data-dragging]`, no `[data-drop]`, the
           dialog still `toBeVisible()`, badges unchanged; `mouse.up()` → still unchanged. (In
           WebKit the handle is not focused after `mouse.down()`, which is exactly the case the
           document listener exists for — the four-browser matrix on the PR is where that is
           proven; Chromium locally.)
        5. **Tab order: the handle is the card's first stop**: two cards; `handle(1).focus()`;
           `Tab` → `Delete rule 1`; from `+ Add Condition` of card 1, `Tab` → `handle(2)`;
           `Alt+Tab` on WebKit (the 4.3 note).
        6. **axe after a keyboard reorder** → `[]` (never mid-drag — the FD7 comment in the test).
  - [x] ⚠️ Run e2e against **this tree's** build: `deferred-work.md`'s port-reuse trap (`lsof -i
        :4173` first; state the result in the Dev Agent Record). `npm run ci:dev` (Chromium only).

- [x] **Task 7 — Bundle measurement, docs, verification** (AC: 9, 12)
  - [x] Measure before (on `main`, all four routes + the editor chunk — `grep -rl "Organism
        Color" .next/static/chunks/*.js`, `gzip -c | wc -c`) and after Task 6; record both. Do
        **not** edit `budgetGzipKb`.
  - [x] `deferred-work.md`:
        - `:1500-1501` (4.10 — the handle ships `disabled`): strike as `✅ Resolved in Story 4.12`
          (the `~~entry~~ — ✅ Resolved` idiom, prose kept).
        - `:1586-1587` (4.11 — no arrow-key navigation between rows): **partial** — arrow keys now
          reorder rules from the handle; arrow-key *navigation* between condition rows is still
          unbuilt (no AC asks); re-point to Story 6.11 / the UX reconciliation touch.
        - `:1588-1589` (4.11 — `RULE_ACTIONS` derives in `apps/web`): strike as `✅ Resolved in
          Story 4.12` (Task 1).
        - Add `## Deferred from: Story 4-12-rule-reordering (<date>)` with: (1) **no auto-scroll of
          the Rules column during a pointer drag** (FD8) — the wheel still scrolls it, and the
          keyboard path covers any list length; (2) **no grab/drop keyboard mode, no Home/End**
          (FD2) — one key, one move; (3) **a boundary key is silent** — no "already first"
          announcement (FD2); (4) **axe is not run mid-drag** (FD7) — `opacity: 0.5` on the dragged
          card is a transient state; (5) **`VisuallyHidden` has two copies** (`<ColorPickerField>`,
          `<RulesEditor>`) — the third caller lifts it into `fieldStyles.ts`; (6) **no unreachable-
          rule hint** (RFC-004 Risk 8: a later rule shadowed by an earlier one) — out of MVP
          scope by the RFC's own line; (7) **no drag threshold** — a plain click on the handle
          flashes the dragging style for the click's duration (NFR-4.2 feedback, harmless; a 4px
          threshold is a one-line change if the flash is unwanted); (8) **the mockup has no
          dragging CSS** — `.rule-card.dragging` / drop-zone styles do not exist in either theme's
          HTML; AC1's values (0.5 / accent border / `--gol-shadow-tile-hover` / 2px accent line)
          are this story's reading of the design doc's prose (`:376-379`, `:595-600`) and belong
          in the next UX touch; (9) **condition rows are not reorderable** — AND-combined, order
          is irrelevant (FR-2.5), nothing to build.
  - [x] `docs/project-context.md` — **no new rule**. Candidate only if a second story trips on it:
        "React re-inserting a keyed sibling blurs it — re-focus after any DOM reorder".
  - [x] `npm run ci:dev > ci.log 2>&1; echo $?` — paste the exit code, the bundle lines, the
        domain / simulation / test-utils coverage lines and the e2e summary into the Dev Agent
        Record. Push to `story/4-12-rule-reordering`; `gh run list --limit 1` after the PR opens.

## Dev Notes

### Forced decisions (made here so the dev agent does not have to)

- **FD1 — Hand-rolled Pointer Events, no drag-and-drop dependency.** Nothing is installed
  (`package.json` has no `dnd`, `sortable`, `framer`), no AR names one (AR-35 is MUI-core-only;
  RFC-003 Decision 4 admits Framer Motion "sparingly" and it too is uninstalled), and the version
  policy is "do not add opportunistically". The requirement is one vertical list of same-width
  cards with a dedicated handle — the smallest sortable there is. The repo already owns the
  pointer idiom this needs (`<PetriDishCanvas>`: capture, `pointerId` guard, `buttons` self-heal,
  the jsdom `?.` guards; `<BattleEditorView>`: `touchAction: 'none'`). Native HTML5 DnD
  (`draggable`) was rejected: no touch support, a browser-owned drag image the AC's "elevates with
  semi-transparency" cannot style, and `dragover` firing at ~350 ms intervals in Firefox. A library
  would cost 8–15 KB gzip on the lazy chunk for a pattern this story pins in ~120 lines.

- **FD2 — Keyboard is "one key, one move", not grab-and-drop.** The AC says "via the focused drag
  handle and arrow keys", not Space/Enter. A grab mode has three states to announce (grabbed,
  moved, dropped) and an Escape-to-revert whose semantics collide with the dialog's Escape;
  immediate moves have one state, are reversible with the opposite key, and the announcement (FD4)
  says exactly where the rule went. Boundaries consume the key and change nothing: an ArrowDown
  on the last card that scrolled the column instead would read as "the key did something else".
  Home/End are not built (recorded) — nothing in the AC or UX-DR17 asks.

- **FD3 — Focus is re-placed on the moved card's handle after every move, by the effect.** React
  reorders keyed siblings with `insertBefore`, which removes the node first, and every engine's
  focus-fixup blurs a removed node (the exact gap `Node.moveBefore()` was minted for — React
  19.2 does not use it). So "focus stays on the handle" is not free: without the effect, a
  keyboard user's second ArrowDown lands on `<body>` → MUI's `FocusTrap` polls `<body>` and
  re-focuses the dialog root (the 4.10 race). The effect is the one place the 4.10 design already
  moves focus after a list change, and a `pendingFocusIdRef` is legitimate here because the
  initiator is inside the component (contrast 4.10 FD6's rejection, which was about the header
  slot). Pointer drops re-focus the same way — uniform, and the handle is a non-destructive
  target (Story 4.10 AC5).

- **FD4 — An always-mounted `role="status"` announces the result; a keyed `<span>` defeats
  identical-text suppression.** After a keyboard move the focused control is the same button,
  its accessible name changed (`Reorder rule 2`), and no screen reader announces a name change on
  the focused element. Story 4.10 declined a live region for add/delete because focus *moves*
  there; here it does not. "Rule moved to position N of M" is the sentence; `<span key={seq}>` is
  the mechanism — a live region announces **additions**, and replacing text with identical text
  is not an addition in every AT, but a new node is. The region is inside the list branch (a
  move needs ≥ 2 rules, so it always exists before its first content), visually hidden (sighted
  users get the renumbered labels), and never announces a cancel or a no-op.

- **FD5 — Geometry is midpoints of the *other* cards; the indicator sits on a neighbour, not in a
  slot.** The resulting index of the moved rule equals the number of other cards whose midpoint
  is above the pointer — one formula for up and down, no "which side of the dragged card"
  branch, and it is exactly `moveRule`'s `toIndex`. The line is a pseudo-element on the adjacent
  `<li>` rather than a separate element between cards: an `<ol>` may hold only `<li>` children,
  and an extra `<li>` — even `aria-hidden` — changes the `listitem` count Story 4.10's tests pin.
  No indicator at the original slot: an accent line saying "drop here to change nothing" is
  noise, and it lets the test assert "no `[data-drop]`" as the no-op signal.

- **FD6 — Escape mid-drag is caught on `document` in the capture phase and stopped.** MUI's
  `Modal` closes on any un-stopped Escape `keydown` (React `onKeyDown` on the modal root; v9 has
  no `disableEscapeKeyDown` — the `<OrganismEditorModal>` comment). The handle's own `onKeyDown`
  cannot be the cancel path: WebKit does not focus a `<button>` on pointerdown, so mid-drag the
  key goes to whatever was focused before. A `document` capture listener runs before React's root
  listener on every engine; `stopPropagation()` is the lever because MUI does not consult
  `defaultPrevented`. The listener lives only while a drag is active (effect keyed on `drag !==
  null`), so Escape with no drag behaves exactly as today and Story 4.23's guard is unaffected.

- **FD7 — No axe scan mid-drag.** `opacity: 0.5` on the dragged card is the AC's
  "semi-transparency"; it halves every text ratio on that card for the life of the gesture. A
  transient pointer state is not one of the "settled states" the e2e axe idiom scans (the 4.3
  `openEditor` reasoning), and painting the elevation without the transparency would drop half
  the AC. Recorded.

- **FD8 — No auto-scroll during a pointer drag.** With capture, the pointer can leave the column;
  cards beyond the viewport still have rects, so dragging past the bottom edge targets the last
  card, and the wheel scrolls the column mid-drag natively. Edge-triggered auto-scroll is a
  `requestAnimationFrame` loop with its own tests and its own cancellation surface — a story's
  worth for lists this editor will rarely grow past the viewport. The keyboard path handles any
  length. Recorded.

- **FD9 — `RULE_ACTIONS` moves now.** The 4.11 deferred entry names "the next `ruleDraft.ts`
  touch"; this is it (Task 2 edits the file). Two lines in `@gol/domain`, one re-export, no caller
  changes, domain coverage unchanged.

### What exists — read these before writing a line

| File | Why it matters here |
|---|---|
| `apps/web/components/organisms/editor/RuleCard.tsx` | **Modified.** Read all 267 lines: the header's FD4 and Followers lines (`:33-44`), `Card` (`:55-62`, gains `position: relative` and the two attribute rule sets), `DragHandle` (`:72-86`, rewritten), `DeleteButton`'s focus ring (`:141-144`, copied to the handle), the handle markup (`:202-204`). |
| `apps/web/components/organisms/editor/RuleCard.test.tsx` | `renderCard` and its non-overridable callbacks (`:32-53`), cases (a) `:56-74` and (g) `:143-153` to retarget. |
| `apps/web/components/organisms/editor/RulesEditor.tsx` | **Modified.** The focus effect (`:112-169`) — its same-length comment (`:165-166`) is where AC8 lands; `cardControl` (`:126-127`) is the lookup to reuse; the handlers' `useCallback` shape (`:95-110`); the `rules.map` (`:186-196`). |
| `apps/web/components/organisms/editor/RulesEditor.test.tsx` | `THREE` (`:38-43`), the `Harness` with `onState` (`:51-79`), the non-loose focus case (`:209-220`), the 4.11 same-length case (`:275-305`). |
| `apps/web/components/organisms/editor/OrganismEditorModal.tsx:216-235, 238-260, 315-321` | `setSurvivalRules`' same-reference contract (why a boundary key costs nothing), the `Dialog`'s Escape comment (FD6's source), the `<RulesEditor>` mount. |
| `apps/web/components/organisms/editor/OrganismEditorModal.test.tsx` | The `onClose` mock and `LIBRARY`; the 4.10/4.11 cases to append after (`:404-560`). |
| `apps/web/components/organisms/editor/ColorPickerField.tsx:46-47, 228-235, 380-388` | 4.9 FD3 (always-mounted status region), `VisuallyHidden` (copied), the status markup. |
| `apps/web/components/PetriDishCanvas.tsx:655-661, 680-695, 725-745` | Pointer capture (guarded), the `pointerId` guard, the `buttons` bitmask self-heal, `pointercancel` / `lostpointercapture` handling. **The idiom, not the code** — nothing here paints. |
| `apps/web/components/PetriDishCanvas.test.tsx:896-925, 1003-1012, 1485-1536` | `RECT` + `getBoundingClientRect` spy, `buttons: 1` on moves (jsdom defaults it to 0), the second-pointer cases. |
| `apps/web/components/battle/editor/BattleEditorView.tsx:360-373` | `touchAction: 'none'` / `userSelect: 'none'` — the declarative rule and why not `preventDefault`. |
| `apps/web/lib/organisms/ruleDraft.ts` (+ test) | **Modified** (Tasks 1–2). `removeRule` (`:77-80`) is the same-reference shape `moveRule` follows; the `RULE_ACTIONS` lines (`:14-19`) to replace with the re-export. |
| `packages/domain/src/survivalRuleSchema.ts:52-66, 78-89` (+ test), `index.ts` | The four condition constants (Task 1 adds the fifth beside them), the schema, the barrel. |
| `apps/web/lib/themeTokens.test.ts:236-255` | The `var(--gol-…` source scan every new `styled()` rule must survive: literal token names only. |
| `apps/web/app/themes.css:113, 152-154` | `--gol-shadow-tile-hover` (the elevation), the rule-action tokens. |
| `apps/web/e2e/organisms.spec.ts:1-32, 1509-1676` | `openEditor`, the 4.10 block's `openRules` / `cardGroup` / `boxOf`, the keyboard test (`:1618-1649`) and the disabled-handle test (`:1651-1656`) to retarget. |
| `apps/web/e2e/battleRoute.spec.ts:385-401` | The `page.mouse.move / down / move / up` drag idiom against a `boundingBox()`. |
| `docs/planning-artifacts/ux-designs/…/organism-editor-design.md:376-379, 595-600, 725-738` | The drag spec (prose only), the reordering flow, the keyboard/SR lines. |
| `docs/planning-artifacts/ux-designs/…/clinical-lab-theme/organism-editor.html:527-540, 555-563` | `.rule-card` (no `.dragging` exists), `.drag-handle` + its hover. |
| `docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md:95-100, 289-291, 442-449, 486-500, 513, 894-896` | Order = priority; first match; phase-partitioned resolution (why the UI never groups by action); rule identity across reordering; Risk 8 (unreachable rules, out of scope). |
| `docs/planning-artifacts/architecture.md:356` | M10 — the order is priority *within* a phase, strategy-owned. |
| `docs/implementation-artifacts/4-10-rule-cards-empty-state.md` | FD4 (the disabled handle), FD6 (the focus effect and its `pendingFocus` rejection — read it to see why AC8's ref is a different case), AC5 (non-destructive targets). |
| `docs/implementation-artifacts/4-11-condition-builder.md` | The habits (Previous story intelligence below); the review's "tests ticked but never written" finding. |
| `docs/implementation-artifacts/deferred-work.md:1500-1501, 1533-1560, 1586-1589` | The entries Task 7 closes; the double-click cascade (same geometry hazard; a drop does not delete, so it does not apply here). |
| `docs/implementation-artifacts/lane-gates.yaml` | 4.15/4.24/4.25 gated on Epic 3; this story proposes no gate. |

### Architecture compliance

- **FR-2.6 / M10 / RFC-004 §2.3** — order is organism configuration; the UI edits one ordered
  list and never partitions it (the engine does, at compile time). No "Die rules first" hint, no
  per-phase sections (AC3).
- **RFC-004 §2.4** — `id` survives reordering; `key={rule.id}` keeps each card's `useId`s and its
  rows' `touched` with it across a move (AC3). No re-mint anywhere.
- **RFC-005 Decision 1 / AR-33** — `drag` and `announcement` are ephemeral modal-local state; the
  order lives in the one draft object; no Context, no store, no repository (AR-2 / AR-27).
- **Decision I** — no persisted-shape change (`RULE_ACTIONS` is a constant read off the schema).
- **AR-39 / AR-45** — `packages/domain` stays 100% per file.
- **RFC-003 Decision 3 / Decision J / AR-46** — `styled()` + `var(--gol-*)` only; the elevation is
  the existing `--gol-shadow-tile-hover`; no new token, no literal.
- **AR-35 / bundle** — no dependency; everything new rides the lazy editor chunk (AC12).
- **NFR-4.1** — the handle is now a real control that does what it looks like; the `disabled`
  honesty hatch closes.
- **NFR-4.2** — `pointerdown` paints the dragging state on the next frame; the indicator moves on
  the first `pointermove` that changes the slot.
- **UX-DR11 / UX-DR17** — elevation + transparency, accent drop indicator, renumber on drop;
  keyboard path from the handle; instructions via `aria-describedby`; result announced.
- **Story 4.10 FD6 / AC5** — the add/delete branches are untouched; the reorder target is
  non-destructive.
- **Spec-id hygiene** — `spec:check` tokenises `FR-2.5`, `FR-2.6`, `NFR-4.1`, `NFR-4.2`,
  `NFR-8.3`, `AR-2`, `AR-27`, `AR-33`, `AR-35`, `AR-39`, `AR-44`, `AR-45`, `AR-46`, `RFC-003`,
  `RFC-004`, `RFC-005`, `Decision I`, `Decision J`, `M10`, `Story 1.10`, `Story 3.4`,
  `Story 4.7`, `Story 4.9`, `Story 4.10`, `Story 4.11`, `Story 4.12`, `Story 4.15`, `Story 4.16`,
  `Story 4.23`, `Story 6.11`; write them exactly so. `UX-DR*`, `FD*`, `SC n.n.n` are not checked.
  ⚠️ Prior cards cite `NFR-2.1` for "no transition"; NFR-2.1 is the browser-support NFR. Cite the
  axe-mid-fade reasoning (Stories 2.13–2.15) instead — do not propagate the mis-cite.

### Library / framework notes (installed versions, no research needed)

- **React 19.2** — keyed sibling reorder uses `insertBefore` (no `moveBefore`), so a focused
  `<li>` descendant is blurred by the move (FD3); state updaters must be pure (`moveRule` is);
  `useId` for the instructions id; a `key` change on the status `<span>` remounts it (FD4);
  `data-*={undefined}` omits the attribute.
- **Pointer Events** — `setPointerCapture` on the `<button>` keeps `pointermove` / `pointerup`
  arriving at it wherever the pointer goes; `pointerup` after capture fires on the capturing
  element, not the element under the pointer; `lostpointercapture` fires after an explicit
  release too (the ordering the card's `end()` relies on); `event.button` is `-1` on a move —
  gate moves on `event.buttons & 1`.
- **jsdom 30** — has `PointerEvent` but no `setPointerCapture` / `releasePointerCapture` /
  `hasPointerCapture` (guard with `?.`); `getBoundingClientRect()` is all zeros (spy per
  element); `fireEvent.pointerMove` defaults `buttons` to `0` — pass `buttons: 1`;
  `fireEvent.keyDown` returns `false` when the handler called `preventDefault`; a `document`
  capture listener added in an effect fires for `fireEvent.keyDown(element, …)` (events bubble
  through `document`) — `stopPropagation` there keeps React's root handlers from seeing it.
- **@testing-library/user-event 14** — `user.keyboard('{ArrowDown}')` dispatches to the active
  element; use `fireEvent.pointerDown/Move/Up` for pointer sequences (user-event's `pointer` API
  does not drive capture semantics and its defaults differ).
- **MUI 9.3.1** — `Modal` closes on Escape `keydown` unless propagation is stopped before its
  root handler; `FocusTrap` polls for `<body>` every 50 ms (why FD3 must win the race);
  `styled()` pseudo-element keys are plain strings (`'&[data-drop="before"]::before'`).
- **Playwright 1.62** — `page.mouse.down()` / `move(x, y, { steps })` / `up()` drives Pointer
  Events with capture on every project; `keyboard.press('Escape')` targets the focused element
  (or `<body>`) — the document listener catches it either way; `getByRole(…, { name, exact: true
  })` on every numbered name.
- **fast-check** (installed) — `fc.integer()` for `toIndex`, `fc.nat({ max: 4 })` for the source;
  `fc.assert(fc.property(…))`, default 100 runs.

### Testing standards

- `apps/web` has **no coverage gate** — every test guards a named failure: a handle that still
  looks disabled (a), a card that clamps (n), a key that scrolls the column (p), focus falling to
  `<body>` after a move (n, q), an announcement that stays silent on a repeat (o), an Escape that
  closes the editor mid-drag (t, modal 10), a second pointer that hijacks a drag (v), a stale
  focus ref that fires on a keystroke (w), an indicator at the original slot (s), a move that
  mutates the draft (Task 2 g).
- `packages/domain` **is touched** (Task 1) — the coverage line must read 100% on every file;
  `packages/simulation` and `packages/persistence` untouched, their lines exactly as on `main`.
- Never snapshot; never assert computed colours, opacity or pseudo-elements in jsdom; never mock
  `useId` or `crypto.randomUUID`; never run axe with `[data-dragging]` present (FD7).
- The Story 4.10 / 4.11 tests are retargeted **only** as AC11 lists; if any other test fails, the
  change is wrong, not the test.
- Write every test file Task 3–5 names **before** ticking the task — the 4.11 review found two
  ticked tasks whose test files did not exist.

### Previous story intelligence (Story 4.11)

- Review found: tests ticked but never written (two files); a helper whose doc claimed "same
  reference" and allocated anyway; a fast-check arbitrary that never reached half the domain;
  comments asserting things the diff contradicted ("runs unedited" for a file the diff edits).
  The habits: prove every same-reference claim with a `toBe`; make the arbitrary cover the
  bounds; a Dev Agent Record carries the exit code, coverage lines and e2e summary, never the
  word "green".
- The 4.11 focus effect transposition worked because it was scoped (`rootRef`) and diffed ids —
  AC8 extends the same effect by one clause rather than adding a second effect.
- `CSS.escape` every id that reaches a selector (`cardControl` already does); derive names,
  never literals; no `as` / `!` in fixtures.
- The 4.11 editor chunk measured 9501 B gzip after review; measure `main` fresh.

### Git intelligence

`main` is at `71bc1a0` (a `.toml` chore after PR #56, 4.11). The last app-code commits are
4.11's (`components/organisms/editor/**`, `lib/organisms/**`, `packages/domain/src/**`,
`organisms.spec.ts`). **Shared code surfaces with the open Epic 3 lane (3.18 fullscreen run stage,
3.19 hotkeys): none** — this story's files are `components/organisms/editor/{RuleCard,
RulesEditor,OrganismEditorModal}.*`, `lib/organisms/ruleDraft.*`, `packages/domain/src/
{survivalRuleSchema,index}.ts` (+ test), `e2e/organisms.spec.ts`; 3.18/3.19 live in
`components/battle/simulation/**`, `lib/battle/**`, `battleRoute.spec.ts`. One soft overlap to
know about, not a conflict: 3.19's "hotkeys suspended while a dialog is open" and this story's
document-capture Escape listener are both keyboard concerns at the document level — but 3.19's
surface is `<BattlePage>` and this listener exists only while a drag is active inside the
editor modal, which 3.19 cannot reach until 4.24 mounts the modal over the battle. `deferred-
work.md` is append-only plus strike-throughs.

### Project Structure Notes

- New: nothing — no new component, no new lib file (a sortable is two handlers and a helper).
- Modified: `components/organisms/editor/RuleCard.tsx` (+ test), `RulesEditor.tsx` (+ test),
  `OrganismEditorModal.tsx` (comment) (+ test); `lib/organisms/ruleDraft.ts` (+ test);
  `packages/domain/src/survivalRuleSchema.ts` (+ test), `index.ts`; `e2e/organisms.spec.ts`;
  `docs/implementation-artifacts/deferred-work.md`, `sprint-status.yaml`.
- Naming: helper `moveRule`; props `onMove`, `onDragStart`, `onDragOver`, `onDragEnd`,
  `onDragCancel`, `dragging`, `dropIndicator`, `describedBy`; data attributes `data-dragging`,
  `data-drop` (`before` | `after`), `data-reorder-status` (existing: `data-drag-handle`,
  `data-rule-id`, `data-rule-card`); status sentence `Rule moved to position N of M`;
  instructions `Press Up Arrow or Down Arrow to move this rule. With a pointer, drag the handle.`;
  domain `RULE_ACTIONS`, `RuleAction`.
- Untouched on purpose: `ConditionRow.tsx` / `ConditionsEditor.tsx` (+ tests), `conditionDraft.ts`,
  `AddRuleButton.tsx`, `OrganismEditorLayout.tsx` (+ test), `fieldStyles.ts`,
  `useOrganismEditorModal.ts`, `OrganismLibrary.tsx`, `organismDraft.ts`, `themes.css`,
  `themeTokens.test.ts`, `theme.ts`, every file under `components/battle/**`,
  `packages/simulation/**`, `packages/persistence/**`, `packages/test-utils/**`,
  `playwright.config.ts`, `scripts/check-bundle-size.mjs`, `docs/project-context.md`.

### What NOT to build

- ❌ No drag-and-drop dependency, no HTML5 `draggable` / `dragstart` / `dragover` — FD1.
- ❌ No grab/drop keyboard mode, no Space/Enter/Home/End on the handle — FD2.
- ❌ No auto-scroll loop, no `requestAnimationFrame` — FD8.
- ❌ No `transition`, no `transform`, no animation of the reorder — the axe-mid-fade rule; AR-38's
  "no UI animation during simulation" is moot here but the house style holds.
- ❌ No new `--gol-*` token, no `rgba` / hex literal — `--gol-shadow-tile-hover` and
  `--gol-accent` are the elevation and the line.
- ❌ No phase grouping, no sorting by action, no "Die first" hint, no unreachable-rule hint —
  AC3 / RFC-004 Risk 8.
- ❌ No `contentHash`, no persistence, no repository — Story 4.16. No dirty flag — Story 4.23.
- ❌ No second `useEffect` for focus — extend the existing one (AC8).
- ❌ No `document.querySelector` — every lookup through `rootRef`.
- ❌ No `aria-grabbed` / `aria-dropeffect` (deprecated in ARIA 1.1), no `aria-live` on the
  handle, no `aria-sort`.
- ❌ No `preventDefault` on `pointerdown` — `touchAction` / `userSelect` are the declarative
  form; `preventDefault` there also blocks focus on the button in Chromium.
- ❌ No `disabled` left on the handle in any state — while dragging, the other handles stay
  enabled (a second pointer is ignored by the guards, AC7).
- ❌ No change to `<ConditionsEditor>` / `<ConditionRow>` — condition order is irrelevant
  (AND-combined).
- ❌ No `useState` in `<RuleCard>` — the only new state is `<RulesEditor>`'s `drag` and
  `announcement`; the card holds one `pointerIdRef`.

### Open flags for the owner (not blockers — the story proceeds on the FD)

- **The mockup has no drag visuals** (deferred item 8): AC1's `opacity: 0.5`, accent border,
  `--gol-shadow-tile-hover` elevation and 2px accent line are this story's reading of the design
  doc's prose. If a different elevation (the mockup's `.rule-card.expanded` shadow, `:538-540`)
  or a lighter transparency is preferred, each is a one-value change on `Card`.
- **Keyboard is immediate-move** (FD2). If a grab-and-drop mode (Space to pick up, arrows to
  move, Space to drop, Escape to revert) is wanted for parity with `@dnd-kit`-style sortables,
  it is a state machine on top of the same `moveRule` and can land as a follow-up without
  touching the pointer path.
- **Escape mid-drag is swallowed at `document`** (FD6). It is scoped to the life of a drag and
  stops nothing else, but it is the first document-level capture listener in the editor; if that
  is unwanted, the alternative is to accept that Escape mid-drag closes the editor in WebKit.

### References

- `docs/planning-artifacts/epics.md:1128-1138` (Story 4.12 ACs), `:1103-1113` (4.10 — the card),
  `:1264-1275` (4.23 — "order" activates the dirty scope), `:1177-1187` (4.16 — persistence),
  `:236` (UX-DR11), `:242` (UX-DR17), `:206` (AR-35), `:209` (AR-38), `:48, :261` (FR-2.6).
- `docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md:206-210` (FR-2.6), `:344, :354`
  (FR-5.2/5.3 — where the order is applied), `:627-628` (NFR-4.2).
- `docs/planning-artifacts/architecture.md:356` (M10), `:371` (M15 — the phase-partitioned pair),
  `:382` (traceability: rule order is config).
- `docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md:95-100, 289-291, 442-449,
  475-477, 486-500, 513, 729-731, 894-896`.
- `docs/planning-artifacts/rfcs/RFC-003-frontend-ui-architecture.md:167, 183, 224-227`
  (Decision 3 `styled()`, Decision 4 animation, "prefer CSS/transform", "debounce interactive
  animations").
- `docs/planning-artifacts/ux-designs/ux-GameOfLife-2026-05-27/organism-editor-design.md:85-89,
  350-357, 376-379, 595-600, 725-738`; `clinical-lab-theme/organism-editor.html:527-540,
  555-563, 1006-1013, 1304-1320`.
- `docs/implementation-artifacts/4-10-rule-cards-empty-state.md` (FD4, FD6, AC5, Review
  Findings); `4-11-condition-builder.md` (Review Findings, the habits); `4-9-…` (FD3 status
  region); `2-6-…` → `epic-2/` (pointer capture, `touchAction`, the stroke idiom).
- `docs/implementation-artifacts/deferred-work.md:1500-1501, 1533-1560, 1586-1589`.
- `docs/implementation-artifacts/lane-gates.yaml`.
- `docs/project-context.md` — Language rules (no escape hatches; `isolatedModules` type exports),
  Framework rules (three state categories; `styled()` + tokens; no repository import), Testing
  rules (coverage floors per package; axe; never snapshot; fast-check for invariants; the
  Playwright viewport band), Code Quality (AR-46; `spec:check`; comments explain why), Commit
  gate.

## Dev Agent Record

### Agent Model Used

Sonnet (claude-sonnet-5), per the story's own "Dev Model: sonnet" note, for Tasks 1–7 up to the
first `ci:dev` run. That session hit a usage limit with one e2e red and the record unwritten;
Opus 5 (claude-opus-5) resumed in the same tree (2026-09-18): diagnosed and fixed the e2e, ticked
the tasks, wrote this record, re-ran `ci:dev`.

### Debug Log References

- `lsof -i :4173` before the e2e run: no listener — no port-reuse trap (`deferred-work.md`).
- **The one red on the first `ci:dev`** — `pointer: drag card 1 below card 3` failed at
  `li[data-dragging]` `toHaveCount(1)` right after `mouse.down()`, deterministically (3/3 on
  `--repeat-each`). Probe: `handle(1).boundingBox()` reported **y = −444** at the 1280×720
  viewport — the third `+ Add Rule` focused the new card's handle (the 4.10 focus effect), which
  scrolled the Rules column past card 1, and `document.elementFromPoint` at that y returned
  nothing. Three 371px cards in a 632px column never fit together, so the spec's Task 6.2 sketch
  (measure both boxes, drag) could not pass as written. Fix in the test, not the component:
  `scrollIntoViewIfNeeded()` on handle 1 before measuring; card 3's bottom is then *below* the
  viewport, which exercises FD8 for real — with capture Chromium still delivers the `pointermove`
  at y ≈ 1332 and the off-screen card's rect resolves the `after` slot. The same scroll was
  missing from `Escape mid-drag cancels`, which had been passing **vacuously** (no drag ever
  started, so "nothing changed" held trivially); it now asserts `li[data-drop="after"]` before
  pressing Escape. 12/12 green on `--repeat-each=2` for the block.
- `npm run ci:dev > ci.log 2>&1; echo $?` → **exit 0** (second run, after the fix above).
  - `packages/domain`: **100% stmts / 100% branch / 100% funcs / 100% lines** on every file
    (109 tests) — `RULE_ACTIONS` adds no branch; pinned by `describe('action universe')`.
  - `packages/simulation`: **100/100/100/100** (407 tests), untouched by this story.
  - `packages/test-utils`: **94.44% stmts / 90.09% branch / 100% funcs / 97.07% lines** aggregate
    (89 tests; ≥80% floor, Story 3.7), unchanged.
  - `apps/web` (no gate; 1627 tests, 102 files): `ruleDraft.ts` 100/100/100/100; `RuleCard.tsx`
    96.61 / 88 / 100 / 98.18 (uncovered `:284` is the `hasPointerCapture` false arm of `endDrag`,
    jsdom-only); `RulesEditor.tsx` 96.63 / 83.6 / 100 / 100 (the uncovered branches are the
    `root === null` / `?.` jsdom guards in the geometry and focus effect).
  - Bundle (`scripts/check-bundle-size.mjs`): `/` 333.8 KB / 340 KB budget (6.2 KB headroom),
    `/battle` 309.0 KB / 310 KB (1.0 KB), `/battle/new` 308.9 KB / 310 KB (1.1 KB), `/organisms`
    295.6 KB / 305 KB (9.4 KB) — every route within +0.1 KB of `main` (Story 4.11's post-merge
    figures: 333.7 / 309.0 / 308.8 / 295.5; only the toml chore #57 merged since). The lazy
    editor chunk (`grep -rl "Organism Color" .next/static/chunks/*.js`) moved **9501 B → 10700 B
    gzip (+1199 B / +1.17 KB)** — inside AC12's ≈ +1.0–1.5 KB estimate. **No budget raised.**
  - Bench (`npm run bench` + `bench:check`): frame 7.560 ms of the 16.667 ms budget (9.107 ms
    headroom) — unaffected by this story (no engine/render code touched).
  - e2e (Chromium only, `npm run e2e:chromium`): **194 passed, 1 skipped** (pre-existing, unrelated) across `apps/web/e2e/**`, including
    the new `rule reordering (Story 4.12)` block (6 tests) and the two retargeted 4.10 tests
    (AC11c: the handle is now the card's first Tab stop; "the drag handle is disabled" replaced by
    the enabled-handle assertion).

### Completion Notes List

- Task 1: `RULE_ACTIONS` / `RuleAction` moved into `@gol/domain`'s `survivalRuleSchema.ts`, read
  off `SurvivalRuleSchema.shape.payload.shape.action.options` (never a second literal tuple),
  exported from `index.ts`; `ruleDraft.ts` re-exports both so no caller changes. Domain test
  `action universe` pins order and schema round-trip. Closes `deferred-work.md`'s 4.11 entry (FD9).
- Task 2: `moveRule(rules, id, toIndex)` in `ruleDraft.ts` — pure, clamps to `[0, length-1]`,
  returns the **same reference** for an unknown id or a same-slot move (the 4.10 same-reference
  idiom), keeps every other rule by reference. Unit tests cover down/up/clamp/no-op/reference
  identity.
- Task 3: `<RuleCard>`'s handle is live: `cursor: grab`/`grabbing`, the `DeleteButton` focus ring,
  `touchAction: 'none'` + `userSelect: 'none'` set declaratively (FD1 — no `preventDefault` on
  `pointerdown`); `onKeyDown` maps ArrowUp/ArrowDown to `onMove(id, index ± 1)` and consumes them
  (the editor clamps, not the card); Pointer Events plumbing transposed from `<PetriDishCanvas>`
  (capture, `pointerIdRef` guard, `button === 0 && isPrimary`, the `buttons & 1` self-heal,
  `pointercancel` / `lostpointercapture` as cancel, every capture call `?.`-guarded for jsdom).
  `data-dragging` / `data-drop` land on the `<li>` as boolean/enum attributes with the AC1 styles
  (0.5 opacity, accent border, `--gol-shadow-tile-hover`, a 2px accent `::before`/`::after` line).
- Task 4: `<RulesEditor>` owns the drag state (`{ id, fromIndex, toIndex }`), the geometry
  (`handleDragOver` reads the latest state through the updater and counts `[data-rule-id]`
  midpoints above `clientY`, every lookup through `rootRef`), the shared `commitMove` path for
  keyboard and drop, the FD3 re-focus (the existing focus effect extended with
  `pendingFocusIdRef`, no second effect), the FD4 always-mounted `role="status"`
  (`data-reorder-status`, `<span key={seq}>`), the `aria-describedby` instructions node, and
  the FD6 Escape cancel (a capture-phase `document` listener alive only while dragging,
  `stopPropagation` so MUI's `Modal` never sees it). `VisuallyHidden` copied from
  `<ColorPickerField>` (second copy — recorded).
- Task 5: `<OrganismEditorModal>` threads nothing new — `onRulesChange`'s functional updater
  already carries a reorder; two modal-level tests prove Action rides with the moved rule and that
  Escape mid-drag leaves the dialog open while a plain Escape closes it.
- Task 6: e2e `rule reordering (Story 4.12)` — keyboard move/renumber/focus/announce with the
  consumed top no-op and zero console errors, drag-below (`after`) and drag-above (`before`) with
  drop renumbering, Escape mid-drag, Tab order (handle first, `Alt+Tab` on WebKit), axe after a
  keyboard reorder. The two pointer tests scroll handle 1 into view first (see Debug Log). 4.10's
  two tests retargeted per AC11c only.
- Task 7: bundle measured before/after (Debug Log); `deferred-work.md` — two 4.10/4.11 items struck
  as resolved (the `disabled` handle, `RULE_ACTIONS`'s home), one marked partial (arrow-key
  *navigation* between rows → Story 6.11 / the UX touch), and a new `Deferred from: Story
  4-12-rule-reordering` section with the nine items Task 7 lists. `docs/project-context.md` left
  untouched (candidate rule recorded in the task, not promoted).

### File List

**New:**
- `docs/implementation-artifacts/4-12-rule-reordering.md`

**Modified:**
- `apps/web/components/organisms/editor/RuleCard.tsx`
- `apps/web/components/organisms/editor/RuleCard.test.tsx`
- `apps/web/components/organisms/editor/RulesEditor.tsx`
- `apps/web/components/organisms/editor/RulesEditor.test.tsx`
- `apps/web/components/organisms/editor/OrganismEditorModal.tsx`
- `apps/web/components/organisms/editor/OrganismEditorModal.test.tsx`
- `apps/web/lib/organisms/ruleDraft.ts`
- `apps/web/lib/organisms/ruleDraft.test.ts`
- `apps/web/e2e/organisms.spec.ts`
- `packages/domain/src/survivalRuleSchema.ts`
- `packages/domain/src/survivalRuleSchema.test.ts`
- `packages/domain/src/index.ts`
- `docs/implementation-artifacts/deferred-work.md`
- `docs/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-09-18 — Story file created (create-story): ACs decomposed, FD1–FD9 recorded, precedent and
  spec map compiled; status → ready-for-dev.
- 2026-09-18 — Tasks 1–7 implemented (dev-story, Sonnet); first `ci:dev` red on one e2e; session
  ended on a usage limit before the record was written.
- 2026-09-18 — Resumed by hand (Opus 5): the two pointer e2e tests scroll handle 1 into view
  before measuring (the 4.10 focus effect had scrolled it off-screen); Escape test now asserts the
  drag started; tasks ticked, record written, `ci:dev` green; status → review.

Dev Model: sonnet   # follows settled patterns — the PetriDishCanvas pointer idiom, the 4.10 focus-diff effect, the 4.9 status-region idiom, the ruleDraft same-reference helpers; the one new shape (a hand-rolled sortable: pointer plumbing in the card, geometry and state in the editor, a pure moveRule) is pinned with exact handlers, guards, selectors and tests, and no later story builds on it
Proposed lane gate: none

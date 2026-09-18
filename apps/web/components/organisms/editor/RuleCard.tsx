'use client';

import { useCallback, useId, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { styled } from '@mui/material/styles';
import {
  isRuleAction,
  MAX_RULE_SUMMARY_LENGTH,
  ruleActionLabel,
  RULE_ACTIONS,
  type RuleDraft,
} from '@/lib/organisms/ruleDraft';
import type { ConditionDraft, OrganismOption } from '@/lib/organisms/conditionDraft';
import { Field, Label, SelectInput, TextInput } from './fieldStyles';
import ConditionsEditor from './ConditionsEditor';

/**
 * One survival rule under edit (Story 4.10, AC4, FR-2.5): `⋮⋮ · [Born] · Rule N · ✕` in the
 * header, `Summary` then `Action` in the body. The AC's card — drag handle, coloured action
 * badge, rule label, delete button — NOT the 2026-06-01 mockup revision's accordion (FD1: the AC
 * is the story's authority, `deferred-work.md` records the divergence, the same fork Story 4.3
 * took for the header). Visual values still come from the mockup's CSS
 * (`clinical-lab-theme/organism-editor.html:527-726`); the *structure* is the AC's.
 *
 * Fully CONTROLLED, like every field in this editor: `<RulesEditor>` owns the list and this is a
 * thin view over one `RuleDraft`, with `index` (0-based) driving every derived name — "Rule N" is
 * NEVER stored (it renumbers on delete here, on drop in Story 4.12).
 *
 * - FD3 — the badge is border + text in the action colour on a TRANSPARENT background, no header
 *   hover: the mockup's 5% tints would need three more `--gol-*` tokens (AR-46) and the Die tint
 *   measures 4.72:1 for `--gol-danger` text on `--gol-bg-secondary` — one axe rounding from the
 *   4.5 floor. Without the tint the pair is the gated 4.90:1. The header is not clickable (this is
 *   not the accordion), so no `.rule-header:hover` either.
 * - FD7 — the mockup's per-action description paragraph is not built: it makes engine claims
 *   (Decision C, M10) nothing here can verify. Story 4.11 — the condition builder, where
 *   `cellState`'s `empty`/`alive`/`occupied` meaning gets explained — is where that copy earns its
 *   place.
 *
 * Story 4.11 mounts `<ConditionsEditor>` after Action. Story 4.12 removes the handle's
 * `disabled` and wires it live: this card owns only the pointer PLUMBING (capture, the `button` /
 * `isPrimary` / `pointerId` guards, the `buttons`-bitmask self-heal, `ArrowUp`/`ArrowDown`) —
 * the drag GEOMETRY (which slot the pointer is over) and the reorder STATE (`drag`, the
 * announcement) live one level up in `<RulesEditor>`, because a lone card has no siblings to
 * measure against. `key={rule.id}` is what keeps this card's `useId()`s and its condition rows'
 * `touched` state attached to the SAME rule across a reorder (RFC-004 §2.4 — identity survives a
 * move; AC3). Story 4.13 flags a zero-condition card at Save.
 *
 * `useId()` gives four ids per card (label, summary, counter, action) — the multi-instance case
 * `<OrganismNameField>`'s comment anticipated. Every decorative glyph (`⋮⋮`, `✕`) is a real
 * `aria-hidden` node inside a button whose accessible name comes from `aria-label` (the Story 4.9
 * review finding: generated content joins a control's accessible name).
 *
 * (Story 4.10) (Story 4.12) (FR-2.5) (FR-2.6) (UX-DR10) (UX-DR11) (UX-DR17) (AR-46)
 */

// The drop indicator's shared rule set (Story 4.12, AC1/FD5) — module-level, referenced from the
// two literal `data-drop` selectors below, never a selector built from the prop value (the
// `themeTokens.test.ts` `var(` scan, the `<RuleCard>` `ActionBadge` precedent).
const dropLine = {
  content: '""',
  position: 'absolute',
  left: 0,
  right: 0,
  height: '2px',
  background: 'var(--gol-accent)',
  pointerEvents: 'none',
} as const;

// `.rule-card` (`:527-536`). No `transition` on the hover border (the axe-mid-fade rule, Stories
// 2.13-2.15). `position: relative` anchors the two drop-indicator pseudo-elements (Story 4.12,
// AC1/FD5): they sit on the adjacent `<li>`, not a separate element between cards, because an
// `<ol>` may hold only `<li>` children and an extra one — even `aria-hidden` — would change the
// `listitem` count Story 4.10's tests pin.
const Card = styled('li')({
  position: 'relative',
  background: 'var(--gol-bg-secondary)',
  border: '1px solid var(--gol-border)',
  marginBottom: '12px',
  '&:hover': {
    borderColor: 'var(--gol-accent)',
  },
  // The dragged card itself (AC1): semi-transparent and elevated with the existing accent-glow
  // token (Story 1.10) — no new token, no `rgba` literal (AR-46).
  '&[data-dragging]': {
    opacity: 0.5,
    borderColor: 'var(--gol-accent)',
    boxShadow: 'var(--gol-shadow-tile-hover)',
  },
  // The drop indicator (AC1/FD5): a 2px accent line in the 12px `marginBottom` gap, on whichever
  // neighbour the drop would land beside — `-7px` centres the 2px line in that gap.
  '&[data-drop="before"]::before': { ...dropLine, top: '-7px' },
  '&[data-drop="after"]::after': { ...dropLine, bottom: '-7px' },
});

// `.rule-header` (`:542-548`). Not clickable — no `cursor: pointer`, no hover background.
const CardHeader = styled('div')({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '15px 18px',
});

// `.drag-handle` (`:555-563`, hover `:561-563`) — text-tertiary, transparent, no border. Story
// 4.12 wires it live: `cursor: 'grab'` / `'grabbing'` while active, a visible focus ring (the
// `DeleteButton` ring, copied), and the two declarative gestures that keep the browser from
// fighting a drag — `touchAction: 'none'` stops touch-scroll, `userSelect: 'none'` stops a fast
// mouse drag starting text selection (the `<BattleEditorView>` `:360-372` reasoning: CSS set
// BEFORE the gesture starts, never `preventDefault()` on `pointerdown`, which in Chromium would
// also suppress the button receiving focus).
const DragHandle = styled('button')({
  background: 'transparent',
  border: 0,
  padding: '0 4px',
  color: 'var(--gol-text-tertiary)',
  fontSize: '16px',
  lineHeight: 1,
  cursor: 'grab',
  touchAction: 'none',
  userSelect: 'none',
  '&:active': {
    cursor: 'grabbing',
  },
  '&:hover': {
    color: 'var(--gol-accent)',
  },
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
  },
});

// `.action-badge` (`:576-603`) minus the mockup's tints (FD3): border + text only, transparent
// background, three literal `data-action` selectors — NEVER an interpolated token name built from
// the action string, which `themeTokens.test.ts`'s reference scan cannot see through (AC7): its
// regex is `var\((--gol-[a-z0-9-]+)` and a template literal would register a truncated, undefined
// token.
const ActionBadge = styled('span')({
  border: '1px solid',
  padding: '4px 10px',
  fontSize: '10px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  borderRadius: 'var(--gol-radius)',
  flexShrink: 0,
  background: 'transparent',
  '&[data-action="born"]': {
    color: 'var(--gol-rule-born)',
    borderColor: 'var(--gol-rule-born)',
  },
  '&[data-action="survive"]': {
    color: 'var(--gol-rule-survive)',
    borderColor: 'var(--gol-rule-survive)',
  },
  '&[data-action="die"]': {
    color: 'var(--gol-rule-die)',
    borderColor: 'var(--gol-rule-die)',
  },
});

// `.rule-name` (`:565-573`).
const RuleLabel = styled('span')({
  flex: 1,
  fontSize: '14px',
  fontWeight: 500,
  color: 'var(--gol-text-primary)',
});

// `.btn-delete-condition` (`:683-695`). `minWidth: 32px` for a 24px+ target (SC 2.5.8). No
// `transition` (NFR-2.1).
const DeleteButton = styled('button')({
  background: 'transparent',
  border: '1px solid var(--gol-border-control)',
  color: 'var(--gol-text-secondary)',
  padding: '6px 10px',
  fontSize: '12px',
  fontFamily: 'inherit',
  lineHeight: 1,
  cursor: 'pointer',
  minWidth: '32px',
  '&:hover': {
    borderColor: 'var(--gol-danger)',
    color: 'var(--gol-danger)',
  },
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
  },
});

// `.rule-body` (`:619-622`) is `padding: 0 18px 18px` — its zero TOP padding leans on the
// mockup's `.field-label { margin-top: 20px }`, which `fieldStyles.ts`'s `Label` deliberately
// dropped (the column description carries that gap in Basic Information). Inside a card there is
// no description above the first field, so the body carries the gap itself: `18px`, the mockup's
// own horizontal/bottom rhythm rather than the label's 20px.
const CardBody = styled('div')({
  padding: '18px',
  borderTop: '1px solid var(--gol-border)',
});

// `<OrganismNameField>`'s `CharCount`, minus the `data-over-limit` rule — unreachable here: the
// summary is clamped, never over-limit.
const CharCount = styled('div')({
  fontSize: '11px',
  color: 'var(--gol-text-tertiary)',
  textAlign: 'right',
  marginTop: '4px',
});

export interface RuleCardProps {
  rule: RuleDraft;
  /** 0-based position — the label, the names and the ids all derive from it; nothing stores it. */
  index: number;
  organisms: readonly OrganismOption[];
  onChange(id: string, patch: Partial<RuleDraft['payload']>): void;
  onDelete(id: string): void;
  onConditionsChange(
    id: string,
    update: (conditions: readonly ConditionDraft[]) => readonly ConditionDraft[],
  ): void;
  /** Keyboard reorder (ArrowUp → index − 1, ArrowDown → index + 1); clamping is the parent's. */
  onMove(id: string, toIndex: number): void;
  /** Pointer drag, semantic — geometry and state are `<RulesEditor>`'s; this card owns only the
   * pointer plumbing (capture, button and pointerId guards, the buttons-bitmask self-heal). */
  onDragStart(id: string): void;
  onDragOver(clientY: number): void;
  onDragEnd(): void;
  onDragCancel(): void;
  /** This card is the one being dragged (`data-dragging` on the `<li>`). */
  dragging: boolean;
  /** The accent line to paint on this card, or none (`data-drop` on the `<li>`). */
  dropIndicator: 'before' | 'after' | null;
  /** The list-level instructions node — every handle's `aria-describedby`. */
  describedBy: string;
}

export default function RuleCard({
  rule,
  index,
  organisms,
  onChange,
  onDelete,
  onConditionsChange,
  onMove,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDragCancel,
  dragging,
  dropIndicator,
  describedBy,
}: RuleCardProps) {
  const labelId = useId();
  const summaryId = useId();
  const counterId = useId();
  const actionId = useId();
  const n = index + 1;
  const pointerIdRef = useRef<number | null>(null);
  const handleConditionsChange = useCallback(
    (update: (conditions: readonly ConditionDraft[]) => readonly ConditionDraft[]) =>
      onConditionsChange(rule.id, update),
    [onConditionsChange, rule.id],
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        onMove(rule.id, index - 1);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        onMove(rule.id, index + 1);
      }
      // Any other key is left alone (FD2 — one key, one move; no grab/drop mode).
    },
    [onMove, rule.id, index],
  );

  // Clears the active pointer and releases capture — shared by every termination path
  // (pointerup, pointercancel, lostpointercapture, and the buttons-bitmask self-heal below).
  const endDrag = useCallback((target: HTMLButtonElement, pointerId: number) => {
    pointerIdRef.current = null;
    if (target.hasPointerCapture?.(pointerId)) {
      target.releasePointerCapture?.(pointerId);
    }
  }, []);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0 || !event.isPrimary || pointerIdRef.current !== null) return;
      pointerIdRef.current = event.pointerId;
      // Guarded — jsdom 30 has no `setPointerCapture` (the `<PetriDishCanvas>` Task 5 idiom).
      event.currentTarget.setPointerCapture?.(event.pointerId);
      onDragStart(rule.id);
    },
    [onDragStart, rule.id],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.pointerId !== pointerIdRef.current) return;
      // Trap 5's self-heal: capture lost somewhere the handle never heard about — treat the
      // primary button reading as released as a terminate-and-cancel.
      if ((event.buttons & 1) === 0) {
        endDrag(event.currentTarget, event.pointerId);
        onDragCancel();
        return;
      }
      onDragOver(event.clientY);
    },
    [onDragCancel, onDragOver, endDrag],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.pointerId !== pointerIdRef.current) return;
      endDrag(event.currentTarget, event.pointerId);
      onDragEnd();
    },
    [onDragEnd, endDrag],
  );

  const handlePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      // `lostpointercapture` fires after our own `releasePointerCapture` in `endDrag` too — by
      // then `pointerIdRef` is already `null`, so this guard drops the redundant callback (the
      // order is release -> ref cleared -> `lostpointercapture` ignored).
      if (event.pointerId !== pointerIdRef.current) return;
      endDrag(event.currentTarget, event.pointerId);
      onDragCancel();
    },
    [onDragCancel, endDrag],
  );

  return (
    <Card data-dragging={dragging || undefined} data-drop={dropIndicator ?? undefined}>
      <div role="group" aria-labelledby={labelId} data-rule-card data-rule-id={rule.id}>
        <CardHeader>
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
            <span aria-hidden="true">⋮⋮</span>
          </DragHandle>
          <ActionBadge data-action={rule.payload.action} data-rule-badge>
            {ruleActionLabel(rule.payload.action)}
          </ActionBadge>
          <RuleLabel id={labelId}>Rule {n}</RuleLabel>
          <DeleteButton
            type="button"
            aria-label={`Delete rule ${n}`}
            data-rule-delete
            onClick={() => onDelete(rule.id)}
          >
            <span aria-hidden="true">✕</span>
          </DeleteButton>
        </CardHeader>
        <CardBody>
          <Field>
            <Label htmlFor={summaryId}>Summary</Label>
            <TextInput
              id={summaryId}
              type="text"
              value={rule.payload.summary}
              maxLength={MAX_RULE_SUMMARY_LENGTH}
              onChange={(event) =>
                onChange(rule.id, {
                  summary: event.target.value.slice(0, MAX_RULE_SUMMARY_LENGTH),
                })
              }
              placeholder="e.g., Death by overpopulation"
              aria-describedby={counterId}
              data-rule-summary
            />
            <CharCount id={counterId}>
              {rule.payload.summary.length} / {MAX_RULE_SUMMARY_LENGTH}
            </CharCount>
          </Field>
          <Field>
            <Label htmlFor={actionId}>Action</Label>
            <SelectInput
              id={actionId}
              value={rule.payload.action}
              onChange={(event) => {
                if (isRuleAction(event.target.value)) {
                  onChange(rule.id, { action: event.target.value });
                }
              }}
              data-rule-action
            >
              {RULE_ACTIONS.map((action) => (
                <option key={action} value={action}>
                  {ruleActionLabel(action)}
                </option>
              ))}
            </SelectInput>
          </Field>
          <ConditionsEditor
            conditions={rule.conditions}
            organisms={organisms}
            onConditionsChange={handleConditionsChange}
          />
        </CardBody>
      </div>
    </Card>
  );
}

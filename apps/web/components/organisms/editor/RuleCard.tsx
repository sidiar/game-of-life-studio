'use client';

import { useId } from 'react';
import { styled } from '@mui/material/styles';
import {
  isRuleAction,
  MAX_RULE_SUMMARY_LENGTH,
  ruleActionLabel,
  RULE_ACTIONS,
  type RuleDraft,
} from '@/lib/organisms/ruleDraft';
import { Field, Label } from './fieldStyles';

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
 * - FD4 — the drag handle ships as a genuinely `disabled` button, not a no-op span that looks
 *   live (the Save button's NFR-4.1 reasoning): Story 4.12 removes one attribute and adds
 *   handlers. The action `<select>` ships HERE, native (the `<OrganismRoster>` `AddSelect`
 *   decision — zero bundle, free keyboard/AT): a badge that cannot change would be dead UI with no
 *   later story to fix it, since 4.11/4.12/4.13/4.16 none own an action selector.
 * - FD7 — the mockup's per-action description paragraph is not built: it makes engine claims
 *   (Decision C, M10) nothing here can verify. Story 4.11 — the condition builder, where
 *   `cellState`'s `empty`/`alive`/`occupied` meaning gets explained — is where that copy earns its
 *   place.
 *
 * `useId()` gives four ids per card (label, summary, counter, action) — the multi-instance case
 * `<OrganismNameField>`'s comment anticipated. Every decorative glyph (`⋮⋮`, `✕`) is a real
 * `aria-hidden` node inside a button whose accessible name comes from `aria-label` (the Story 4.9
 * review finding: generated content joins a control's accessible name).
 *
 * (Story 4.10) (FR-2.5) (UX-DR10) (UX-DR17) (AR-46)
 */

// `.rule-card` (`:527-536`). No `transition` on the hover border (NFR-2.1).
const Card = styled('li')({
  background: 'var(--gol-bg-secondary)',
  border: '1px solid var(--gol-border)',
  marginBottom: '12px',
  '&:hover': {
    borderColor: 'var(--gol-accent)',
  },
});

// `.rule-header` (`:542-548`). Not clickable — no `cursor: pointer`, no hover background.
const CardHeader = styled('div')({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '15px 18px',
});

// `.drag-handle` (`:555-563`) — text-tertiary, transparent, no border; `cursor: default` because
// this control does nothing yet (FD4). `&:disabled` keeps the same colour: axe exempts disabled
// controls from `color-contrast`, and the point here is the ATTRIBUTE, not the paint.
const DragHandle = styled('button')({
  background: 'transparent',
  border: 0,
  padding: '0 4px',
  color: 'var(--gol-text-tertiary)',
  fontSize: '16px',
  lineHeight: 1,
  cursor: 'default',
  '&:disabled': {
    color: 'var(--gol-text-tertiary)',
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

// `.rule-body` (`:619-622`).
const CardBody = styled('div')({
  padding: '0 18px 18px',
  borderTop: '1px solid var(--gol-border)',
  paddingTop: '18px',
});

// Shared by `SummaryInput` and `ActionSelect` — below the three-callers lift threshold (Story 4.7
// FD7): the name field's `Input` is the other caller today, Story 4.11's condition inputs are the
// third and lift this into `fieldStyles.ts` then.
const controlRules = {
  width: '100%',
  background: 'var(--gol-bg-hover)',
  border: '1px solid var(--gol-border-control)',
  color: 'var(--gol-text-primary)',
  padding: '10px 12px',
  fontSize: '13px',
  fontFamily: 'inherit',
  '&::placeholder': {
    color: 'var(--gol-text-secondary)',
    opacity: 0.8,
  },
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '-2px',
  },
} as const;

const SummaryInput = styled('input')(controlRules);

// The `<AddSelect>` FD3 reasoning: `cursor: pointer` and the UA's own arrow, never hidden.
const ActionSelect = styled('select')({ ...controlRules, cursor: 'pointer' });

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
  onChange(id: string, patch: Partial<RuleDraft['payload']>): void;
  onDelete(id: string): void;
}

export default function RuleCard({ rule, index, onChange, onDelete }: RuleCardProps) {
  const labelId = useId();
  const summaryId = useId();
  const counterId = useId();
  const actionId = useId();
  const n = index + 1;

  return (
    <Card>
      <div role="group" aria-labelledby={labelId} data-rule-card data-rule-id={rule.id}>
        <CardHeader>
          <DragHandle type="button" disabled aria-label={`Reorder rule ${n}`} data-drag-handle>
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
            <SummaryInput
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
            <ActionSelect
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
            </ActionSelect>
          </Field>
        </CardBody>
      </div>
    </Card>
  );
}

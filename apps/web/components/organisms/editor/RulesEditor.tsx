'use client';

import { useCallback, useEffect, useRef } from 'react';
import { styled } from '@mui/material/styles';
import { removeRule, updateRulePayload, type RuleDraft } from '@/lib/organisms/ruleDraft';
import AddRuleButton from './AddRuleButton';
import RuleCard from './RuleCard';

/**
 * The Survival Rules column's list — or, with zero rules, the centred empty state (Story 4.10,
 * AC2/AC3/AC5). Fully controlled: `<OrganismEditorModal>` owns `rules` inside the one draft object
 * and passes an updater-style setter (FD8), the same reasoning `setDominance`'s functional form
 * carries — two rule mutations landing in one batch cannot clobber each other.
 *
 * **Focus follows the list diff (FD6)** — the design's three required moves (new card's Summary on
 * add, a neighbour's delete on delete, the empty state's CTA when the last card goes) are driven by
 * one effect keyed on `rules`, diffing against the previous render's ids. A `pendingFocus` ref set
 * by the handlers was rejected: the header's "+ Add Rule" lives in the layout's `rulesAction` slot,
 * OUTSIDE this component, and a diff needs no coordination with it. `autoFocus` on the newest card
 * was rejected too — a seeded list (Story 4.17) would autofocus its last card on mount, and it
 * races MUI's focus trap on the dialog's first paint.
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

export interface RulesEditorProps {
  rules: readonly RuleDraft[];
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
}

export default function RulesEditor({ rules, onRulesChange, onAddRule }: RulesEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const prevIdsRef = useRef<readonly string[] | null>(null);

  const handleChange = useCallback(
    (id: string, patch: Partial<RuleDraft['payload']>) =>
      onRulesChange((current) => updateRulePayload(current, id, patch)),
    [onRulesChange],
  );

  const handleDelete = useCallback(
    (id: string) => onRulesChange((current) => removeRule(current, id)),
    [onRulesChange],
  );

  useEffect(() => {
    const ids = rules.map((rule) => rule.id);
    const prev = prevIdsRef.current;
    const root = rootRef.current;

    if (prev === null) {
      // First run — a seeded list (Story 4.17) must not steal focus on mount.
      prevIdsRef.current = ids;
      return;
    }

    if (ids.length === prev.length + 1) {
      const addedId = ids.find((id) => !prev.includes(id));
      if (addedId !== undefined) {
        root
          ?.querySelector<HTMLElement>(`[data-rule-id="${addedId}"] [data-rule-summary]`)
          ?.focus();
      }
    } else if (ids.length === prev.length - 1) {
      const removedIndex = prev.findIndex((id, i) => ids[i] !== id);
      const index = removedIndex === -1 ? prev.length - 1 : removedIndex;

      // "Loose" focus (`<BattleEditorView>`'s `focusIsLoose` idiom, adapted): the deleted button
      // is gone, so the browser has already dropped focus to `<body>` — never steal focus the
      // user placed somewhere real during the same tick.
      const active = document.activeElement;
      const focusIsLoose = active === null || active === document.body || !root?.contains(active);
      if (focusIsLoose) {
        if (ids.length === 0) {
          root?.querySelector<HTMLElement>('[data-add-rule="empty"]')?.focus();
        } else {
          const target = Math.min(index, ids.length - 1);
          const targetId = ids[target];
          root
            ?.querySelector<HTMLElement>(`[data-rule-id="${targetId}"] [data-rule-delete]`)
            ?.focus();
        }
      }
    }
    // Same-length changes (a summary keystroke, an action change, Story 4.11's condition edits,
    // Story 4.12's reorder) move no focus.

    prevIdsRef.current = ids;
  }, [rules]);

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
        <RulesList role="list" aria-label="Survival rules">
          {rules.map((rule, index) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              index={index}
              onChange={handleChange}
              onDelete={handleDelete}
            />
          ))}
        </RulesList>
      )}
    </div>
  );
}

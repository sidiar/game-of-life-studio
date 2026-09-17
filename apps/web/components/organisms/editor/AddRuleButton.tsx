'use client';

import { styled } from '@mui/material/styles';

/**
 * The Survival Rules column's persistent action (Story 4.10, AC1/AC2): mounted once in the
 * layout's `rulesAction` slot (`<OrganismEditorModal>`) and once as the empty state's primary
 * action (`<RulesEditor>`) — two mount points, one control, the `<CreateBattleLink>` shape. Mockup:
 * `.btn-add-rule` (`clinical-lab-theme/organism-editor.html:506-525`).
 *
 * No `translateY` lift and no `transition` on hover (unlike the mockup's `transform:
 * translateY(-1px)` + `transition: all 0.2s`) — the `<BackButton>` rule set's reasoning: an axe
 * scan landing mid-fade measures a state no settled frame has (NFR-2.1).
 *
 * Both callers pass `type="button"` and a `data-add-rule` value (`"header"` | `"empty"`) — the
 * e2e's disambiguator, since the two controls share one accessible name, "+ Add Rule" (FD9,
 * recorded as open work: a distinct empty-state label is a copy decision, not this story's).
 */
const AddRuleButton = styled('button')({
  background: 'var(--gol-accent)',
  color: 'var(--gol-on-accent)',
  border: 'none',
  padding: '10px 18px',
  fontSize: '12px',
  fontWeight: 600,
  fontFamily: 'inherit',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  '&:hover': {
    background: 'var(--gol-accent-hover)',
  },
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
  },
});

export default AddRuleButton;

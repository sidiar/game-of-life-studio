import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import {
  MAX_ORGANISM_NAME_LENGTH,
  NEW_ORGANISM_DOMINANCE,
  ORGANISM_SCHEMA_VERSION,
  OrganismSchema,
  type BattleSummary,
  type Organism,
} from '@gol/domain';
import { CONWAYS_CLASSIC, createFakeRepositories, createMockOrganisms } from '@gol/test-utils';
import { CorruptDataError, QuotaExceededError, type OrganismRepository } from '@gol/persistence';
import { defaultColorToken } from '@/lib/palette/defaultColorToken';
import { displayColor, MAX_AGE_SHADE } from '@/lib/palette/displayColor';
import { PALETTE, resolvePaletteColor } from '@/lib/palette/paletteRegistry';
import { ruleActionLabel, RULE_NEEDS_CONDITION } from '@/lib/organisms/ruleDraft';
import { ORGANISM_NAME_REQUIRED } from '@/lib/organisms/organismName';
import { computeGridLayout } from '@/lib/canvas/gridLayout';
import { PREVIEW_GRID_SIZE } from '@/lib/organisms/previewGrid';
import { ruleContentHash } from '@/lib/organisms/ruleContentHash';
import { RecordingContext2D } from '@/test-support/recordingContext2d';
import { installFrameDriver } from '@/test-support/frameDriver';
import OrganismEditorModal, { backLabelFor, errorTargetSelector } from './OrganismEditorModal';

/**
 * Story 4.3's shell contract — the accessible names the rest of Epic 4 (and the e2e) will look the
 * modal up by, and the three close channels routing to ONE callback. Story 4.8 adds the required
 * `library` prop (every render below gains it) and the colour picker's own count/order/round-trip
 * guard. The parent-side lifecycle (inert window, focus restore) is
 * `useOrganismEditorModal.test.tsx`'s; the real-browser facts (Tab cycling, contrast, WebKit
 * focus) are `e2e/organisms.spec.ts`'s.
 *
 * ⚠️ MUI `Dialog` portals to `document.body`, so every query goes through `screen`, never the
 * render `container` — a `container.querySelector('[role="dialog"]')` finds nothing and a test
 * written that way passes on `not.toBeInTheDocument()` for the wrong reason.
 */

// [CONWAYS_CLASSIC (sky-blue), vermillion, azure, bluish-green] — a fixture that contains Conway's
// Classic, so the M6 default it derives (PALETTE[3], amber) is a value the Story 4.7 seed stopgap
// (`colorToken: DEFAULT_COLOR_TOKEN`, deleted in 4.8) could never have produced (FD8).
const LIBRARY = [CONWAYS_CLASSIC, ...createMockOrganisms()];

/** Story 4.20: the footer's battle list. `[]` is what every pre-4.20 case here means — no battle
 * places the subject, so the footer reads "Used in 0 Battles" with no expansion. The cases that
 * DO exercise the footer pass their own summaries through `mountModal`. */
type BattleSummaries = readonly Pick<BattleSummary, 'id' | 'name' | 'organismIds'>[];
const NO_BATTLES: BattleSummaries = [];

/**
 * Story 4.16 Task 6: a per-test rig. Builds `createFakeRepositories({ organisms: library })`
 * FRESH per call (a shared fake leaks saved records across tests) and passes `onSaved: vi.fn()` —
 * every pre-existing `render(` in this file gains the two new props through this rig, mechanically,
 * with no assertion touched. Returns the render result plus the rig's own `organisms` fake and
 * `onSaved` spy so a test can assert on either.
 */
function mountModal(
  overrides: {
    origin?: 'library' | 'battle';
    onClose?: () => void;
    library?: readonly Organism[];
    organisms?: OrganismRepository;
    onSaved?: (organism: Organism) => void;
    /** Story 4.17: a record makes this an edit session; the default `null` keeps every earlier
     * call a create, unchanged. */
    organism?: Organism | null;
    /** Story 4.20: the battle summaries behind the footer's "Used in N Battles". The default `[]`
     * is "no battle places anything", which is what every earlier case here assumed. */
    battleSummaries?: readonly BattleSummaries[number][];
  } = {},
) {
  const library = overrides.library ?? LIBRARY;
  const organism = overrides.organism ?? null;
  const organisms =
    overrides.organisms ?? createFakeRepositories({ organisms: [...library] }).organisms;
  const onSaved = overrides.onSaved ?? vi.fn();
  const onClose = overrides.onClose ?? vi.fn();
  const origin = overrides.origin ?? 'library';
  const result = render(
    <OrganismEditorModal
      open
      origin={origin}
      organism={organism}
      onClose={onClose}
      library={library}
      battleSummaries={overrides.battleSummaries ?? NO_BATTLES}
      organisms={organisms}
      onSaved={onSaved}
    />,
  );
  return { ...result, organisms, onSaved, onClose };
}

describe('OrganismEditorModal', () => {
  it('renders a dialog whose accessible name is the level-2 "Organism Editor" heading', () => {
    mountModal();

    expect(screen.getByRole('dialog')).toHaveAccessibleName('Organism Editor');
    expect(screen.getByRole('heading', { level: 2, name: 'Organism Editor' })).toBeInTheDocument();
  });

  // The prop is the seam Story 4.24/4.25 plug into — both branches are exercised even though only
  // 'library' is reachable from UI today, so that a later regression on 'battle' reddens here and
  // not on the day the battle origin is wired.
  it.each([
    ['library', 'Back to Library'],
    ['battle', 'Back to Battle'],
  ] as const)('labels the back control for origin=%s as "%s"', (origin, label) => {
    mountModal({ origin });

    // Exact accessible name: the `←` glyph is aria-hidden and must not leak into it.
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    expect(backLabelFor(origin)).toBe(label);
  });

  it('renders Save as an enabled button and a Close button (Story 4.13)', () => {
    mountModal();

    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('routes Back to onClose exactly once', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mountModal({ onClose });

    await user.click(screen.getByRole('button', { name: 'Back to Library' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('routes Close to onClose exactly once', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mountModal({ onClose });

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('routes Escape to onClose exactly once', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mountModal({ onClose });

    // MUI's key handler listens on the focused element inside the dialog; the focus trap has
    // already put focus on the dialog container, which is enough.
    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Story 4.4: the body is `<OrganismEditorLayout>`. Its own contract is that component's test;
  // what the shell owes is that the three regions are INSIDE the dialog, in order. The axe test
  // below now scans the columns for free.
  it('renders the three editor columns inside the dialog, in order', () => {
    mountModal();

    const regions = within(screen.getByRole('dialog')).getAllByRole('region');
    expect(regions).toHaveLength(3);
    expect(regions[0]).toHaveAccessibleName('Basic Information');
    expect(regions[1]).toHaveAccessibleName('Survival Rules');
    expect(regions[2]).toHaveAccessibleName('Preview & Test');
  });

  // Story 4.5 / 4.6 / 4.7 / 4.8: the name field, the colour picker, the dominance control and the
  // aging toggle land in the Basic Information column THROUGH the layout's `basicInfo` slot
  // fragment — addressed by name, so none can land in another column. Each field's own contract
  // is its own test file's; this retargets the count guard for the new colour control (AR-44) —
  // located by its "Change Color" disclosure button, since the radiogroup is collapsed at mount.
  it('mounts the name field, the colour picker, the dominance control and the aging toggle in Basic Information and nowhere else (Story 4.5, Story 4.6, Story 4.7, Story 4.8)', async () => {
    const user = userEvent.setup();
    mountModal();

    const dialog = screen.getByRole('dialog');
    const basic = within(dialog).getByRole('region', { name: 'Basic Information' });
    expect(within(basic).getByRole('textbox', { name: 'Organism Name' })).toBeInTheDocument();
    expect(within(basic).getByRole('group', { name: 'Organism Color' })).toBeInTheDocument();
    expect(within(basic).getByRole('button', { name: 'Change Color' })).toBeInTheDocument();
    expect(within(basic).getByRole('slider', { name: 'Dominance' })).toBeInTheDocument();
    expect(within(basic).getByRole('textbox', { name: 'Dominance value' })).toBeInTheDocument();
    expect(within(basic).getByRole('switch', { name: 'Aging Degradation' })).toBeInTheDocument();
    // "Nowhere else" means the whole dialog — header and footer included — not just the other two
    // regions: exactly two textboxes, one slider, one switch and (once the palette is open)
    // PALETTE.length radios exist, and all are the ones above.
    expect(within(dialog).getAllByRole('textbox')).toHaveLength(2);
    // Two sliders in the whole dialog: Dominance (Basic Information) and the Preview & Test
    // column's "Generations per second" speed control (Story 4.15) — the whole-dialog count
    // stays deliberate, so it is pinned right alongside the scoped Basic-Information count below.
    expect(within(dialog).getAllByRole('slider')).toHaveLength(2);
    expect(within(basic).getAllByRole('slider')).toHaveLength(1);
    expect(within(dialog).getAllByRole('switch')).toHaveLength(1);
    expect(within(dialog).queryAllByRole('radio')).toHaveLength(0);
    await user.click(within(basic).getByRole('button', { name: 'Change Color' }));
    expect(within(basic).getByRole('radiogroup', { name: 'Organism Color' })).toBeInTheDocument();
    expect(within(dialog).getAllByRole('radio')).toHaveLength(PALETTE.length);
  });

  // Story 4.7 AC3: a fresh editor opens with the switch unchecked and "Off" showing.
  it('opens the aging toggle unchecked, showing "Off" (Story 4.7)', () => {
    mountModal();

    expect(screen.getByRole('switch', { name: 'Aging Degradation' })).not.toBeChecked();
    expect(screen.getByText('Off')).toBeInTheDocument();
  });

  // A click round-trips through the modal's own state, the same draft the sibling fields prove
  // above — and moves the example strip, which only re-renders from a real draft update.
  it('holds the draft: an aging toggle click round-trips through the modal (Story 4.7)', async () => {
    const user = userEvent.setup();
    mountModal();

    // MUI `Dialog` portals to `document.body`, not the render container (this file's own note
    // above) — so the strip is looked up through the dialog, not the container.
    const strip = screen.getByRole('dialog').querySelector('[data-aging-example]');
    if (strip === null) throw new Error('the aging example strip is not in the dialog');
    const cells = strip.querySelectorAll<HTMLElement>('[data-age]');
    expect(cells).toHaveLength(MAX_AGE_SHADE + 1);
    const cellColor = (age: number) => cells[age].style.backgroundColor;
    const cell0Off = cellColor(0);
    const cellCapOff = cellColor(MAX_AGE_SHADE);
    expect(cell0Off).not.toBe('');
    expect(cell0Off).toBe(cellCapOff);

    await user.click(screen.getByRole('switch', { name: 'Aging Degradation' }));

    expect(screen.getByRole('switch', { name: 'Aging Degradation' })).toBeChecked();
    expect(screen.getByText('On')).toBeInTheDocument();
    expect(cellColor(0)).not.toBe(cellColor(MAX_AGE_SHADE));
  });

  // The draft lives in the MODAL (FD3): typing round-trips through its own state, not a prop.
  it('holds the draft: typing into the name field round-trips through the modal (Story 4.5)', async () => {
    const user = userEvent.setup();
    mountModal();

    const input = screen.getByRole('textbox', { name: 'Organism Name' });
    await user.type(input, 'Glider');

    expect(input).toHaveValue('Glider');
    expect(screen.getByText(`6 / ${MAX_ORGANISM_NAME_LENGTH}`)).toBeInTheDocument();
  });

  // FD2: a fresh editor does not open red.
  it('opens with the name field free of any error (Story 4.5)', () => {
    mountModal();

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Organism Name' })).not.toBeInvalid();
  });

  // Story 4.8 AC3 / FD8: the seed is the M6 derivation over the library the editor was opened
  // over, not a stopgap. With LIBRARY's four tokens (sky-blue, vermillion, azure, bluish-green),
  // that is PALETTE[3] — a value the deleted 4.7 seed stopgap (DEFAULT_COLOR_TOKEN) could not
  // produce, so this test would have gone red against it.
  it('opens the colour picker on the M6 default derived from `library` (Story 4.8)', async () => {
    const user = userEvent.setup();
    mountModal();

    const expectedToken = defaultColorToken(LIBRARY.map((organism) => organism.colorToken));
    const expectedName = resolvePaletteColor(expectedToken).name;
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('[data-selected-name]')).toHaveTextContent(expectedName);
    await user.click(within(dialog).getByRole('button', { name: 'Change Color' }));
    expect(within(dialog).getByRole('radio', { checked: true })).toHaveAccessibleName(expectedName);
  });

  // AC4: a swatch pick updates the display, the name and the aging strip together, on the same
  // commit — the draft's `colorToken` is the only channel any of them read.
  it('holds the draft: a colour pick round-trips through the modal and repaints the aging strip on the same commit (Story 4.8)', async () => {
    const user = userEvent.setup();
    mountModal();

    const dialog = screen.getByRole('dialog');
    const target = PALETTE[9];
    await user.click(within(dialog).getByRole('button', { name: 'Change Color' }));
    await user.click(within(dialog).getByRole('radio', { name: target.name }));

    // The pointer pick collapsed the palette (FD7); reopen it to read the checked radio back.
    await user.click(within(dialog).getByRole('button', { name: 'Change Color' }));
    expect(within(dialog).getByRole('radio', { checked: true })).toHaveAccessibleName(target.name);
    const selectedName = dialog.querySelector('[data-selected-name]');
    if (selectedName === null) throw new Error('the selected-name node is not in the dialog');
    expect(selectedName).toHaveTextContent(target.name);
    const selectedSwatch = dialog.querySelector('[data-selected-swatch]') as HTMLElement | null;
    if (selectedSwatch === null) throw new Error('the selected swatch is not in the dialog');

    const strip = dialog.querySelector('[data-aging-example]');
    if (strip === null) throw new Error('the aging example strip is not in the dialog');
    const capCell = strip.querySelector<HTMLElement>(`[data-age="${MAX_AGE_SHADE}"]`);
    if (capCell === null) throw new Error('the cap-age cell is not in the strip');

    // Pinned to the LUT, not only to each other: two stale backgrounds also agree. jsdom
    // normalises an inline `hsl()` to `rgb()`, so the expected string goes through the same
    // `style` round trip (the `OrganismLibrary.test.tsx` probe).
    const probe = document.createElement('span');
    probe.style.backgroundColor = displayColor(target.id, MAX_AGE_SHADE);
    expect(probe.style.backgroundColor).not.toBe('');
    expect(selectedSwatch.style.backgroundColor).toBe(probe.style.backgroundColor);
    expect(capCell.style.backgroundColor).toBe(probe.style.backgroundColor);
  });

  // Story 4.9: a colliding pick warns through the whole modal, not just the field in isolation —
  // the chip and the aging strip still repaint together (the 4.8 round-trip probe, reused), Save's
  // DOM is byte-for-byte what it was before the pick, and axe is clean with the warning showing
  // (AC8's modal scan).
  it('warns through the modal on a colliding pick (Story 4.9)', async () => {
    const user = userEvent.setup();
    mountModal();

    const dialog = screen.getByRole('dialog');
    const saveBefore = within(dialog).getByRole('button', { name: 'Save' }).outerHTML;
    await user.click(within(dialog).getByRole('button', { name: 'Change Color' }));
    // Conway's Classic's own token (`sky-blue`, PALETTE[0]) — a deliberate collision.
    const conwaysColorName = resolvePaletteColor(CONWAYS_CLASSIC.colorToken).name;
    await user.click(within(dialog).getByRole('radio', { name: conwaysColorName }));

    // Story 4.16 Task 11 added a SECOND `role="status"` region to this dialog (the save outcome
    // line) — scope to the colour-reuse one by its own `data-*` hook, never `getByRole('status')`.
    const reuseStatus = dialog.querySelector('[data-color-reuse-status]');
    if (reuseStatus === null) throw new Error('the color-reuse status region is not in the dialog');
    expect(reuseStatus).toHaveTextContent(`${CONWAYS_CLASSIC.name} already uses this color.`);
    expect(dialog.querySelector('[data-selected-name]')).toHaveTextContent(conwaysColorName);
    const selectedSwatch = dialog.querySelector('[data-selected-swatch]') as HTMLElement | null;
    if (selectedSwatch === null) throw new Error('the selected swatch is not in the dialog');
    const capCell = dialog.querySelector<HTMLElement>(
      `[data-aging-example] [data-age="${MAX_AGE_SHADE}"]`,
    );
    if (capCell === null) throw new Error('the cap-age cell is not in the strip');
    const probe = document.createElement('span');
    probe.style.backgroundColor = displayColor(CONWAYS_CLASSIC.colorToken, MAX_AGE_SHADE);
    expect(probe.style.backgroundColor).not.toBe('');
    expect(selectedSwatch.style.backgroundColor).toBe(probe.style.backgroundColor);
    expect(capCell.style.backgroundColor).toBe(probe.style.backgroundColor);
    // "Save is unaffected" as a before/after comparison — the Story 4.13 gate does not react to a
    // colour pick, which is neither a name, rule nor condition field it validates.
    expect(within(dialog).getByRole('button', { name: 'Save' }).outerHTML).toBe(saveBefore);
    await user.click(within(dialog).getByRole('button', { name: 'Change Color' }));
    expect(within(dialog).getAllByRole('radio')).toHaveLength(PALETTE.length);

    expect((await axe(document.body)).violations).toEqual([]);
  });

  // Story 4.9: the M6 default is silent on open. A separate test rather than a line grown onto the
  // 4.8 "opens on the M6 default" case, so that case stays unedited (AC9). With LIBRARY the default
  // is an unused token, so this pins the region's mounted-and-empty state; the seed rule itself is
  // proven by the colliding-default test below.
  it('the M6 default is silent at open (Story 4.9)', () => {
    mountModal();

    const dialog = screen.getByRole('dialog');
    const reuseStatus = dialog.querySelector('[data-color-reuse-status]');
    if (reuseStatus === null) throw new Error('the color-reuse status region is not in the dialog');
    expect(reuseStatus).toBeEmptyDOMElement();
  });

  // Story 4.9, FD2: a default that COLLIDES (every token in use) is still silent — the seed
  // comparison does not care whether the least-used fallback happens to be shared. Picking a
  // DIFFERENT, genuinely doubled token then warns with TWO names.
  it('is silent on a colliding default, and warns with two names once something else is picked (Story 4.9)', async () => {
    const user = userEvent.setup();
    // Every PALETTE id used exactly once, PLUS a second organism on `sky-blue` (PALETTE[0]) — built
    // from `PALETTE.map`, never 21 literals. Counts: sky-blue -> 2, everything else -> 1, so the
    // M6 default (least-used, ties to registry order) is PALETTE[1] — itself in use once.
    const fullLibrary = [
      ...PALETTE.map((entry, index) => ({
        ...CONWAYS_CLASSIC,
        id: `full-${index}`,
        name: `Organism ${index}`,
        colorToken: entry.id,
      })),
      { ...CONWAYS_CLASSIC, id: 'full-extra', name: 'Extra Sky', colorToken: PALETTE[0].id },
    ];
    mountModal({ library: fullLibrary });

    const dialog = screen.getByRole('dialog');
    const reuseStatus = () => {
      const el = dialog.querySelector('[data-color-reuse-status]');
      if (el === null) throw new Error('the color-reuse status region is not in the dialog');
      return el;
    };
    expect(reuseStatus()).toBeEmptyDOMElement();
    expect(dialog.querySelector('[data-selected-name]')).toHaveTextContent(PALETTE[1].name);

    await user.click(within(dialog).getByRole('button', { name: 'Change Color' }));
    // The one state FD2 creates on purpose: the seed swatch is DOTTED (someone holds it) while
    // the region stays silent (it is the default, not a pick).
    expect(dialog.querySelector(`[data-color-token="${PALETTE[1].id}"]`)).toHaveAttribute(
      'data-in-use',
      'true',
    );
    expect(reuseStatus()).toBeEmptyDOMElement();
    await user.click(within(dialog).getByRole('radio', { name: PALETTE[0].name }));

    expect(reuseStatus()).toHaveTextContent(
      `${fullLibrary[0].name} and Extra Sky already use this color.`,
    );
  });

  // Story 4.6 AC3: a fresh editor opens with both dominance controls at the domain default.
  it('opens the dominance control at NEW_ORGANISM_DOMINANCE on both the slider and the textbox (Story 4.6)', () => {
    mountModal();

    expect(screen.getByRole('slider', { name: 'Dominance' })).toHaveValue(
      String(NEW_ORGANISM_DOMINANCE),
    );
    expect(screen.getByRole('textbox', { name: 'Dominance value' })).toHaveValue(
      String(NEW_ORGANISM_DOMINANCE),
    );
  });

  // A slider change round-trips through the modal's own state — the same draft the name field
  // proves above, now for the sibling field.
  it('holds the draft: a dominance slider change round-trips through the modal (Story 4.6)', () => {
    mountModal();

    fireEvent.change(screen.getByRole('slider', { name: 'Dominance' }), {
      target: { value: '42' },
    });

    expect(screen.getByRole('textbox', { name: 'Dominance value' })).toHaveValue('42');
    expect(screen.getByRole('slider', { name: 'Dominance' })).toHaveValue('42');
  });

  // And the other direction: typing into the dominance textbox moves the slider live.
  it('holds the draft: typing into the dominance textbox moves the slider (Story 4.6)', async () => {
    const user = userEvent.setup();
    mountModal();

    const input = screen.getByRole('textbox', { name: 'Dominance value' });
    await user.click(input);
    await user.clear(input);
    await user.type(input, '17');

    expect(screen.getByRole('slider', { name: 'Dominance' })).toHaveValue('17');
  });

  // Story 4.6 / 4.7 / 4.8 AC6: the tab order inside Basic Information is name -> the "Change
  // Color" button (the palette is collapsed, FD7) -> slider -> numeric input -> switch. The
  // field's own test covers the open palette's extra stop; this is the real column.
  it('tabs from the name field to the Change Color button, the dominance slider, its textbox, then the aging switch (Story 4.6, Story 4.7, Story 4.8)', async () => {
    const user = userEvent.setup();
    mountModal();

    const dialog = screen.getByRole('dialog');
    screen.getByRole('textbox', { name: 'Organism Name' }).focus();
    await user.tab();
    expect(within(dialog).getByRole('button', { name: 'Change Color' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('slider', { name: 'Dominance' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('textbox', { name: 'Dominance value' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('switch', { name: 'Aging Degradation' })).toHaveFocus();
  });

  it('open={false} renders no dialog at all (MUI unmounts by default)', () => {
    render(
      <OrganismEditorModal
        open={false}
        origin="library"
        organism={null}
        onClose={vi.fn()}
        library={LIBRARY}
        battleSummaries={NO_BATTLES}
        organisms={createFakeRepositories({ organisms: LIBRARY }).organisms}
        onSaved={vi.fn()}
      />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('has no axe violations with the dialog open', async () => {
    mountModal();

    // `document.body`, not the render container: the dialog is portalled, and the scan must see
    // the aria-hidden siblings MUI leaves behind alongside it.
    const results = await axe(document.body);
    expect(results.violations).toEqual([]);
  });

  // Story 4.10. Both "+ Add Rule" controls share one accessible name (FD9); `data-add-rule` is the
  // disambiguator, and the throw keeps the lookup typed without a non-null assertion.
  function headerAddButton(rules: HTMLElement): HTMLElement {
    const header = within(rules)
      .getAllByRole('button', { name: '+ Add Rule' })
      .find((b) => b.getAttribute('data-add-rule') === 'header');
    if (!header) throw new Error('header add button not found');
    return header;
  }

  it('opens in the empty state with the header action', () => {
    mountModal();

    const dialog = screen.getByRole('dialog');
    const rules = within(dialog).getByRole('region', { name: 'Survival Rules' });
    expect(rules.querySelector('[data-rules-empty-state]')).not.toBeNull();
    expect(within(rules).getByText('No Rules Defined')).toBeInTheDocument();
    const addButtons = within(rules).getAllByRole('button', { name: '+ Add Rule' });
    expect(addButtons).toHaveLength(2);
    expect(addButtons[0]).toHaveAttribute('data-add-rule', 'header');
    expect(addButtons[1]).toHaveAttribute('data-add-rule', 'empty');
    expect(within(rules).queryByRole('list')).not.toBeInTheDocument();

    const basic = within(dialog).getByRole('region', { name: 'Basic Information' });
    const preview = within(dialog).getByRole('region', { name: 'Preview & Test' });
    expect(within(basic).queryByRole('button', { name: '+ Add Rule' })).toBeNull();
    expect(within(preview).queryByRole('button', { name: '+ Add Rule' })).toBeNull();
  });

  it('the header action adds through the modal', async () => {
    const user = userEvent.setup();
    mountModal();

    const dialog = screen.getByRole('dialog');
    const rules = within(dialog).getByRole('region', { name: 'Survival Rules' });
    const basic = within(dialog).getByRole('region', { name: 'Basic Information' });
    await user.click(headerAddButton(rules));

    const group = within(rules).getByRole('group', { name: 'Rule 1' });
    expect(within(group).getByRole('textbox', { name: 'Summary' })).toHaveFocus();
    expect(within(rules).getAllByRole('textbox')).toHaveLength(1);
    expect(within(basic).getAllByRole('textbox')).toHaveLength(2);
  });

  it('the draft round-trips: add, edit and delete stay in one draft object', async () => {
    const user = userEvent.setup();
    mountModal();

    const dialog = screen.getByRole('dialog');
    const rules = within(dialog).getByRole('region', { name: 'Survival Rules' });
    const headerAdd = headerAddButton(rules);

    await user.click(headerAdd);
    await user.click(headerAdd);

    const rule1 = within(rules).getByRole('group', { name: 'Rule 1' });
    const rule2 = within(rules).getByRole('group', { name: 'Rule 2' });
    await user.type(within(rule2).getByRole('textbox', { name: 'Summary' }), 'hello');
    await user.selectOptions(within(rule1).getByRole('combobox', { name: 'Action' }), 'die');

    expect(within(rule1).getByRole('combobox', { name: 'Action' })).toHaveValue('die');
    expect(rule1.querySelector('[data-rule-badge]')).toHaveTextContent(ruleActionLabel('die'));
    expect(within(rule2).getByRole('textbox', { name: 'Summary' })).toHaveValue('hello');
    expect(within(rule2).getByRole('combobox', { name: 'Action' })).toHaveValue('born');
    expect(rule2.querySelector('[data-rule-badge]')).toHaveTextContent(ruleActionLabel('born'));

    await user.click(within(rule1).getByRole('button', { name: 'Delete rule 1' }));

    const survivor = within(rules).getByRole('group', { name: 'Rule 1' });
    expect(within(survivor).getByRole('textbox', { name: 'Summary' })).toHaveValue('hello');
    expect(within(survivor).getByRole('combobox', { name: 'Action' })).toHaveValue('born');
    expect(survivor.querySelector('[data-rule-badge]')).toHaveTextContent(ruleActionLabel('born'));
  });

  it('has no axe violations after two adds and one action change', async () => {
    const user = userEvent.setup();
    mountModal();

    const dialog = screen.getByRole('dialog');
    const rules = within(dialog).getByRole('region', { name: 'Survival Rules' });
    const headerAdd = headerAddButton(rules);
    await user.click(headerAdd);
    await user.click(headerAdd);
    const rule1 = within(rules).getByRole('group', { name: 'Rule 1' });
    await user.selectOptions(within(rule1).getByRole('combobox', { name: 'Action' }), 'survive');

    const results = await axe(document.body);
    expect(results.violations).toEqual([]);
  });

  // Story 4.11: the condition builder wired through the modal — `organisms={library}` reaching
  // `<RulesEditor>` -> `<RuleCard>` -> `<ConditionsEditor>`.
  it('adds a rule, then a condition, focused on the property select with cellState the default', async () => {
    const user = userEvent.setup();
    mountModal();

    const dialog = screen.getByRole('dialog');
    const rules = within(dialog).getByRole('region', { name: 'Survival Rules' });
    await user.click(headerAddButton(rules));
    const rule1 = within(rules).getByRole('group', { name: 'Rule 1' });
    await user.click(within(rule1).getByRole('button', { name: '+ Add Condition' }));

    const property = within(rule1).getByRole('combobox', { name: 'Condition 1 property' });
    expect(property).toHaveValue('cellState');
    expect(document.activeElement).toBe(property);
    expect(within(rules).getAllByRole('textbox', { name: 'Summary' })).toHaveLength(1);
  });

  it("the organism-type dropdown lists the library, selected on the first entry (Conway's Classic)", async () => {
    const user = userEvent.setup();
    mountModal();

    const dialog = screen.getByRole('dialog');
    const rules = within(dialog).getByRole('region', { name: 'Survival Rules' });
    await user.click(headerAddButton(rules));
    const rule1 = within(rules).getByRole('group', { name: 'Rule 1' });
    await user.click(within(rule1).getByRole('button', { name: '+ Add Condition' }));
    await user.selectOptions(
      within(rule1).getByRole('combobox', { name: 'Condition 1 property' }),
      'organismType',
    );

    const value = within(rule1).getByRole('combobox', { name: 'Condition 1 value' });
    expect(value).toHaveValue(LIBRARY[0].id);
    const options = within(value).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(
      LIBRARY.map((organism) => organism.name),
    );
    // Decision E: the option VALUE is the library id — what the pattern persists.
    expect(options.map((option) => (option as HTMLOptionElement).value)).toEqual(
      LIBRARY.map((organism) => organism.id),
    );
  });

  it('the range pair error appears inside the card, and clears when Max exceeds Min; deleting the rule clears it', async () => {
    const user = userEvent.setup();
    mountModal();

    const dialog = screen.getByRole('dialog');
    const rules = within(dialog).getByRole('region', { name: 'Survival Rules' });
    await user.click(headerAddButton(rules));
    const rule1 = within(rules).getByRole('group', { name: 'Rule 1' });
    await user.click(within(rule1).getByRole('button', { name: '+ Add Condition' }));
    await user.selectOptions(
      within(rule1).getByRole('combobox', { name: 'Condition 1 property' }),
      'neighborCount',
    );
    await user.selectOptions(
      within(rule1).getByRole('combobox', { name: 'Condition 1 operator' }),
      'range',
    );
    await user.type(within(rule1).getByRole('textbox', { name: 'Condition 1 minimum' }), '3');
    await user.type(within(rule1).getByRole('textbox', { name: 'Condition 1 maximum' }), '2');

    expect(within(rule1).getByRole('alert')).toHaveTextContent('Min must be less than Max');

    const max = within(rule1).getByRole('textbox', { name: 'Condition 1 maximum' });
    await user.clear(max);
    await user.type(max, '4');
    expect(within(rule1).queryByRole('alert')).not.toBeInTheDocument();

    await user.click(within(rule1).getByRole('button', { name: 'Delete rule 1' }));
    expect(within(rules).queryByRole('alert')).not.toBeInTheDocument();
    expect(rules.querySelector('[data-rules-empty-state]')).not.toBeNull();
  });

  it('has no axe violations with the pair error visible', async () => {
    const user = userEvent.setup();
    mountModal();

    const dialog = screen.getByRole('dialog');
    const rules = within(dialog).getByRole('region', { name: 'Survival Rules' });
    await user.click(headerAddButton(rules));
    const rule1 = within(rules).getByRole('group', { name: 'Rule 1' });
    await user.click(within(rule1).getByRole('button', { name: '+ Add Condition' }));
    await user.selectOptions(
      within(rule1).getByRole('combobox', { name: 'Condition 1 property' }),
      'neighborCount',
    );
    await user.selectOptions(
      within(rule1).getByRole('combobox', { name: 'Condition 1 operator' }),
      'range',
    );
    await user.type(within(rule1).getByRole('textbox', { name: 'Condition 1 minimum' }), '3');
    await user.type(within(rule1).getByRole('textbox', { name: 'Condition 1 maximum' }), '2');

    const results = await axe(document.body);
    expect(results.violations).toEqual([]);
  });

  // Story 4.12: reordering wired through the modal — `<RulesEditor>`'s handle handlers reaching
  // a real rule's Action combobox, and Escape mid-drag against the REAL MUI `Dialog`.
  it('reorders with the arrow keys, moving a rule’s Action with it', async () => {
    const user = userEvent.setup();
    mountModal();

    const dialog = screen.getByRole('dialog');
    const rules = within(dialog).getByRole('region', { name: 'Survival Rules' });
    const headerAdd = headerAddButton(rules);
    await user.click(headerAdd);
    await user.click(headerAdd);
    await user.click(headerAdd);

    const rule2 = within(rules).getByRole('group', { name: 'Rule 2' });
    await user.selectOptions(within(rule2).getByRole('combobox', { name: 'Action' }), 'survive');

    within(rules).getByRole('button', { name: 'Reorder rule 2' }).focus();
    await user.keyboard('{ArrowUp}');

    const rule1 = within(rules).getByRole('group', { name: 'Rule 1' });
    expect(within(rule1).getByRole('combobox', { name: 'Action' })).toHaveValue('survive');
    expect(document.activeElement).toBe(
      within(rules).getByRole('button', { name: 'Reorder rule 1' }),
    );
  });

  // The one test that proves the document-capture Escape listener against the REAL MUI `Dialog`
  // (every other reorder test uses the `RulesEditor.test.tsx` harness).
  it('Escape mid-drag does not close the dialog; Escape with no drag does', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mountModal({ onClose });

    const dialog = screen.getByRole('dialog');
    const rules = within(dialog).getByRole('region', { name: 'Survival Rules' });
    const headerAdd = headerAddButton(rules);
    await user.click(headerAdd);
    await user.click(headerAdd);

    const handle = within(rules).getByRole('button', { name: 'Reorder rule 1' });
    fireEvent.pointerDown(handle, { button: 0, isPrimary: true, pointerId: 1 });

    fireEvent.keyDown(handle, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.pointerUp(handle, { pointerId: 1 });

    // The listener lived only for the life of the drag — gone now, so the dialog's own Escape
    // path works.
    fireEvent.keyDown(handle, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Story 4.13: the Save gate, the focus effect and the honest notice, wired through the real
  // modal. `headerAddButton` is the fixture already defined above.
  describe('editor validation & feedback (Story 4.13)', () => {
    it('(11) Save on a fresh draft refuses, reveals the name error, focuses the name field, closes nothing', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      mountModal({ onClose });

      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      expect(within(dialog).getByRole('alert')).toHaveTextContent(ORGANISM_NAME_REQUIRED);
      const name = within(dialog).getByRole('textbox', { name: 'Organism Name' });
      expect(name).toBeInvalid();
      expect(name).toHaveFocus();
      expect(onClose).not.toHaveBeenCalled();
      expect(dialog).toBeInTheDocument();
    });

    it('(12) three errors at once, first focused, all derived and cleared independently', async () => {
      const user = userEvent.setup();
      mountModal();

      const dialog = screen.getByRole('dialog');
      const rules = within(dialog).getByRole('region', { name: 'Survival Rules' });
      const headerAdd = headerAddButton(rules);
      await user.click(headerAdd);
      await user.click(headerAdd);

      const rule2 = within(rules).getByRole('group', { name: 'Rule 2' });
      await user.click(within(rule2).getByRole('button', { name: '+ Add Condition' }));
      await user.selectOptions(
        within(rule2).getByRole('combobox', { name: 'Condition 1 property' }),
        'age',
      );
      await user.selectOptions(
        within(rule2).getByRole('combobox', { name: 'Condition 1 operator' }),
        'range',
      );
      await user.type(within(rule2).getByRole('textbox', { name: 'Condition 1 minimum' }), '5');
      // Max left untouched.

      const save = within(dialog).getByRole('button', { name: 'Save' });
      await user.click(save);

      expect(within(dialog).getAllByRole('alert')).toHaveLength(3);
      const nameField = within(dialog).getByRole('textbox', { name: 'Organism Name' });
      expect(nameField).toHaveFocus();
      const rule1 = within(rules).getByRole('group', { name: 'Rule 1' });
      expect(within(rule1).getByRole('alert')).toHaveTextContent(RULE_NEEDS_CONDITION);
      expect(within(rule2).getByRole('alert')).toHaveTextContent(
        'Max must be a whole number from 0 to 999',
      );

      await user.type(nameField, 'Glider');
      expect(within(dialog).getAllByRole('alert')).toHaveLength(2);

      await user.click(save);
      const addCondition1 = within(rule1).getByRole('button', { name: '+ Add Condition' });
      expect(addCondition1).toHaveFocus();

      await user.click(addCondition1);
      expect(within(rule1).queryByRole('alert')).not.toBeInTheDocument();

      await user.click(save);
      const max = within(rule2).getByRole('textbox', { name: 'Condition 1 maximum' });
      expect(max).toHaveFocus();

      await user.type(max, '9');
      expect(within(dialog).queryAllByRole('alert')).toHaveLength(0);
    });

    it('(13) a pair error focuses Min', async () => {
      const user = userEvent.setup();
      mountModal();

      const dialog = screen.getByRole('dialog');
      const rules = within(dialog).getByRole('region', { name: 'Survival Rules' });
      await user.click(headerAddButton(rules));
      const rule1 = within(rules).getByRole('group', { name: 'Rule 1' });
      await user.click(within(rule1).getByRole('button', { name: '+ Add Condition' }));
      await user.selectOptions(
        within(rule1).getByRole('combobox', { name: 'Condition 1 property' }),
        'age',
      );
      await user.selectOptions(
        within(rule1).getByRole('combobox', { name: 'Condition 1 operator' }),
        'range',
      );
      await user.type(within(rule1).getByRole('textbox', { name: 'Condition 1 minimum' }), '9');
      await user.type(within(rule1).getByRole('textbox', { name: 'Condition 1 maximum' }), '2');
      await user.type(within(dialog).getByRole('textbox', { name: 'Organism Name' }), 'Glider');

      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      expect(within(dialog).getByRole('alert')).toHaveTextContent('Min must be less than Max');
      expect(within(rule1).getByRole('textbox', { name: 'Condition 1 minimum' })).toHaveFocus();
    });

    describe('errorTargetSelector', () => {
      it('resolves the three target shapes', () => {
        expect(errorTargetSelector({ kind: 'name' })).toBe('[data-organism-name]');
        expect(errorTargetSelector({ kind: 'rule', ruleId: 'r1' })).toBe(
          '[data-rule-id="r1"] [data-add-condition]',
        );
        expect(
          errorTargetSelector({
            kind: 'condition',
            ruleId: 'r1',
            conditionId: 'c1',
            field: 'value',
          }),
        ).toBe('[data-rule-id="r1"] [data-condition-id="c1"] [data-condition-value]');
      });

      it('a pair error resolves to min', () => {
        expect(
          errorTargetSelector({
            kind: 'condition',
            ruleId: 'r1',
            conditionId: 'c1',
            field: 'pair',
          }),
        ).toBe('[data-rule-id="r1"] [data-condition-id="c1"] [data-condition-min]');
      });

      it('an id with a quote is escaped', () => {
        // The literal, not `CSS.escape('a"b')` — an expected value built with the function under
        // test's own dependency would also pass against an identity polyfill.
        const selector = errorTargetSelector({ kind: 'rule', ruleId: 'a"b' });
        expect(selector).toBe('[data-rule-id="a\\"b"] [data-add-condition]');
      });
    });

    it('(17) a reorder keeps the error target on the rule id, not its index', async () => {
      const user = userEvent.setup();
      mountModal();

      const dialog = screen.getByRole('dialog');
      const rules = within(dialog).getByRole('region', { name: 'Survival Rules' });
      const headerAdd = headerAddButton(rules);
      await user.click(headerAdd); // rule A — zero conditions
      await user.click(headerAdd); // rule B — given a valid condition below
      const ruleB = within(rules).getByRole('group', { name: 'Rule 2' });
      await user.click(within(ruleB).getByRole('button', { name: '+ Add Condition' }));
      await user.type(within(dialog).getByRole('textbox', { name: 'Organism Name' }), 'Glider');

      const save = within(dialog).getByRole('button', { name: 'Save' });
      await user.click(save);

      const ruleA = within(rules).getByRole('group', { name: 'Rule 1' });
      expect(within(ruleA).getByRole('button', { name: '+ Add Condition' })).toHaveFocus();

      const handleA = within(rules).getByRole('button', { name: 'Reorder rule 1' });
      handleA.focus();
      await user.keyboard('{ArrowDown}');

      await user.click(save);
      const ruleANow = within(rules).getByRole('group', { name: 'Rule 2' });
      expect(within(ruleANow).getByRole('button', { name: '+ Add Condition' })).toHaveFocus();
    });

    it('(18) has no axe violations with three errors visible', async () => {
      const user = userEvent.setup();
      mountModal();

      const dialog = screen.getByRole('dialog');
      const rules = within(dialog).getByRole('region', { name: 'Survival Rules' });
      const headerAdd = headerAddButton(rules);
      await user.click(headerAdd);
      await user.click(headerAdd);
      const rule2 = within(rules).getByRole('group', { name: 'Rule 2' });
      await user.click(within(rule2).getByRole('button', { name: '+ Add Condition' }));
      await user.selectOptions(
        within(rule2).getByRole('combobox', { name: 'Condition 1 property' }),
        'age',
      );
      await user.selectOptions(
        within(rule2).getByRole('combobox', { name: 'Condition 1 operator' }),
        'range',
      );
      await user.type(within(rule2).getByRole('textbox', { name: 'Condition 1 minimum' }), '5');
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));
      expect(within(dialog).getAllByRole('alert')).toHaveLength(3);

      expect((await axe(document.body)).violations).toEqual([]);
    });

    // Story 4.13 FD3 (the owner's option (c)): a rule or a condition added AFTER a refused Save is
    // not flagged on mount — `saveAttempted` clears globally on the structural add itself (not
    // per-control), which is why rule 2's still-present error also hides here, not just rule 3's
    // absent one. A value edit, a delete and a reorder all leave it sticky; a delete that shrinks
    // the list followed by an add still un-sticks (the size ref tracks the shrink); and the very
    // next Save re-flags everything, the newly added control included. `user.click` drains every
    // commit, so this pins the settled state per step — the "before paint" half of FD3 is the
    // layout effect's, measured in review, not asserted here.
    it('(19) a structural add un-sticks saveAttempted; a value edit, a delete or a reorder does not; a later Save re-flags everything', async () => {
      const user = userEvent.setup();
      mountModal();

      const dialog = screen.getByRole('dialog');
      const rules = within(dialog).getByRole('region', { name: 'Survival Rules' });
      const headerAdd = headerAddButton(rules);
      await user.click(headerAdd);
      await user.click(headerAdd);
      const save = within(dialog).getByRole('button', { name: 'Save' });
      await user.click(save);

      // Refused: name + both zero-condition rules are flagged — the alert lines AND the boundary
      // cues (the name's `aria-invalid`, both "+ Add Condition" buttons' `data-invalid`), so the
      // zero-count below is a clearing, not a selector that never matched.
      expect(within(dialog).getAllByRole('alert')).toHaveLength(3);
      expect(dialog.querySelectorAll('[aria-invalid="true"], [data-invalid]')).toHaveLength(3);

      // A value edit (not structural) leaves the override sticky — the two rule errors survive it.
      await user.type(within(dialog).getByRole('textbox', { name: 'Organism Name' }), 'G');
      expect(within(dialog).getAllByRole('alert')).toHaveLength(2);
      const rule1 = within(rules).getByRole('group', { name: 'Rule 1' });
      expect(within(rule1).getByRole('alert')).toHaveTextContent(RULE_NEEDS_CONDITION);

      // A reorder (Story 4.12) is not structural either — both errors survive the swap.
      within(rules).getByRole('button', { name: 'Reorder rule 1' }).focus();
      await user.keyboard('{ArrowDown}');
      expect(within(dialog).getAllByRole('alert')).toHaveLength(2);

      // A structural add — a new rule — clears `saveAttempted` globally: rule 2's untouched error
      // hides too, not merely rule 3's (which never had one to show). Focus lands on the new
      // card's Summary across the extra commit the clear costs.
      await user.click(headerAdd);
      expect(within(dialog).queryAllByRole('alert')).toHaveLength(0);
      expect(dialog.querySelectorAll('[aria-invalid="true"], [data-invalid]')).toHaveLength(0);
      const rule3 = within(rules).getByRole('group', { name: 'Rule 3' });
      expect(rule3.querySelector('[data-rule-summary]')).toHaveFocus();

      // A later Save re-flags everything, the added rule included (name stays valid from above).
      await user.click(save);
      expect(within(dialog).getAllByRole('alert')).toHaveLength(3);
      expect(within(rule3).getByRole('alert')).toHaveTextContent(RULE_NEEDS_CONDITION);

      // A structural add reached through a CONDITION (not a rule) un-sticks it the same way.
      await user.click(within(rule3).getByRole('button', { name: '+ Add Condition' }));
      expect(within(dialog).queryAllByRole('alert')).toHaveLength(0);

      await user.click(save);
      expect(within(dialog).getAllByRole('alert')).toHaveLength(2); // rule 1, rule 2 — 3 now satisfied

      // A delete is not structural: removing rule 1 (zero rows) drops its own line only; the
      // other zero-row rule's stays. Then deleting the rule WITH a row (renumbered to 2) shrinks
      // the size below the count at the last Save, and the next add must still un-stick: the ref
      // follows the shrink, it is not "the size at Save".
      await user.click(within(rules).getByRole('button', { name: 'Delete rule 1' }));
      expect(within(dialog).getAllByRole('alert')).toHaveLength(1);
      await user.click(within(rules).getByRole('button', { name: 'Delete rule 2' }));
      expect(within(dialog).getAllByRole('alert')).toHaveLength(1);
      await user.click(headerAdd);
      expect(within(dialog).queryAllByRole('alert')).toHaveLength(0);
    });
  });

  // Story 4.16: the write itself. `organisms` is a fresh fake per test (via `mountModal`) so
  // `organisms.list()` is a clean oracle, and every failure test asserts the POSITIVE control
  // (20)/(21) establish, never a bare `not.toHaveBeenCalled()`.
  describe('create & save organism (Story 4.16)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    /** Adds one rule with the default (valid) condition and types a name — the minimal valid
     * draft this block saves over and over. Returns the rule's own card, for its `data-rule-id`. */
    async function fillValidDraft(
      user: ReturnType<typeof userEvent.setup>,
      dialog: HTMLElement,
      name = 'Glider',
    ): Promise<HTMLElement> {
      const rules = within(dialog).getByRole('region', { name: 'Survival Rules' });
      await user.click(headerAddButton(rules));
      const rule1 = within(rules).getByRole('group', { name: 'Rule 1' });
      await user.click(within(rule1).getByRole('button', { name: '+ Add Condition' }));
      await user.type(within(dialog).getByRole('textbox', { name: 'Organism Name' }), name);
      return rule1;
    }

    it('(20) a valid draft (name "Glider", one rule with the default condition) saves through the injected repository exactly once', async () => {
      const organisms = createFakeRepositories({ organisms: LIBRARY }).organisms;
      const saveSpy = vi.spyOn(organisms, 'save');
      const onSaved = vi.fn();
      const user = userEvent.setup();
      mountModal({ organisms, onSaved });

      const dialog = screen.getByRole('dialog');
      const rule1 = await fillValidDraft(user, dialog);
      const ruleId = rule1.getAttribute('data-rule-id');

      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
      const record = saveSpy.mock.calls[0]?.[0] as Organism;
      expect(OrganismSchema.safeParse(record).success).toBe(true);
      expect(record.schemaVersion).toBe(ORGANISM_SCHEMA_VERSION);
      expect(record.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(record.name).toBe('Glider');
      expect(record.dominance).toBe(NEW_ORGANISM_DOMINANCE);
      expect(record.agingEnabled).toBe(false);
      // The DRAFT's colour — the M6 seed derived from `library` at mount (Story 4.8), not merely
      // some palette member.
      expect(record.colorToken).toBe(
        defaultColorToken(LIBRARY.map((organism) => organism.colorToken)),
      );
      expect(record.survivalRules).toHaveLength(1);
      const rule = record.survivalRules[0];
      expect(rule.id).toBe(ruleId);
      expect(rule.contentHash).toBe(await ruleContentHash(rule));

      expect(onSaved).toHaveBeenCalledTimes(1);
      expect(onSaved).toHaveBeenCalledWith(record);
      expect((await organisms.list()).length).toBe(LIBRARY.length + 1);
      expect(within(dialog).queryAllByRole('alert')).toHaveLength(0);
      expect(dialog.querySelector('[data-save-error]')).toBeNull();
    });

    it('(21) zero rules + valid name saves (survivalRules: []) and calls onSaved — the non-blocking pass Story 4.13 promised now proceeds', async () => {
      const organisms = createFakeRepositories({ organisms: LIBRARY }).organisms;
      const saveSpy = vi.spyOn(organisms, 'save');
      const onSaved = vi.fn();
      const user = userEvent.setup();
      mountModal({ organisms, onSaved });

      const dialog = screen.getByRole('dialog');
      await user.type(within(dialog).getByRole('textbox', { name: 'Organism Name' }), 'Glider');
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
      const record = saveSpy.mock.calls[0]?.[0] as Organism;
      expect(record.survivalRules).toEqual([]);
      expect(onSaved).toHaveBeenCalledTimes(1);
    });

    it('(22) an invalid draft is refused — save and onSaved are NOT called, the 4.13 refusal runs (the gate still runs first)', async () => {
      const organisms = createFakeRepositories({ organisms: LIBRARY }).organisms;
      const saveSpy = vi.spyOn(organisms, 'save');
      const onSaved = vi.fn();
      const user = userEvent.setup();
      mountModal({ organisms, onSaved });

      const dialog = screen.getByRole('dialog');
      const save = within(dialog).getByRole('button', { name: 'Save' });
      await user.click(save); // empty name — invalid by construction

      expect(within(dialog).getByRole('alert')).toHaveTextContent(ORGANISM_NAME_REQUIRED);
      expect(within(dialog).getByRole('textbox', { name: 'Organism Name' })).toHaveFocus();
      expect(saveSpy).not.toHaveBeenCalled();
      expect(onSaved).not.toHaveBeenCalled();
    });

    it.each([
      [
        'QuotaExceededError',
        () => new QuotaExceededError('gol:organisms'),
        'Storage is full, so this organism was not saved.',
      ],
      [
        'CorruptDataError',
        () => new CorruptDataError('gol:organisms', 'x'),
        'Saved organism data could not be read, so this organism was not saved.',
      ],
      ['a bare Error', () => new Error('boom'), 'This organism could not be saved.'],
    ] as const)(
      '(23) a rejected save (%s) reports the matching sentence, non-destructively',
      async (_label, makeError, expectedPrefix) => {
        const organisms = createFakeRepositories({ organisms: LIBRARY }).organisms;
        const before = await organisms.list();
        vi.spyOn(organisms, 'save').mockRejectedValueOnce(makeError());
        const onSaved = vi.fn();
        const user = userEvent.setup();
        mountModal({ organisms, onSaved });

        const dialog = screen.getByRole('dialog');
        await fillValidDraft(user, dialog);
        const save = within(dialog).getByRole('button', { name: 'Save' });
        await user.click(save);

        const alert = await within(dialog).findByRole('alert');
        expect(alert).toHaveTextContent(expectedPrefix);
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByRole('textbox', { name: 'Organism Name' })).toHaveValue('Glider');
        expect(
          within(dialog)
            .getByRole('region', { name: 'Survival Rules' })
            .querySelector('[data-rule-id]'),
        ).not.toBeNull();
        expect(save).toBeEnabled();
        expect(onSaved).not.toHaveBeenCalled();
        expect(await organisms.list()).toEqual(before);
      },
    );

    it('(24) the alert line clears at the START of the next attempt, before the write settles', async () => {
      const organisms = createFakeRepositories({ organisms: LIBRARY }).organisms;
      let resolveSecond!: () => void;
      const saveSpy = vi
        .spyOn(organisms, 'save')
        .mockRejectedValueOnce(new QuotaExceededError('gol:organisms'))
        .mockImplementationOnce(
          () =>
            new Promise<void>((resolve) => {
              resolveSecond = resolve;
            }),
        );
      const onSaved = vi.fn();
      const user = userEvent.setup();
      mountModal({ organisms, onSaved });

      const dialog = screen.getByRole('dialog');
      await fillValidDraft(user, dialog);
      const save = within(dialog).getByRole('button', { name: 'Save' });
      await user.click(save);
      await within(dialog).findByRole('alert');

      // A second, deferred attempt: the line clears BEFORE the write settles — the very first
      // `setState` in the handler, before any `await`.
      await user.click(save);
      expect(dialog.querySelector('[data-save-error]')).toBeNull();
      // `save` sits behind the awaited digest — reach it before resolving it (review 2026-09-22).
      await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(2));
      await act(async () => {
        resolveSecond();
      });
      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    });

    it('(24b) a refused Save after a failed write clears the alert line too', async () => {
      const organisms = createFakeRepositories({ organisms: LIBRARY }).organisms;
      vi.spyOn(organisms, 'save').mockRejectedValueOnce(new QuotaExceededError('gol:organisms'));
      const user = userEvent.setup();
      mountModal({ organisms });

      const dialog = screen.getByRole('dialog');
      const rule1 = await fillValidDraft(user, dialog);
      const save = within(dialog).getByRole('button', { name: 'Save' });
      await user.click(save);
      await within(dialog).findByRole('alert');

      // Break the draft (delete the only rule, leaving zero conditions is not enough — clear the
      // name instead, the reliable refusal trigger throughout this file).
      const name = within(dialog).getByRole('textbox', { name: 'Organism Name' });
      await user.clear(name);
      await user.click(save);

      expect(dialog.querySelector('[data-save-error]')).toBeNull();
      expect(within(dialog).getByRole('alert')).toHaveTextContent(ORGANISM_NAME_REQUIRED);
      expect(rule1).toBeInTheDocument();
    });

    it('(25) re-entrancy: two rapid clicks call save once; Save is disabled while pending and enabled again after a success', async () => {
      const organisms = createFakeRepositories({ organisms: LIBRARY }).organisms;
      let resolveSave!: () => void;
      const saveSpy = vi.spyOn(organisms, 'save').mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveSave = resolve;
          }),
      );
      const onSaved = vi.fn();
      const user = userEvent.setup();
      mountModal({ organisms, onSaved });

      const dialog = screen.getByRole('dialog');
      await fillValidDraft(user, dialog);
      const save = within(dialog).getByRole('button', { name: 'Save' });

      fireEvent.click(save);
      fireEvent.click(save);

      await waitFor(() => expect(save).toBeDisabled());
      // `save` sits behind the awaited digest — wait for it rather than assert the count on the
      // first render after the click (review 2026-09-22).
      await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));

      await act(async () => {
        resolveSave();
      });
      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
      // Task 11 (2026-09-22) supersedes the earlier review's "hold after success": the dialog no
      // longer closes on save, so there is no exit-fade window for a released button to be
      // double-clicked through — Save is released after EVERY outcome (a failure already did —
      // (23)/(26) pin that).
      await waitFor(() => expect(save).toBeEnabled());
    });

    // Story 4.16, Task 11 (2026-09-22): a second Save in the same session — the id is REUSED
    // (`saveStamp`), so `organisms.save()` upserts the same organism rather than minting a
    // sibling. One record in the library, not two.
    it('(25b) a second Save after a successful write updates the SAME organism — same id, list() grew by ONE', async () => {
      const organisms = createFakeRepositories({ organisms: LIBRARY }).organisms;
      const saveSpy = vi.spyOn(organisms, 'save');
      const onSaved = vi.fn();
      const user = userEvent.setup();
      mountModal({ organisms, onSaved });

      const dialog = screen.getByRole('dialog');
      await fillValidDraft(user, dialog);
      const save = within(dialog).getByRole('button', { name: 'Save' });

      await user.click(save);
      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(save).toBeEnabled());

      const name = within(dialog).getByRole('textbox', { name: 'Organism Name' });
      await user.type(name, ' Mk II');
      await user.click(save);
      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(2));

      expect(saveSpy).toHaveBeenCalledTimes(2);
      const firstId = (saveSpy.mock.calls[0]?.[0] as Organism).id;
      const secondId = (saveSpy.mock.calls[1]?.[0] as Organism).id;
      expect(secondId).toBe(firstId);
      expect((await organisms.list()).length).toBe(LIBRARY.length + 1);
      expect(await organisms.load(firstId)).toMatchObject({ name: 'Glider Mk II' });
    });

    it('(26) crypto.randomUUID throwing reports the generic sentence and releases isSaving (Save is usable again)', async () => {
      const organisms = createFakeRepositories({ organisms: LIBRARY }).organisms;
      const saveSpy = vi.spyOn(organisms, 'save');
      const user = userEvent.setup();
      mountModal({ organisms });

      const dialog = screen.getByRole('dialog');
      // Build the valid draft with `crypto.randomUUID` intact — `addRule` mints a rule id through
      // the SAME global, and the spy below must apply only to the id `saveOrganism` mints.
      await fillValidDraft(user, dialog);
      const save = within(dialog).getByRole('button', { name: 'Save' });

      const uuidSpy = vi.spyOn(crypto, 'randomUUID').mockImplementationOnce(() => {
        throw new Error('no secure context');
      });
      await user.click(save);

      expect(within(dialog).getByRole('alert')).toHaveTextContent(
        'This organism could not be saved.',
      );
      expect(save).toBeEnabled();
      expect(saveSpy).not.toHaveBeenCalled();

      // The wedge test: a SECOND, real attempt must still go through — isSaving/savingRef were
      // released, not stuck true forever.
      uuidSpy.mockRestore();
      await user.click(save);
      await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
    });

    it('(27) uncapped by the palette (AC6, M6): a library covering every PALETTE token still saves', async () => {
      const fullPaletteLibrary: Organism[] = PALETTE.map((entry, i) => ({
        schemaVersion: 1,
        id: `palette-fixture-${i}`,
        name: `Fixture ${i}`,
        colorToken: entry.id,
        dominance: NEW_ORGANISM_DOMINANCE,
        agingEnabled: false,
        survivalRules: [],
      }));
      const organisms = createFakeRepositories({ organisms: fullPaletteLibrary }).organisms;
      const saveSpy = vi.spyOn(organisms, 'save');
      const user = userEvent.setup();
      mountModal({ organisms, library: fullPaletteLibrary });

      const dialog = screen.getByRole('dialog');
      // The M6 default falls back to least-used — every token is used exactly once, so the SEED
      // itself is already-used, but FD2 ("the default never warns") means re-picking the seed
      // shows nothing. Pick any DIFFERENT token instead — with all 20 in use, that one warns too.
      await user.click(within(dialog).getByRole('button', { name: 'Change Color' }));
      const radios = within(dialog).getAllByRole('radio');
      const seedIndex = radios.findIndex((radio) => (radio as HTMLInputElement).checked);
      expect(seedIndex).toBeGreaterThanOrEqual(0);
      const otherToken = radios[(seedIndex + 1) % radios.length];
      await user.click(otherToken);
      expect(within(dialog).getByText(/already uses this color/i)).toBeInTheDocument();

      await user.type(within(dialog).getByRole('textbox', { name: 'Organism Name' }), 'Glider');
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
    });

    it('(28) axe: no violations with the error line visible', async () => {
      const organisms = createFakeRepositories({ organisms: LIBRARY }).organisms;
      vi.spyOn(organisms, 'save').mockRejectedValueOnce(new QuotaExceededError('gol:organisms'));
      const user = userEvent.setup();
      mountModal({ organisms });

      const dialog = screen.getByRole('dialog');
      await fillValidDraft(user, dialog);
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));
      await within(dialog).findByRole('alert');

      expect((await axe(document.body)).violations).toEqual([]);
    });

    // Story 4.15 isolation, extended: a save during a PAUSED preview run must not reset it — the
    // modal unmounts on exit anyway, so nothing here should touch `useSimulation`'s state.
    it('(30) the preview run is not disturbed by a save — [data-status] on the dish is unchanged', async () => {
      const driver = installFrameDriver();
      const organisms = createFakeRepositories({ organisms: LIBRARY }).organisms;
      const onSaved = vi.fn();
      const user = userEvent.setup();
      mountModal({ organisms, onSaved });

      const dialog = screen.getByRole('dialog');
      const preview = within(dialog).getByRole('region', { name: 'Preview & Test' });
      await user.type(within(dialog).getByRole('textbox', { name: 'Organism Name' }), 'Glider');

      await user.click(within(preview).getByRole('button', { name: 'Play' }));
      driver.frame(0);
      driver.frame(100); // extinction — auto-pause (Decision B.5)

      const dish = dialog.querySelector('[data-preview-dish]');
      expect(dish).toHaveAttribute('data-status', 'paused');
      const statusBefore = dish?.getAttribute('data-status');
      const cycleBefore = dish?.getAttribute('data-cycle');

      await user.click(within(dialog).getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));

      expect(dish?.getAttribute('data-status')).toBe(statusBefore);
      expect(dish?.getAttribute('data-cycle')).toBe(cycleBefore);
    });

    // Story 4.16, Task 11 (AC3): the outcome line is the modal's OWN region now (moved from the
    // Library) — a valid save publishes it in place, the dialog never closes.
    it('(31) a valid save publishes the outcome line in the dialog, which stays open', async () => {
      const organisms = createFakeRepositories({ organisms: LIBRARY }).organisms;
      const onSaved = vi.fn();
      const user = userEvent.setup();
      mountModal({ organisms, onSaved });

      const dialog = screen.getByRole('dialog');
      await fillValidDraft(user, dialog);
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
      expect(dialog).toBeInTheDocument();
      expect(dialog.querySelector('[data-save-outcome]')).toHaveTextContent(
        'Organism saved successfully.',
      );
    });

    // Story 4.16, Task 11: the region clears at the START of the NEXT attempt (never both lines
    // mounted at once) and re-fills once that attempt settles. Ordered success FIRST (review
    // 2026-09-22): a failure-then-success run finds the region empty after the failure only
    // because nothing had ever filled it — the sequence that guards the clear is a SUCCESS, then a
    // second attempt whose write is still pending (the region must already be empty) and then
    // REJECTS (the alert alone, no stale success line beneath it).
    it('(32) after a success, the next attempt empties the outcome line while its write is pending, and a rejection leaves the alert alone', async () => {
      const organisms = createFakeRepositories({ organisms: LIBRARY }).organisms;
      let rejectSecond!: () => void;
      const saveSpy = vi.spyOn(organisms, 'save');
      const onSaved = vi.fn();
      const user = userEvent.setup();
      mountModal({ organisms, onSaved });

      const dialog = screen.getByRole('dialog');
      await fillValidDraft(user, dialog);
      const save = within(dialog).getByRole('button', { name: 'Save' });
      await user.click(save);
      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
      expect(dialog.querySelector('[data-save-outcome]')).toHaveTextContent(
        'Organism saved successfully.',
      );

      saveSpy.mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, reject) => {
            rejectSecond = () => reject(new QuotaExceededError('gol:organisms'));
          }),
      );
      await user.click(save);
      await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(2));
      // The clear is the handler's first `setState`, before any `await` — the line is gone while
      // the second write is still in flight, not merely replaced once it settles.
      expect(dialog.querySelector('[data-save-outcome]')).toBeNull();
      expect(dialog.querySelector('[data-save-error]')).toBeNull();

      await act(async () => {
        rejectSecond();
      });
      await within(dialog).findByRole('alert');
      expect(dialog.querySelector('[data-save-outcome]')).toBeNull();
      expect(onSaved).toHaveBeenCalledTimes(1);
    });

    // Review 2026-09-22: the settle-focus effect must not STEAL focus. Back is locked during the
    // write but every field is live, and against an API repository the write is a round-trip —
    // a user who moved into the name field keeps the caret (the `<BattlePage>` "only when focus
    // is loose" rule).
    it('(35) focus is NOT moved to Save when the user has placed it in a field during the write', async () => {
      const organisms = createFakeRepositories({ organisms: LIBRARY }).organisms;
      let resolveSave!: () => void;
      const saveSpy = vi.spyOn(organisms, 'save').mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveSave = resolve;
          }),
      );
      const user = userEvent.setup();
      mountModal({ organisms });

      const dialog = screen.getByRole('dialog');
      await fillValidDraft(user, dialog);
      const save = within(dialog).getByRole('button', { name: 'Save' });
      await user.click(save);
      await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));

      const name = within(dialog).getByRole('textbox', { name: 'Organism Name' });
      await user.click(name);
      expect(name).toHaveFocus();

      await act(async () => {
        resolveSave();
      });
      await waitFor(() => expect(save).toBeEnabled());
      expect(name).toHaveFocus();
      expect(save).not.toHaveFocus();
    });

    // Review 2026-09-22: the close-lock (Task 12) covers a close DURING a write; this is the
    // other order — a Save during the ~195 ms exit fade after a clean close. The dialog is still
    // mounted and interactive with `open={false}`; a write started there could resolve after
    // `onExited`, when the hook has nothing ahead to hand the record on to. Refused outright.
    it('(36) Save during the exit fade after a clean close writes nothing', async () => {
      const organisms = createFakeRepositories({ organisms: LIBRARY }).organisms;
      const saveSpy = vi.spyOn(organisms, 'save');
      const onSaved = vi.fn();
      const onClose = vi.fn();
      const user = userEvent.setup();
      const { rerender } = render(
        <OrganismEditorModal
          open
          origin="library"
          organism={null}
          onClose={onClose}
          library={LIBRARY}
          battleSummaries={NO_BATTLES}
          organisms={organisms}
          onSaved={onSaved}
        />,
      );

      const dialog = screen.getByRole('dialog');
      await fillValidDraft(user, dialog);
      const save = within(dialog).getByRole('button', { name: 'Save' });

      await user.keyboard('{Escape}');
      expect(onClose).toHaveBeenCalledTimes(1);
      rerender(
        <OrganismEditorModal
          open={false}
          origin="library"
          organism={null}
          onClose={onClose}
          library={LIBRARY}
          battleSummaries={NO_BATTLES}
          organisms={organisms}
          onSaved={onSaved}
        />,
      );
      // Still in the DOM: MUI keeps the paper mounted through the exit transition.
      expect(save).toBeInTheDocument();
      expect(save).toBeEnabled();

      fireEvent.click(save);
      save.focus();
      await user.keyboard('{Enter}');
      await act(async () => {});

      expect(saveSpy).not.toHaveBeenCalled();
      expect(onSaved).not.toHaveBeenCalled();
      expect((await organisms.list()).length).toBe(LIBRARY.length);
    });

    // Story 4.16, Task 11: focus returns to Save once the write settles — while `isSaving` the
    // button is `disabled`, which drops focus to `<body>` (the HTML focus-fixup rule).
    it('(33) focus returns to Save once a successful write settles', async () => {
      const organisms = createFakeRepositories({ organisms: LIBRARY }).organisms;
      let resolveSave!: () => void;
      const saveSpy = vi.spyOn(organisms, 'save').mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveSave = resolve;
          }),
      );
      const user = userEvent.setup();
      mountModal({ organisms });

      const dialog = screen.getByRole('dialog');
      await fillValidDraft(user, dialog);
      const save = within(dialog).getByRole('button', { name: 'Save' });
      await user.click(save);

      await waitFor(() => expect(save).toBeDisabled());
      // jsdom does not implement the browser's "a disabled control drops focus to <body>"
      // fixup (unlike a real engine — the fact `[Review][Defer]` records for this same button),
      // so simulate it directly: the fact under test is the EFFECT that restores focus, not the
      // browser's own blur.
      save.blur();
      expect(save).not.toHaveFocus();

      // The write sits behind an awaited digest — wait for it to be REACHED before resolving
      // (review 2026-09-22): `resolveSave` is unassigned until `organisms.save` runs.
      await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
      await act(async () => {
        resolveSave();
      });
      await waitFor(() => expect(save).toHaveFocus());
    });

    it('(34) focus returns to Save once a rejected write settles', async () => {
      const organisms = createFakeRepositories({ organisms: LIBRARY }).organisms;
      let resolveSave!: () => void;
      const saveSpy = vi.spyOn(organisms, 'save').mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, reject) => {
            resolveSave = () => reject(new QuotaExceededError('gol:organisms'));
          }),
      );
      const user = userEvent.setup();
      mountModal({ organisms });

      const dialog = screen.getByRole('dialog');
      await fillValidDraft(user, dialog);
      const save = within(dialog).getByRole('button', { name: 'Save' });
      await user.click(save);

      await waitFor(() => expect(save).toBeDisabled());
      save.blur();
      expect(save).not.toHaveFocus();

      // The write sits behind an awaited digest — wait for it to be REACHED before resolving
      // (review 2026-09-22): `resolveSave` is unassigned until `organisms.save` runs.
      await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
      await act(async () => {
        resolveSave();
      });
      await within(dialog).findByRole('alert');
      await waitFor(() => expect(save).toHaveFocus());
    });

    // Story 4.16, Task 12 (owner's review decision, 2026-09-22, option (b)): the close is locked
    // while a write is in flight — Escape, Back and the ✕ button all become no-ops.
    describe('close is locked while saving (Task 12)', () => {
      it('Escape does not close the dialog while a write is in flight, and closes once it settles', async () => {
        const organisms = createFakeRepositories({ organisms: LIBRARY }).organisms;
        let resolveSave!: () => void;
        const saveSpy = vi.spyOn(organisms, 'save').mockImplementationOnce(
          () =>
            new Promise<void>((resolve) => {
              resolveSave = resolve;
            }),
        );
        const onClose = vi.fn();
        const user = userEvent.setup();
        mountModal({ organisms, onClose });

        const dialog = screen.getByRole('dialog');
        await fillValidDraft(user, dialog);
        const name = within(dialog).getByRole('textbox', { name: 'Organism Name' });
        await user.click(within(dialog).getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled());

        // Like-for-like with the positive control below (review 2026-09-22): both Escapes are
        // pressed with focus on a LIVE control inside the dialog. Pressed while the (jsdom-
        // unfixed) disabled Save still held focus, the negative would pass whether or not MUI's
        // root `onKeyDown` ever saw the key.
        name.focus();
        expect(name).toHaveFocus();
        await user.keyboard('{Escape}');
        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByRole('dialog')).toBeInTheDocument();

        // The write sits behind an awaited digest — wait for it to be REACHED before resolving
        // (review 2026-09-22): `resolveSave` is unassigned until `organisms.save` runs.
        await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
        await act(async () => {
          resolveSave();
        });
        await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());

        name.focus();
        expect(name).toHaveFocus();
        await user.keyboard('{Escape}');
        expect(onClose).toHaveBeenCalledTimes(1);
      });

      it('a Back click does not close the dialog while a write is in flight, and Back is disabled meanwhile', async () => {
        const organisms = createFakeRepositories({ organisms: LIBRARY }).organisms;
        let resolveSave!: () => void;
        const saveSpy = vi.spyOn(organisms, 'save').mockImplementationOnce(
          () =>
            new Promise<void>((resolve) => {
              resolveSave = resolve;
            }),
        );
        const onClose = vi.fn();
        const user = userEvent.setup();
        mountModal({ organisms, onClose });

        const dialog = screen.getByRole('dialog');
        await fillValidDraft(user, dialog);
        await user.click(within(dialog).getByRole('button', { name: 'Save' }));
        const back = within(dialog).getByRole('button', { name: 'Back to Library' });
        await waitFor(() => expect(back).toBeDisabled());

        // A disabled button is inert to a real click; `fireEvent` bypasses that, pinning the
        // `disabled` attribute itself, not merely a guard inside the handler.
        fireEvent.click(back);
        expect(onClose).not.toHaveBeenCalled();

        // The write sits behind an awaited digest — wait for it to be REACHED before resolving
        // (review 2026-09-22): `resolveSave` is unassigned until `organisms.save` runs.
        await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
        await act(async () => {
          resolveSave();
        });
        await waitFor(() => expect(back).toBeEnabled());

        await user.click(back);
        expect(onClose).toHaveBeenCalledTimes(1);
      });

      it('the ✕ button is disabled and does not close the dialog while a write is in flight, and re-enables once it settles (Task 13)', async () => {
        const organisms = createFakeRepositories({ organisms: LIBRARY }).organisms;
        let resolveSave!: () => void;
        const saveSpy = vi.spyOn(organisms, 'save').mockImplementationOnce(
          () =>
            new Promise<void>((resolve) => {
              resolveSave = resolve;
            }),
        );
        const onClose = vi.fn();
        const user = userEvent.setup();
        mountModal({ organisms, onClose });

        const dialog = screen.getByRole('dialog');
        await fillValidDraft(user, dialog);
        await user.click(within(dialog).getByRole('button', { name: 'Save' }));
        const closeButton = within(dialog).getByRole('button', { name: 'Close' });
        await waitFor(() => expect(closeButton).toBeDisabled());

        // Task 13's literal bullet ("a click on it while saving does not close"); `fireEvent`
        // because a disabled control is inert to `user.click`. Note what this click does NOT prove
        // (review 2026-09-22): the ✕ handler is `handleRequestClose`, whose `savingRef` guard would
        // swallow the call even with `disabled` removed, and React drops clicks on a disabled
        // `<button>` even with the guard removed — `not.toHaveBeenCalled()` fails only if BOTH go.
        // The `disabled` attribute is pinned by `toBeDisabled()` above; the guard by the Escape
        // test in this block. (Testing standards say not to click a disabled button to prove it
        // inert; the task's bullet asks for exactly that, so the click stays, labelled.)
        fireEvent.click(closeButton);
        expect(onClose).not.toHaveBeenCalled();

        // The write sits behind an awaited digest — wait for it to be REACHED before resolving
        // (review 2026-09-22): `resolveSave` is unassigned until `organisms.save` runs.
        await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
        await act(async () => {
          resolveSave();
        });
        await waitFor(() => expect(closeButton).toBeEnabled());

        await user.click(closeButton);
        expect(onClose).toHaveBeenCalledTimes(1);
      });

      it('the ✕ button re-enables after a rejected write settles and then closes (Task 13)', async () => {
        const organisms = createFakeRepositories({ organisms: LIBRARY }).organisms;
        let rejectSave!: () => void;
        const saveSpy = vi.spyOn(organisms, 'save').mockImplementationOnce(
          () =>
            new Promise<void>((_resolve, reject) => {
              rejectSave = () => reject(new QuotaExceededError('gol:organisms'));
            }),
        );
        const user = userEvent.setup();
        const { onClose } = mountModal({ organisms });

        const dialog = screen.getByRole('dialog');
        await fillValidDraft(user, dialog);
        await user.click(within(dialog).getByRole('button', { name: 'Save' }));
        const closeButton = within(dialog).getByRole('button', { name: 'Close' });
        await waitFor(() => expect(closeButton).toBeDisabled());

        // The write sits behind an awaited digest — wait for it to be REACHED before rejecting
        // (review 2026-09-22): `rejectSave` is unassigned until `organisms.save` runs.
        await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
        await act(async () => {
          rejectSave();
        });
        await within(dialog).findByRole('alert');
        await waitFor(() => expect(closeButton).toBeEnabled());

        // Re-enabled AND the guard released — a real click closes (review 2026-09-22: the success
        // case proves this; the rejection path releases through the same `finally`, pinned here).
        await user.click(closeButton);
        expect(onClose).toHaveBeenCalledTimes(1);
      });
    });
  });

  // Story 4.14: the modal's real `colors` memo (`readGridColors`) and the panel it feeds — the
  // panel's OWN behaviour (draw/erase/clear, palette memo) is `PreviewPanel.test.tsx`'s.
  describe('preview grid & drawing (Story 4.14)', () => {
    // jsdom never loads themes.css (`readGridColors` resolves null); writing the tokens onto
    // `documentElement` is the same workaround `BattlePage.test.tsx:38-45` establishes for the
    // identical gate — the dialog portals to `document.body`, but the tokens sit on bare `:root`.
    function enableCanvasRendering() {
      document.documentElement.style.setProperty('--gol-bg-primary', '#0a0a0a');
      document.documentElement.style.setProperty('--gol-grid-line', 'rgb(51 51 51 / 0.3)');
    }

    afterEach(() => {
      document.documentElement.style.cssText = '';
      // This file has no file-level restore and the config sets no `restoreMocks`: a prototype
      // spy left in place here would serve the next test's canvases too.
      vi.restoreAllMocks();
    });

    it('the Preview & Test region holds the drawing controls, Draw pressed, Clear disabled, and no canvas under jsdom’s bare root', () => {
      mountModal();

      const dialog = screen.getByRole('dialog');
      const preview = within(dialog).getByRole('region', { name: 'Preview & Test' });
      const group = within(preview).getByRole('group', { name: 'Drawing tools' });
      expect(within(group).getByRole('button', { name: 'Draw' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(within(group).getByRole('button', { name: 'Erase' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
      expect(within(group).getByRole('button', { name: 'Clear' })).toBeDisabled();
      expect(within(preview).queryByRole('img')).toBeNull();
    });

    it('with the token layer present the canvas mounts inside the Preview region', () => {
      enableCanvasRendering();
      mountModal();

      const dialog = screen.getByRole('dialog');
      const preview = within(dialog).getByRole('region', { name: 'Preview & Test' });
      expect(
        within(preview).getByRole('img', { name: 'Petri dish, 30 by 20 cells' }),
      ).toBeInTheDocument();
    });

    it('a swatch pick leaves the preview’s controls byte-identical', async () => {
      const user = userEvent.setup();
      mountModal();

      const dialog = screen.getByRole('dialog');
      const preview = within(dialog).getByRole('region', { name: 'Preview & Test' });
      const group = within(preview).getByRole('group', { name: 'Drawing tools' });
      const before = group.outerHTML;

      await user.click(within(dialog).getByRole('button', { name: 'Change Color' }));
      await user.click(within(dialog).getByRole('radio', { name: PALETTE[9].name }));

      expect(within(preview).getByRole('group', { name: 'Drawing tools' }).outerHTML).toBe(before);
    });

    it('drawing does not touch the draft', async () => {
      enableCanvasRendering();
      // BEFORE `render`: the construction effect asks for its context on mount, and a spy installed
      // afterwards would leave the canvas on jsdom's null-context path for the whole test.
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
        this: HTMLCanvasElement,
      ) {
        return new RecordingContext2D() as unknown as CanvasRenderingContext2D;
      });
      const user = userEvent.setup();
      const { onSaved } = mountModal();

      const dialog = screen.getByRole('dialog');
      const preview = within(dialog).getByRole('region', { name: 'Preview & Test' });
      const canvas = preview.querySelector('canvas') as HTMLCanvasElement;
      vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: canvas.width,
        height: canvas.height,
        right: canvas.width,
        bottom: canvas.height,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);
      const { cellSize, originX, originY } = computeGridLayout(canvas, PREVIEW_GRID_SIZE, true);
      const point = {
        clientX: originX + 3 * cellSize + cellSize / 2,
        clientY: originY + 4 * cellSize + cellSize / 2,
        button: 0,
        isPrimary: true,
      };

      const nameField = screen.getByRole('textbox', { name: 'Organism Name' });
      await user.type(nameField, 'Glider');
      fireEvent.pointerDown(canvas, point);
      fireEvent.pointerUp(canvas, point);
      expect(within(preview).getByRole('button', { name: 'Clear' })).toBeEnabled();

      // Story 4.16: a valid, zero-rule draft now SAVES rather than showing a transitional notice
      // — the save itself does not clear the draft (the parent unmounts the modal on `onSaved`).
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
      expect(screen.getByRole('textbox', { name: 'Organism Name' })).toHaveValue('Glider');
    });

    it('has no axe violations with the canvas mounted (Story 4.14)', async () => {
      enableCanvasRendering();
      mountModal();

      const results = await axe(document.body);
      expect(results.violations).toEqual([]);
    });
  });

  // Story 4.15: the panel's own run behaviour (Play/Pause/Step/Stop, the roster snapshot, the
  // canvas swap) is `PreviewPanel.test.tsx`'s; what the MODAL owes is that the run reaches the
  // dialog (the draft's real `survivalRules`, through the real `+ Add Rule` / `+ Add Condition`
  // UI) and that closing the dialog stops the loop.
  describe('preview simulation (Story 4.15)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('the Preview & Test region holds the Simulation controls group, the Generations per second slider and a Cycle readout reading 0000', () => {
      mountModal();

      const dialog = screen.getByRole('dialog');
      const preview = within(dialog).getByRole('region', { name: 'Preview & Test' });
      expect(
        within(preview).getByRole('group', { name: 'Simulation controls' }),
      ).toBeInTheDocument();
      expect(
        within(preview).getByRole('slider', { name: 'Generations per second' }),
      ).toBeInTheDocument();
      expect(preview.querySelector('[data-preview-cycle]')).toHaveTextContent('0000');
    });

    it('"+ Add Rule" blocks Play through the real draft; the first condition unblocks it (AC6)', async () => {
      const user = userEvent.setup();
      mountModal();

      const dialog = screen.getByRole('dialog');
      const rules = within(dialog).getByRole('region', { name: 'Survival Rules' });
      const preview = within(dialog).getByRole('region', { name: 'Preview & Test' });

      await user.click(headerAddButton(rules));
      expect(within(preview).getByRole('button', { name: 'Play' })).toBeDisabled();
      expect(
        within(preview).getByText('Fix the rule errors to run the preview.'),
      ).toBeInTheDocument();

      const rule1 = within(rules).getByRole('group', { name: 'Rule 1' });
      await user.click(within(rule1).getByRole('button', { name: '+ Add Condition' }));

      expect(within(preview).getByRole('button', { name: 'Play' })).toBeEnabled();
      expect(within(preview).queryByText('Fix the rule errors to run the preview.')).toBeNull();
    });

    it('a headless run under jsdom’s bare root: Play advances one cycle to an empty-dish auto-pause, and the draft is untouched', async () => {
      const driver = installFrameDriver();
      const user = userEvent.setup();
      mountModal();

      const dialog = screen.getByRole('dialog');
      const preview = within(dialog).getByRole('region', { name: 'Preview & Test' });
      // `colors === null` under jsdom's bare root (no `--gol-*` tokens): no canvas mounts, but the
      // hook still runs — the documented headless state (3.10).
      expect(within(preview).queryByRole('img')).toBeNull();

      const nameField = screen.getByRole('textbox', { name: 'Organism Name' });
      await user.type(nameField, 'Glider');

      await user.click(within(preview).getByRole('button', { name: 'Play' }));
      driver.frame(0);
      driver.frame(100);

      expect(preview.querySelector('[data-preview-cycle]')).toHaveTextContent('0001');
      expect(within(preview).getByRole('button', { name: 'Play' })).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'Organism Name' })).toHaveValue('Glider');
    });

    it('Escape mid-run closes the dialog and stops the loop', async () => {
      const driver = installFrameDriver();
      const user = userEvent.setup();
      const onClose = vi.fn();
      const organisms = createFakeRepositories({ organisms: LIBRARY }).organisms;
      const { rerender } = render(
        <OrganismEditorModal
          open
          origin="library"
          organism={null}
          onClose={onClose}
          library={LIBRARY}
          battleSummaries={NO_BATTLES}
          organisms={organisms}
          onSaved={vi.fn()}
        />,
      );

      const dialog = screen.getByRole('dialog');
      const preview = within(dialog).getByRole('region', { name: 'Preview & Test' });
      await user.click(within(preview).getByRole('button', { name: 'Play' }));
      driver.frame(0);

      await user.keyboard('{Escape}');
      expect(onClose).toHaveBeenCalledTimes(1);

      rerender(
        <OrganismEditorModal
          open={false}
          origin="library"
          organism={null}
          onClose={onClose}
          library={LIBRARY}
          battleSummaries={NO_BATTLES}
          organisms={organisms}
          onSaved={vi.fn()}
        />,
      );
      // MUI's exit transition defers the actual unmount past this render — wait for it rather
      // than assume it is synchronous.
      await waitFor(() => expect(driver.caf).toHaveBeenCalled());
      expect(driver.pending()).toBe(0);
    });

    it('axe: the run paused after an extinction has no violations', async () => {
      const driver = installFrameDriver();
      const user = userEvent.setup();
      mountModal();

      const dialog = screen.getByRole('dialog');
      const preview = within(dialog).getByRole('region', { name: 'Preview & Test' });
      await user.click(within(preview).getByRole('button', { name: 'Play' }));
      driver.frame(0);
      driver.frame(100);

      const results = await axe(document.body);
      expect(results.violations).toEqual([]);
    });
  });

  // Story 4.17: the same shell with `organism` set. The load-bearing claims — the FIRST Save
  // upserts the opened record rather than minting a sibling (39/40), an unchanged re-save is
  // byte-identical (39), and the organism never warns about its own colour (41) — are the three
  // silent failures the story's Dev Notes name.
  describe('edit organism from library (Story 4.17)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    // Patient Defender: dominance 45, aging ON, three rules including a `range` condition and an
    // `age` condition — the widest fixture the mock workspace offers for a populated editor.
    const EDITED = createMockOrganisms()[1];
    const OTHERS = [CONWAYS_CLASSIC, ...createMockOrganisms().filter((o) => o.id !== EDITED.id)];
    const EDIT_LIBRARY = [EDITED, ...OTHERS];

    function mountEdit(
      overrides: Parameters<typeof mountModal>[0] = {},
    ): ReturnType<typeof mountModal> {
      return mountModal({ organism: EDITED, library: EDIT_LIBRARY, ...overrides });
    }

    it('(37) opens fully populated: every field shows the record, the title is unchanged, no outcome line', () => {
      mountEdit();

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAccessibleName('Organism Editor');
      expect(within(dialog).getByRole('textbox', { name: 'Organism Name' })).toHaveValue(
        EDITED.name,
      );
      expect(dialog.querySelector('[data-selected-name]')).toHaveTextContent(
        resolvePaletteColor(EDITED.colorToken).name,
      );
      expect(within(dialog).getByRole('slider', { name: 'Dominance' })).toHaveValue(
        String(EDITED.dominance),
      );
      expect(within(dialog).getByRole('textbox', { name: 'Dominance value' })).toHaveValue(
        String(EDITED.dominance),
      );
      expect(within(dialog).getByRole('switch', { name: 'Aging Degradation' })).toHaveAttribute(
        'aria-checked',
        String(EDITED.agingEnabled),
      );

      const rules = within(dialog).getByRole('region', { name: 'Survival Rules' });
      EDITED.survivalRules.forEach((rule, index) => {
        const card = within(rules).getByRole('group', { name: `Rule ${index + 1}` });
        expect(card).toHaveAttribute('data-rule-id', rule.id);
        expect(within(card).getByRole('textbox', { name: 'Summary' })).toHaveValue(
          rule.payload.summary,
        );
        rule.conditions.forEach((condition, c) => {
          const n = c + 1;
          expect(
            within(card).getByRole('combobox', { name: `Condition ${n} property` }),
          ).toHaveValue(condition.property);
          expect(
            within(card).getByRole('combobox', { name: `Condition ${n} operator` }),
          ).toHaveValue(condition.operator);
          if (Array.isArray(condition.pattern)) {
            expect(
              within(card).getByRole('textbox', { name: `Condition ${n} minimum` }),
            ).toHaveValue(String(condition.pattern[0]));
            expect(
              within(card).getByRole('textbox', { name: `Condition ${n} maximum` }),
            ).toHaveValue(String(condition.pattern[1]));
          } else if (condition.property === 'cellState') {
            expect(
              within(card).getByRole('combobox', { name: `Condition ${n} value` }),
            ).toHaveValue(condition.pattern);
          } else {
            expect(within(card).getByRole('textbox', { name: `Condition ${n} value` })).toHaveValue(
              String(condition.pattern),
            );
          }
        });
      });
      expect(within(rules).getAllByRole('group', { name: /^Rule \d+$/ })).toHaveLength(
        EDITED.survivalRules.length,
      );
      expect(dialog.querySelector('[data-save-outcome]')).toBeNull();
    });

    it('(38) steals no focus on mount — the active element is outside every rule card and row', () => {
      mountEdit();

      const active = document.activeElement;
      expect(active?.closest('[data-rule-id]')).toBeNull();
      expect(active?.closest('[data-condition-row]')).toBeNull();
    });

    it('(39) Save with NO edits writes the opened record byte for byte, adds no organism, and hands it to onSaved', async () => {
      const organisms = createFakeRepositories({ organisms: EDIT_LIBRARY }).organisms;
      const saveSpy = vi.spyOn(organisms, 'save');
      const onSaved = vi.fn();
      const user = userEvent.setup();
      mountEdit({ organisms, onSaved });
      const before = (await organisms.list()).length;

      await user.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
      expect(saveSpy.mock.calls[0]?.[0]).toEqual(EDITED);
      expect((await organisms.list()).length).toBe(before);
      expect(onSaved).toHaveBeenCalledTimes(1);
      expect(onSaved).toHaveBeenCalledWith(EDITED);
    });

    it('(40) rename + Save upserts the SAME id — no new organism — and a second Save in the session does too', async () => {
      const organisms = createFakeRepositories({ organisms: EDIT_LIBRARY }).organisms;
      const saveSpy = vi.spyOn(organisms, 'save');
      const user = userEvent.setup();
      mountEdit({ organisms });
      const before = (await organisms.list()).length;

      const name = screen.getByRole('textbox', { name: 'Organism Name' });
      await user.clear(name);
      await user.type(name, 'Patient Defender v2');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));

      const first = saveSpy.mock.calls[0]?.[0] as Organism;
      expect(first.id).toBe(EDITED.id);
      expect(first.name).toBe('Patient Defender v2');
      expect(first.schemaVersion).toBe(ORGANISM_SCHEMA_VERSION);
      const listed = await organisms.list();
      expect(listed.length).toBe(before);
      expect(listed.find((o) => o.id === EDITED.id)?.name).toBe('Patient Defender v2');

      await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
      await user.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(2));
      expect((saveSpy.mock.calls[1]?.[0] as Organism).id).toBe(EDITED.id);
      expect((await organisms.list()).length).toBe(before);
    });

    it("(41) never warns about its own colour: silent on open, silent on a re-pick of its own token, and warns with only the OTHER holder's name", async () => {
      const user = userEvent.setup();
      // EDITED is the sole holder of `azure` in EDIT_LIBRARY.
      mountEdit();

      const dialog = screen.getByRole('dialog');
      const reuseStatus = () => {
        const el = dialog.querySelector('[data-color-reuse-status]');
        if (el === null) throw new Error('the color-reuse status region is not in the dialog');
        return el;
      };
      expect(reuseStatus()).toBeEmptyDOMElement();
      const ownName = resolvePaletteColor(EDITED.colorToken).name;
      const unusedToken = PALETTE.find(
        (entry) => !EDIT_LIBRARY.some((o) => o.colorToken === entry.id),
      );
      if (unusedToken === undefined) throw new Error('no unused palette token');

      // The picker collapses after every pick (Story 4.8), so it is re-opened before each one.
      await user.click(within(dialog).getByRole('button', { name: 'Change Color' }));
      await user.click(within(dialog).getByRole('radio', { name: unusedToken.name }));
      expect(reuseStatus()).toBeEmptyDOMElement();
      await user.click(within(dialog).getByRole('button', { name: 'Change Color' }));
      await user.click(within(dialog).getByRole('radio', { name: ownName }));
      expect(reuseStatus()).toBeEmptyDOMElement();
      // Positive control in the same block: a token another organism holds DOES warn.
      const conwaysName = resolvePaletteColor(CONWAYS_CLASSIC.colorToken).name;
      await user.click(within(dialog).getByRole('button', { name: 'Change Color' }));
      await user.click(within(dialog).getByRole('radio', { name: conwaysName }));
      expect(reuseStatus()).toHaveTextContent(`${CONWAYS_CLASSIC.name} already uses this color.`);
    });

    // The direct measurement of `others` excluding self (`deferred-work.md:1443-1445`'s exact
    // failure): the seed swatch's in-use dot reflects OTHER holders only. Re-picking the seed token
    // stays silent even when shared — the Story 4.9 FD2 rule ("the token the draft opened on never
    // warns") is a token comparison, and the record's token IS the seed.
    it("(41b) the seed swatch is dotted only when ANOTHER organism holds EDITED's token, and re-picking it is silent either way", async () => {
      const user = userEvent.setup();
      const seedSwatch = (dialog: HTMLElement) =>
        dialog.querySelector(`[data-color-token="${EDITED.colorToken}"]`);
      const reuseStatus = (dialog: HTMLElement) => {
        const el = dialog.querySelector('[data-color-reuse-status]');
        if (el === null) throw new Error('the color-reuse status region is not in the dialog');
        return el;
      };
      const unusedToken = PALETTE.find(
        (entry) => entry.id !== EDITED.colorToken && !OTHERS.some((o) => o.colorToken === entry.id),
      );
      if (unusedToken === undefined) throw new Error('no unused palette token');

      // Sole holder: not dotted.
      const sole = mountEdit();
      let dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Change Color' }));
      expect(seedSwatch(dialog)).toHaveAttribute('data-in-use', 'false');
      sole.unmount();

      // A twin holds the same token: dotted, because of the TWIN — and still silent on re-pick.
      const twin = { ...CONWAYS_CLASSIC, id: 'twin', name: 'Twin', colorToken: EDITED.colorToken };
      mountEdit({ library: [EDITED, twin, ...OTHERS] });
      dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Change Color' }));
      expect(seedSwatch(dialog)).toHaveAttribute('data-in-use', 'true');
      await user.click(within(dialog).getByRole('radio', { name: unusedToken.name }));
      expect(reuseStatus(dialog)).toBeEmptyDOMElement();
      await user.click(within(dialog).getByRole('button', { name: 'Change Color' }));
      await user.click(
        within(dialog).getByRole('radio', { name: resolvePaletteColor(EDITED.colorToken).name }),
      );
      expect(reuseStatus(dialog)).toBeEmptyDOMElement();
    });

    it('(42) the organism-type dropdown lists every OTHER organism and never the one under edit', async () => {
      const user = userEvent.setup();
      mountEdit();

      const dialog = screen.getByRole('dialog');
      const rules = within(dialog).getByRole('region', { name: 'Survival Rules' });
      const rule1 = within(rules).getByRole('group', { name: 'Rule 1' });
      await user.selectOptions(
        within(rule1).getByRole('combobox', { name: 'Condition 1 property' }),
        'organismType',
      );

      const value = within(rule1).getByRole('combobox', { name: 'Condition 1 value' });
      const optionValues = within(value)
        .getAllByRole('option')
        .map((option) => (option as HTMLOptionElement).value);
      expect(optionValues).toEqual(OTHERS.map((o) => o.id));
      expect(optionValues).not.toContain(EDITED.id);
      expect(within(value).queryByRole('option', { name: EDITED.name })).toBeNull();
    });

    it('(43) a seeded self-reference renders as `Unknown organism` and is NOT refused at Save', async () => {
      const selfRef: Organism = {
        ...EDITED,
        survivalRules: [
          {
            ...EDITED.survivalRules[0],
            conditions: [
              { property: 'cellState', operator: 'eq', pattern: 'occupied' },
              { property: 'organismType', operator: 'eq', pattern: EDITED.id },
            ],
          },
        ],
      };
      const organisms = createFakeRepositories({ organisms: [selfRef, ...OTHERS] }).organisms;
      const saveSpy = vi.spyOn(organisms, 'save');
      const user = userEvent.setup();
      mountModal({ organism: selfRef, library: [selfRef, ...OTHERS], organisms });

      const dialog = screen.getByRole('dialog');
      const rule1 = within(dialog).getByRole('group', { name: 'Rule 1' });
      const value = within(rule1).getByRole('combobox', { name: 'Condition 2 value' });
      expect(value).toHaveValue(EDITED.id);
      expect(
        (within(value).getByRole('option', { selected: true }) as HTMLOptionElement).textContent,
      ).toBe('Unknown organism');

      await user.click(within(dialog).getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
      expect(within(dialog).queryByRole('alert')).toBeNull();
    });

    it('(44) editing the sole organism: the Organism Type property option is disabled, the other four enabled', async () => {
      const user = userEvent.setup();
      mountModal({ organism: CONWAYS_CLASSIC, library: [CONWAYS_CLASSIC] });

      const dialog = screen.getByRole('dialog');
      const rules = within(dialog).getByRole('region', { name: 'Survival Rules' });
      await user.click(headerAddButton(rules));
      const added = within(rules).getByRole('group', {
        name: `Rule ${CONWAYS_CLASSIC.survivalRules.length + 1}`,
      });
      await user.click(within(added).getByRole('button', { name: '+ Add Condition' }));

      const property = within(added).getByRole('combobox', { name: 'Condition 1 property' });
      const options = within(property).getAllByRole('option') as HTMLOptionElement[];
      expect(options).toHaveLength(5);
      for (const option of options) {
        if (option.value === 'organismType') expect(option).toBeDisabled();
        else expect(option).toBeEnabled();
      }
    });

    it('(45) a refused Save focuses the control of a seeded rule whose id holds a quote and a backslash (CSS.escape end to end)', async () => {
      const awkward: Organism = {
        ...EDITED,
        survivalRules: [
          {
            ...EDITED.survivalRules[2],
            id: 'r"1\\',
            conditions: [{ property: 'age', operator: 'eq', pattern: 3 }],
          },
        ],
      };
      const user = userEvent.setup();
      mountModal({ organism: awkward, library: [awkward, ...OTHERS] });

      const dialog = screen.getByRole('dialog');
      const rule1 = within(dialog).getByRole('group', { name: 'Rule 1' });
      expect(rule1).toHaveAttribute('data-rule-id', 'r"1\\');
      const value = within(rule1).getByRole('textbox', { name: 'Condition 1 value' });
      expect(value).toHaveValue('3');
      await user.clear(value);
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      expect(document.activeElement).toBe(value);
    });

    it('(46) has no axe violations on the seeded editor', async () => {
      mountEdit();

      expect((await axe(document.body)).violations).toEqual([]);
    });

    /**
     * Story 4.20 — the footer (FR-1.7). The derivations are asserted THROUGH the modal because the
     * modal is what owns them (FD11): `<UsageIndicator>`'s own test pins the presentation against
     * literals, and these pin that the right numbers and names reach it.
     */
    describe('the usage footer (Story 4.20)', () => {
      // EDITED is placed by two battles, one of them with an unusable name (FD10) — so the panel
      // proves `battleDisplayName` is on the path, not just that two names render.
      const PLACED: BattleSummaries = [
        { id: 'b1', name: 'Glider Wars', organismIds: [EDITED.id] },
        { id: 'b2', name: '', organismIds: [CONWAYS_CLASSIC.id, EDITED.id] },
      ];

      /** `source`, rewritten so each of `ruleIds` is one rule targeting `targetId` — the Decision E
       * shape: an `organismType` condition whose `pattern` is the target's stable library id. */
      function targeting(source: Organism, targetId: string, ruleIds: readonly string[]): Organism {
        return {
          ...source,
          survivalRules: ruleIds.map((id) => ({
            ...source.survivalRules[0],
            id,
            conditions: [
              { property: 'cellState', operator: 'eq', pattern: 'occupied' },
              { property: 'organismType', operator: 'eq', pattern: targetId },
            ],
          })),
        };
      }

      const usageFooter = () => screen.getByRole('contentinfo');

      it('(47) create mode: "Used in 0 Battles" as plain text, and no rules label (AC8)', () => {
        // A `null` subject is 0/0 with no special case — and the battle list is not even empty
        // here, so the zero is the derivation's answer rather than an absent input.
        mountModal({ battleSummaries: PLACED });

        const footer = usageFooter();
        expect(within(footer).getByText('Used in 0 Battles')).toBeInTheDocument();
        expect(within(footer).queryByRole('button')).toBeNull();
        expect(within(footer).queryByText(/Targeted by/)).toBeNull();
      });

      it('(48) an edit session on a placed organism counts and names its battles (AC5, AC7)', async () => {
        const user = userEvent.setup();
        mountEdit({ battleSummaries: PLACED });

        const trigger = within(usageFooter()).getByRole('button', { name: 'Used in 2 Battles' });
        await user.click(trigger);

        const panel = document.querySelector('[data-usage-battles-panel]') as HTMLElement;
        expect(
          within(panel)
            .getAllByRole('listitem')
            .map((li) => li.textContent),
        ).toEqual(['Glider Wars', 'Untitled Battle']);
      });

      it('(49) M === 0 renders neither the rules label nor a panel (AC2)', () => {
        // EDIT_LIBRARY's rules name no organism at all, so nothing targets EDITED.
        mountEdit({ battleSummaries: PLACED });

        expect(within(usageFooter()).queryByText(/Targeted by/)).toBeNull();
        expect(document.querySelector('[data-usage-rules]')).toBeNull();
      });

      it('(50) M counts RULES while the panel lists ORGANISMS (AC5, FD13)', async () => {
        // ONE organism, TWO rules, both targeting EDITED: M = 2 with a single name.
        const referencing = targeting(createMockOrganisms()[0], EDITED.id, ['rule-a', 'rule-b']);
        const user = userEvent.setup();
        mountEdit({
          library: [EDITED, CONWAYS_CLASSIC, referencing],
          battleSummaries: PLACED,
        });

        const trigger = within(usageFooter()).getByRole('button', {
          name: 'Targeted by 2 organism rules',
        });
        await user.click(trigger);

        const panel = document.querySelector('[data-usage-rules-panel]') as HTMLElement;
        expect(
          within(panel)
            .getAllByRole('listitem')
            .map((li) => li.textContent),
        ).toEqual([referencing.name]);
      });

      it('(51) a self-reference is not listed and does not count (FD14)', () => {
        const selfRef = targeting(EDITED, EDITED.id, ['rule-self']);
        mountEdit({ organism: selfRef, library: [selfRef, ...OTHERS], battleSummaries: PLACED });

        expect(within(usageFooter()).queryByText(/Targeted by/)).toBeNull();
      });

      it('(52) ⚠️ Escape closes the panel and leaves the EDITOR open; a second Escape closes it (AC4, FD4)', async () => {
        const user = userEvent.setup();
        const { onClose } = mountEdit({ battleSummaries: PLACED });

        await user.click(within(usageFooter()).getByRole('button', { name: 'Used in 2 Battles' }));
        await user.keyboard('{Escape}');

        // The panel is gone and the editor is untouched — without `stopPropagation` the keydown
        // reaches MUI's Modal root and takes the whole draft with it.
        expect(document.querySelector('[data-usage-battles-panel]')).toBeNull();
        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByRole('dialog')).toBeInTheDocument();

        await user.keyboard('{Escape}');

        expect(onClose).toHaveBeenCalledTimes(1);
      });

      it('(53) has no axe violations with a panel open', async () => {
        const referencing = targeting(createMockOrganisms()[0], EDITED.id, ['rule-a']);
        const user = userEvent.setup();
        mountEdit({
          library: [EDITED, CONWAYS_CLASSIC, referencing],
          battleSummaries: PLACED,
        });

        await user.click(within(usageFooter()).getByRole('button', { name: 'Used in 2 Battles' }));

        expect((await axe(document.body)).violations).toEqual([]);
      });

      // Review (2026-09-23): FD4's second reachable path, against MUI's REAL root handler. A click
      // inside the panel is allowed and keeps it open, and it takes focus off the trigger — since
      // decision D2 onto the name list's scroll region (`tabIndex={0}`), which is still INSIDE the
      // footer, so that click alone no longer proves anything a footer-scoped handler would miss.
      // The path that does is focus LEAVING the footer with the panel open (Tab-away, accepted by
      // D1): moved programmatically here, because a pointerdown on the field would close the
      // panel. With a footer-scoped handler the Escape closed the editor; the document-capture
      // listener keeps it open and puts focus back on the trigger.
      it('(54) ⚠️ Escape with the panel open and focus outside the footer still closes the panel, not the editor, and refocuses the trigger (AC4, FD4)', async () => {
        const user = userEvent.setup();
        const { onClose } = mountEdit({ battleSummaries: PLACED });

        const trigger = within(usageFooter()).getByRole('button', { name: 'Used in 2 Battles' });
        await user.click(trigger);
        await user.click(screen.getByText('Glider Wars'));
        expect(trigger).not.toHaveFocus();
        const panel = document.querySelector('[data-usage-battles-panel]') as HTMLElement;
        expect(within(panel).getByRole('list')).toHaveFocus();

        const nameField = screen.getByRole('textbox', { name: 'Organism Name' });
        nameField.focus();
        expect(nameField).toHaveFocus();
        expect(document.querySelector('[data-usage-battles-panel]')).not.toBeNull();

        await user.keyboard('{Escape}');

        expect(document.querySelector('[data-usage-battles-panel]')).toBeNull();
        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(trigger).toHaveFocus();
      });

      // Owner's decision on review item D5 (2026-09-24): one press closes ONE layer. A held Escape
      // used to close the panel and then the editor, because the panel's capture listener is gone
      // by the time the OS auto-repeat arrives — destructive today, since the editor has no dirty
      // guard until Story 4.23.
      //
      // ⚠️ The middle event is SYNTHETIC, standing in for a real auto-repeat: neither
      // `user.keyboard` nor Playwright's `page.keyboard.press` ever sets `repeat`, so no ordinary
      // test can drive the OS's second keydown ~250–500 ms into a hold. This is therefore NOT a
      // user-path assertion — it pins exactly one thing, that a keydown carrying `repeat` does not
      // reach MUI's root handler. It is dispatched on the focused trigger rather than on
      // `document`, because React 19 delegates to the root CONTAINER: an event dispatched at
      // `document` never reaches MUI's `onKeyDown` at all, so the test would pass with the guard
      // deleted. `{Escape>}` presses and holds (no keyup); `{/Escape}` releases.
      it('(56) ⚠️ a held Escape closes the panel and stops there; a deliberate second press closes the editor (D5)', async () => {
        const user = userEvent.setup();
        const { onClose } = mountEdit({ battleSummaries: PLACED });

        const trigger = within(usageFooter()).getByRole('button', { name: 'Used in 2 Battles' });
        await user.click(trigger);
        await user.keyboard('{Escape>}');

        expect(document.querySelector('[data-usage-battles-panel]')).toBeNull();
        expect(onClose).not.toHaveBeenCalled();
        expect(trigger).toHaveFocus();

        fireEvent.keyDown(trigger, { key: 'Escape', repeat: true });

        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByRole('dialog')).toBeInTheDocument();

        await user.keyboard('{/Escape}');
        await user.keyboard('{Escape}');

        expect(onClose).toHaveBeenCalledTimes(1);
      });

      it('(55) the footer is reachable by Tab after the three columns (AC4)', async () => {
        const user = userEvent.setup();
        mountEdit({ battleSummaries: PLACED });

        const footer = usageFooter();
        const body = footer.previousElementSibling as HTMLElement;
        const focusable = Array.from(
          body.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => !el.hasAttribute('disabled'));
        expect(focusable.length).toBeGreaterThan(0);

        focusable[focusable.length - 1].focus();
        await user.tab();

        expect(within(footer).getByRole('button', { name: 'Used in 2 Battles' })).toHaveFocus();
      });
    });
  });
});

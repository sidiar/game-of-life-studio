import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { MAX_ORGANISM_NAME_LENGTH, NEW_ORGANISM_DOMINANCE } from '@gol/domain';
import { CONWAYS_CLASSIC, createMockOrganisms } from '@gol/test-utils';
import { defaultColorToken } from '@/lib/palette/defaultColorToken';
import { displayColor, MAX_AGE_SHADE } from '@/lib/palette/displayColor';
import { PALETTE, resolvePaletteColor } from '@/lib/palette/paletteRegistry';
import OrganismEditorModal, { backLabelFor } from './OrganismEditorModal';

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

describe('OrganismEditorModal', () => {
  it('renders a dialog whose accessible name is the level-2 "Organism Editor" heading', () => {
    render(<OrganismEditorModal open origin="library" onClose={vi.fn()} library={LIBRARY} />);

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
    render(<OrganismEditorModal open origin={origin} onClose={vi.fn()} library={LIBRARY} />);

    // Exact accessible name: the `←` glyph is aria-hidden and must not leak into it.
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    expect(backLabelFor(origin)).toBe(label);
  });

  it('renders Save as a genuinely disabled button and a Close button', () => {
    render(<OrganismEditorModal open origin="library" onClose={vi.fn()} library={LIBRARY} />);

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('routes Back to onClose exactly once', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<OrganismEditorModal open origin="library" onClose={onClose} library={LIBRARY} />);

    await user.click(screen.getByRole('button', { name: 'Back to Library' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('routes Close to onClose exactly once', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<OrganismEditorModal open origin="library" onClose={onClose} library={LIBRARY} />);

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('routes Escape to onClose exactly once', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<OrganismEditorModal open origin="library" onClose={onClose} library={LIBRARY} />);

    // MUI's key handler listens on the focused element inside the dialog; the focus trap has
    // already put focus on the dialog container, which is enough.
    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // FD4: disabled, not a no-op handler — so there is nothing to spy on. What CAN be asserted is
  // that activating it neither closes the dialog nor errors. `fireEvent`, not `user.click`:
  // user-event REFUSES to click a `pointer-events: none` element (MUI's disabled Button is one),
  // which already proves a real pointer cannot reach it — the raw dispatch below covers the one
  // path that bypasses pointer-events, a synthetic click at the node.
  it('does nothing when Save is activated', () => {
    const onClose = vi.fn();
    render(<OrganismEditorModal open origin="library" onClose={onClose} library={LIBRARY} />);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  // Story 4.4: the body is `<OrganismEditorLayout>`. Its own contract is that component's test;
  // what the shell owes is that the three regions are INSIDE the dialog, in order. The axe test
  // below now scans the columns for free.
  it('renders the three editor columns inside the dialog, in order', () => {
    render(<OrganismEditorModal open origin="library" onClose={vi.fn()} library={LIBRARY} />);

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
    render(<OrganismEditorModal open origin="library" onClose={vi.fn()} library={LIBRARY} />);

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
    expect(within(dialog).getAllByRole('slider')).toHaveLength(1);
    expect(within(dialog).getAllByRole('switch')).toHaveLength(1);
    expect(within(dialog).queryAllByRole('radio')).toHaveLength(0);
    await user.click(within(basic).getByRole('button', { name: 'Change Color' }));
    expect(within(basic).getByRole('radiogroup', { name: 'Organism Color' })).toBeInTheDocument();
    expect(within(dialog).getAllByRole('radio')).toHaveLength(PALETTE.length);
  });

  // Story 4.7 AC3: a fresh editor opens with the switch unchecked and "Off" showing.
  it('opens the aging toggle unchecked, showing "Off" (Story 4.7)', () => {
    render(<OrganismEditorModal open origin="library" onClose={vi.fn()} library={LIBRARY} />);

    expect(screen.getByRole('switch', { name: 'Aging Degradation' })).not.toBeChecked();
    expect(screen.getByText('Off')).toBeInTheDocument();
  });

  // A click round-trips through the modal's own state, the same draft the sibling fields prove
  // above — and moves the example strip, which only re-renders from a real draft update.
  it('holds the draft: an aging toggle click round-trips through the modal (Story 4.7)', async () => {
    const user = userEvent.setup();
    render(<OrganismEditorModal open origin="library" onClose={vi.fn()} library={LIBRARY} />);

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
    render(<OrganismEditorModal open origin="library" onClose={vi.fn()} library={LIBRARY} />);

    const input = screen.getByRole('textbox', { name: 'Organism Name' });
    await user.type(input, 'Glider');

    expect(input).toHaveValue('Glider');
    expect(screen.getByText(`6 / ${MAX_ORGANISM_NAME_LENGTH}`)).toBeInTheDocument();
  });

  // FD2: a fresh editor does not open red.
  it('opens with the name field free of any error (Story 4.5)', () => {
    render(<OrganismEditorModal open origin="library" onClose={vi.fn()} library={LIBRARY} />);

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Organism Name' })).not.toBeInvalid();
  });

  // Story 4.8 AC3 / FD8: the seed is the M6 derivation over the library the editor was opened
  // over, not a stopgap. With LIBRARY's four tokens (sky-blue, vermillion, azure, bluish-green),
  // that is PALETTE[3] — a value the deleted 4.7 seed stopgap (DEFAULT_COLOR_TOKEN) could not
  // produce, so this test would have gone red against it.
  it('opens the colour picker on the M6 default derived from `library` (Story 4.8)', async () => {
    const user = userEvent.setup();
    render(<OrganismEditorModal open origin="library" onClose={vi.fn()} library={LIBRARY} />);

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
    render(<OrganismEditorModal open origin="library" onClose={vi.fn()} library={LIBRARY} />);

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
  // the strip and chip still agree (the 4.8 round-trip assertion, reused), and nothing about Save
  // moves.
  it('warns through the modal on a colliding pick (Story 4.9)', async () => {
    const user = userEvent.setup();
    render(<OrganismEditorModal open origin="library" onClose={vi.fn()} library={LIBRARY} />);

    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Change Color' }));
    // Conway's Classic's own token (`sky-blue`, PALETTE[0]) — a deliberate collision.
    const conwaysColorName = resolvePaletteColor(CONWAYS_CLASSIC.colorToken).name;
    await user.click(within(dialog).getByRole('radio', { name: conwaysColorName }));

    expect(within(dialog).getByRole('status')).toHaveTextContent(
      `${CONWAYS_CLASSIC.name} already uses this color.`,
    );
    const selectedName = dialog.querySelector('[data-selected-name]');
    expect(selectedName).toHaveTextContent(conwaysColorName);
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Change Color' }));
    expect(within(dialog).getAllByRole('radio')).toHaveLength(PALETTE.length);
  });

  // Story 4.9: the M6 default is silent on open, even though it is derived from `library` — the
  // 4.8 "opens on the M6 default" test grows this one assertion rather than a new test.
  it('the M6 default is silent at open (Story 4.9)', () => {
    render(<OrganismEditorModal open origin="library" onClose={vi.fn()} library={LIBRARY} />);

    expect(within(screen.getByRole('dialog')).getByRole('status')).toHaveTextContent('');
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
    render(<OrganismEditorModal open origin="library" onClose={vi.fn()} library={fullLibrary} />);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('status')).toHaveTextContent('');
    expect(dialog.querySelector('[data-selected-name]')).toHaveTextContent(PALETTE[1].name);

    await user.click(within(dialog).getByRole('button', { name: 'Change Color' }));
    await user.click(within(dialog).getByRole('radio', { name: PALETTE[0].name }));

    expect(within(dialog).getByRole('status')).toHaveTextContent(
      `${fullLibrary[0].name} and Extra Sky already use this color.`,
    );
  });

  // Story 4.6 AC3: a fresh editor opens with both dominance controls at the domain default.
  it('opens the dominance control at NEW_ORGANISM_DOMINANCE on both the slider and the textbox (Story 4.6)', () => {
    render(<OrganismEditorModal open origin="library" onClose={vi.fn()} library={LIBRARY} />);

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
    render(<OrganismEditorModal open origin="library" onClose={vi.fn()} library={LIBRARY} />);

    fireEvent.change(screen.getByRole('slider', { name: 'Dominance' }), {
      target: { value: '42' },
    });

    expect(screen.getByRole('textbox', { name: 'Dominance value' })).toHaveValue('42');
    expect(screen.getByRole('slider', { name: 'Dominance' })).toHaveValue('42');
  });

  // And the other direction: typing into the dominance textbox moves the slider live.
  it('holds the draft: typing into the dominance textbox moves the slider (Story 4.6)', async () => {
    const user = userEvent.setup();
    render(<OrganismEditorModal open origin="library" onClose={vi.fn()} library={LIBRARY} />);

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
    render(<OrganismEditorModal open origin="library" onClose={vi.fn()} library={LIBRARY} />);

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
      <OrganismEditorModal open={false} origin="library" onClose={vi.fn()} library={LIBRARY} />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('has no axe violations with the dialog open', async () => {
    render(<OrganismEditorModal open origin="library" onClose={vi.fn()} library={LIBRARY} />);

    // `document.body`, not the render container: the dialog is portalled, and the scan must see
    // the aria-hidden siblings MUI leaves behind alongside it.
    const results = await axe(document.body);
    expect(results.violations).toEqual([]);
  });
});

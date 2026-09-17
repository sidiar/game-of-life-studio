import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { createMockOrganisms } from '@gol/test-utils';
import type { PopulationEntry } from '@/lib/battle/useSimulation';
import FullscreenStage, { type FullscreenStageProps } from './FullscreenStage';

const [aggressive, patient, chaotic] = createMockOrganisms();

function entry(overrides: Partial<PopulationEntry>): PopulationEntry {
  return {
    organismId: aggressive.id,
    name: aggressive.name,
    colorToken: aggressive.colorToken,
    count: 0,
    pct: 0,
    extinct: false,
    ...overrides,
  };
}

const POPULATION: readonly PopulationEntry[] = [
  entry({ count: 127, pct: 60 }),
  entry({
    organismId: patient.id,
    name: patient.name,
    colorToken: patient.colorToken,
    count: 89,
    pct: 40,
  }),
  entry({
    organismId: chaotic.id,
    name: chaotic.name,
    colorToken: chaotic.colorToken,
    extinct: true,
  }),
];

function stage(overrides: Partial<FullscreenStageProps> = {}) {
  return (
    <FullscreenStage
      active
      battleTitle="Three-Way Skirmish"
      onExit={vi.fn()}
      hud={{ cycle: 42, population: POPULATION, genPerSec: 10 }}
      transport={{ status: 'paused', onPlayPause: vi.fn(), onStep: vi.fn(), onStop: vi.fn() }}
      {...overrides}
    >
      <div data-testid="dish">the dish</div>
    </FullscreenStage>
  );
}

/** The HUD's Cycle group: the `Cycle` label's sibling value element (the `0042` glyph run). */
function cycleValue(): HTMLElement {
  const value = screen.getByText('Cycle').nextElementSibling;
  if (!(value instanceof HTMLElement)) throw new Error('the Cycle value is not rendered');
  return value;
}

describe('FullscreenStage (Story 3.18)', () => {
  // FD2 (a): the component is MOUNTED in both states and renders its chrome only while active —
  // `children` sits at the same fragment slot either way, so the dish's ancestor chain never
  // changes type (AC4). Inactive = the children and nothing else.
  it('renders only its children while inactive: no heading, no buttons', () => {
    render(stage({ active: false }));

    expect(screen.getByTestId('dish')).toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  // AC3: the top overlay — ONE `<h1>` whose accessible name is EXACTLY the title (the badge is a
  // sibling, trap 9), the `Run` badge beside it, and the Exit button calling `onExit` once.
  it('renders the title as the single h1 with the Run badge OUTSIDE it, and Exit fullscreen calls onExit once', async () => {
    const user = userEvent.setup();
    const onExit = vi.fn();
    render(stage({ onExit }));

    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveAccessibleName('Three-Way Skirmish');
    expect(headings[0]).toHaveTextContent(/^Three-Way Skirmish$/);
    const badge = screen.getByText('Run');
    expect(headings[0]).not.toContainElement(badge);
    expect(screen.getByTestId('dish')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Exit fullscreen' }));

    expect(onExit).toHaveBeenCalledTimes(1);
  });

  // The title is `battleTitle` as GIVEN (trap 22): `<BattlePage>` applies `battleDisplayName`
  // once; the stage never re-applies a fallback.
  it('renders the title verbatim', () => {
    render(stage({ battleTitle: 'Untitled Battle' }));

    expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleName('Untitled Battle');
  });

  // AC7: the Exit button takes focus on mount — the element that had focus (the header's
  // Fullscreen button) has just unmounted, and focus would otherwise fall to `<body>`.
  it('focuses Exit fullscreen on mount', () => {
    render(stage());

    expect(screen.getByRole('button', { name: 'Exit fullscreen' })).toHaveFocus();
  });

  // FD8 / 3.14 FD6 through `<CycleDigits>`: the padding is an `aria-hidden` span, the digits are
  // plain text — `0042` reads as `42`.
  it('renders the cycle through CycleDigits: hidden zero-padding, the digits as text', () => {
    render(stage());

    const value = cycleValue();
    expect(value).toHaveTextContent(/^0042$/);
    const padding = value.querySelector('span');
    expect(padding).toHaveAttribute('aria-hidden', 'true');
    expect(padding).toHaveTextContent(/^00$/);
    expect(value.lastChild?.nodeType).toBe(Node.TEXT_NODE);
    expect(value.lastChild?.textContent).toBe('42');
  });

  it('renders no padding once the cycle fills four digits', () => {
    render(stage({ hud: { cycle: 12345, population: POPULATION, genPerSec: 10 } }));

    expect(cycleValue()).toHaveTextContent(/^12345$/);
    expect(cycleValue().querySelector('span')).toBeNull();
  });

  // FD6: Speed is a READ-OUT, never a slider — `${genPerSec} gen/s`.
  it('renders the speed as a `gen/s` read-out and no slider', () => {
    const { rerender } = render(stage());

    expect(screen.getByText('Speed').nextElementSibling).toHaveTextContent(/^10 gen\/s$/);
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();

    rerender(stage({ hud: { cycle: 42, population: POPULATION, genPerSec: 20 } }));
    expect(screen.getByText('Speed').nextElementSibling).toHaveTextContent(/^20 gen\/s$/);
  });

  // FD7: the transport is `<TransportControls>` — the SAME three names as the bottom bar, the
  // real `disabled` on Step while playing, Play ↔ Pause by status.
  it('renders the shared transport cluster with the bar’s names, Next cycle disabled while playing', () => {
    const transport = {
      status: 'paused' as const,
      onPlayPause: vi.fn(),
      onStep: vi.fn(),
      onStop: vi.fn(),
    };
    const { rerender } = render(stage({ transport }));

    const group = screen.getByRole('group', { name: 'Simulation controls' });
    expect(
      within(group)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['▶Play', '⏭Next cycle', '⏹Stop & reset']);
    expect(within(group).getByRole('button', { name: 'Next cycle' })).toBeEnabled();

    rerender(stage({ transport: { ...transport, status: 'playing' } }));

    expect(within(group).getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(within(group).queryByRole('button', { name: 'Play' })).not.toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'Next cycle' })).toBeDisabled();
  });

  it('forwards each transport press to its handler', async () => {
    const user = userEvent.setup();
    const transport = {
      status: 'paused' as const,
      onPlayPause: vi.fn(),
      onStep: vi.fn(),
      onStop: vi.fn(),
    };
    render(stage({ transport }));

    await user.click(screen.getByRole('button', { name: 'Play' }));
    await user.click(screen.getByRole('button', { name: 'Next cycle' }));
    await user.click(screen.getByRole('button', { name: 'Stop & reset' }));

    expect(transport.onPlayPause).toHaveBeenCalledTimes(1);
    expect(transport.onStep).toHaveBeenCalledTimes(1);
    expect(transport.onStop).toHaveBeenCalledTimes(1);
  });

  // AC8: the pills, in the hook's order, the extinct one skulled; an empty roster renders no
  // list (the Population group is omitted, not rendered empty).
  it('renders the population pills in order, and no list for an empty roster', () => {
    const { rerender } = render(stage());

    const list = screen.getByRole('list', { name: 'Population' });
    const pills = within(list).getAllByRole('listitem');
    expect(pills.map((pill) => pill.textContent)).toEqual([
      'Aggressive Colonizer 127',
      'Patient Defender 89',
      'Chaotic Spreader 0☠',
    ]);
    expect(within(pills[2]).getByRole('img', { name: 'extinct' })).toBeInTheDocument();

    rerender(stage({ hud: { cycle: 42, population: [], genPerSec: 10 } }));
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  // AC7, trap 12: Tab order is DOM order — Exit (overlay) → Play → Next cycle → Stop & reset
  // (HUD), and nothing else is focusable in the stage.
  it('tabs Exit fullscreen → Play → Next cycle → Stop & reset, and nothing else', async () => {
    const user = userEvent.setup();
    render(stage());

    expect(screen.getByRole('button', { name: 'Exit fullscreen' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Play' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Next cycle' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Stop & reset' })).toHaveFocus();
    await user.tab();
    expect(document.body).toHaveFocus();
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });

  it('has no axe violations active and inactive', async () => {
    const { container, rerender } = render(stage());
    expect((await axe(container)).violations).toEqual([]);

    rerender(
      stage({
        transport: { status: 'playing', onPlayPause: vi.fn(), onStep: vi.fn(), onStop: vi.fn() },
      }),
    );
    expect((await axe(container)).violations).toEqual([]);

    rerender(stage({ active: false }));
    expect((await axe(container)).violations).toEqual([]);
  });
});

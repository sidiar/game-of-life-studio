import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import BattleHeader from './BattleHeader';

describe('BattleHeader', () => {
  it("renders the battle title as the route's level-1 heading", () => {
    render(<BattleHeader battleTitle="Three-Way Skirmish" />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Three-Way Skirmish' }),
    ).toBeInTheDocument();
  });

  // The title is a DISPLAY, not a field — <BattleNameField> (Story 2.11) owns editing, and a
  // textbox here would give the route two competing rename surfaces.
  it('renders the title as text, not an editable field', () => {
    render(<BattleHeader battleTitle="Three-Way Skirmish" />);

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  // NFR-4.1, as a COUNT. Story 2.1 asserted ZERO controls even with the Epic 3 props supplied —
  // a rendered-but-inert toggle being the one thing NFR-4.1 forbids. Story 3.11 gives the toggle
  // its consumer, so the count flips to exactly TWO buttons: a third (fullscreen, Story 3.18)
  // still fails here. `onEnterFullscreen` stays supplied and stays unrendered.
  it('renders exactly two buttons and no links when `mode` + `onModeToggle` are supplied', () => {
    render(
      <BattleHeader
        battleTitle="Three-Way Skirmish"
        mode="lab"
        onModeToggle={vi.fn()}
        onEnterFullscreen={vi.fn()}
      />,
    );

    expect(screen.queryAllByRole('button')).toHaveLength(2);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /fullscreen/i })).toBeNull();
  });

  // The props stay optional (spec §3.2): a header with no mode to show renders no toggle at all,
  // never a toggle with nothing wired behind it.
  it('renders zero controls when `mode` and `onModeToggle` are not supplied', () => {
    render(<BattleHeader battleTitle="Three-Way Skirmish" onEnterFullscreen={vi.fn()} />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByRole('group')).toBeNull();
  });

  it('renders the toggle only when BOTH `mode` and `onModeToggle` are present', () => {
    const { rerender } = render(<BattleHeader battleTitle="T" mode="lab" />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);

    rerender(<BattleHeader battleTitle="T" onModeToggle={vi.fn()} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  describe('the Lab⇄Run toggle (Story 3.11, FR-3.10)', () => {
    it('is a group named "Mode" holding two buttons labelled Lab and Run, sentence case', () => {
      render(<BattleHeader battleTitle="T" mode="lab" onModeToggle={vi.fn()} />);

      const group = screen.getByRole('group', { name: 'Mode' });
      const buttons = within(group).getAllByRole('button');
      expect(buttons.map((button) => button.textContent)).toEqual(['Lab', 'Run']);
      for (const button of buttons) expect(button).toHaveAttribute('type', 'button');
    });

    it('marks the active mode with aria-pressed="true" and the other "false"', () => {
      const { rerender } = render(
        <BattleHeader battleTitle="T" mode="lab" onModeToggle={vi.fn()} />,
      );
      expect(screen.getByRole('button', { name: 'Lab' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'Run' })).toHaveAttribute('aria-pressed', 'false');

      rerender(<BattleHeader battleTitle="T" mode="run" onModeToggle={vi.fn()} />);
      expect(screen.getByRole('button', { name: 'Lab' })).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByRole('button', { name: 'Run' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('calls onModeToggle once with the OTHER mode when the inactive button is pressed', async () => {
      const user = userEvent.setup();
      const onModeToggle = vi.fn();
      render(<BattleHeader battleTitle="T" mode="lab" onModeToggle={onModeToggle} />);

      await user.click(screen.getByRole('button', { name: 'Run' }));

      expect(onModeToggle).toHaveBeenCalledTimes(1);
      expect(onModeToggle).toHaveBeenCalledWith('run');
    });

    it('calls onModeToggle with "lab" from Run mode', async () => {
      const user = userEvent.setup();
      const onModeToggle = vi.fn();
      render(<BattleHeader battleTitle="T" mode="run" onModeToggle={onModeToggle} />);

      await user.click(screen.getByRole('button', { name: 'Lab' }));

      expect(onModeToggle).toHaveBeenCalledWith('lab');
    });

    // The active button is a no-op, never a re-set: `<BattlePage>` would otherwise `setMode` to
    // the mode it is already in, which is a render for nothing.
    it('fires nothing when the already-active button is pressed', async () => {
      const user = userEvent.setup();
      const onModeToggle = vi.fn();
      render(<BattleHeader battleTitle="T" mode="lab" onModeToggle={onModeToggle} />);

      await user.click(screen.getByRole('button', { name: 'Lab' }));

      expect(onModeToggle).not.toHaveBeenCalled();
    });

    // `disabled` reaches RUN only: LAB is always reachable from Run, because a roster that cannot
    // run is a reason not to ENTER Run, never a reason to trap the user there.
    it('disables RUN (with the reason as its title) but never LAB when `disabled`', () => {
      render(
        <BattleHeader
          battleTitle="T"
          mode="lab"
          onModeToggle={vi.fn()}
          disabled
          disabledReason="Some organisms in this battle could not be loaded"
        />,
      );

      const run = screen.getByRole('button', { name: 'Run' });
      expect(run).toBeDisabled();
      expect(run).toHaveAttribute('title', 'Some organisms in this battle could not be loaded');
      expect(screen.getByRole('button', { name: 'Lab' })).toBeEnabled();
    });

    it('keeps LAB enabled while disabled in Run mode, so the user can always leave', () => {
      render(<BattleHeader battleTitle="T" mode="run" onModeToggle={vi.fn()} disabled />);

      expect(screen.getByRole('button', { name: 'Lab' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled();
      // No reason supplied — no `title` attribute at all, never an empty one.
      expect(screen.getByRole('button', { name: 'Run' })).not.toHaveAttribute('title');
    });

    it('has no axe violations in either mode', async () => {
      const { container, rerender } = render(
        <BattleHeader battleTitle="Three-Way Skirmish" mode="lab" onModeToggle={vi.fn()} />,
      );
      expect((await axe(container)).violations).toEqual([]);

      rerender(<BattleHeader battleTitle="Three-Way Skirmish" mode="run" onModeToggle={vi.fn()} />);
      expect((await axe(container)).violations).toEqual([]);
    });
  });
});

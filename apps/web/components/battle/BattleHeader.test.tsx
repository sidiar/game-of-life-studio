import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

  // NFR-4.1, as a COUNT: a presence-only assertion ("no RUN button") still passes once someone
  // adds a dead FULLSCREEN button beside it. The header ships zero controls in Epic 2.
  it('renders no controls at all, even when the Epic 3 props are supplied', () => {
    render(
      <BattleHeader
        battleTitle="Three-Way Skirmish"
        mode="lab"
        onModeToggle={vi.fn()}
        onEnterFullscreen={vi.fn()}
      />,
    );

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});

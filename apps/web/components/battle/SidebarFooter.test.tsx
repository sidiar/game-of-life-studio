import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import SidebarFooter from './SidebarFooter';

describe('SidebarFooter (Story 2.16, AC1 / FR-7.10)', () => {
  it('renders exactly one button, named "Back to Battles"', () => {
    render(<SidebarFooter onBack={vi.fn()} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    // ⚠️ Trap 13/14: the name is EXACT. The decorative "←" must not reach the accessible name,
    // and this control must not drift into "Back to Gallery" — that name belongs to `<Notice>`'s
    // BackLink, whose ABSENCE on `/battle/new` two other tests assert (a LINK, not a button).
    expect(buttons[0]).toHaveAccessibleName('Back to Battles');
    expect(buttons[0]).toHaveAttribute('type', 'button');
  });

  it('renders no heading — it is a footer, not a sidebar section (trap 9)', () => {
    render(<SidebarFooter onBack={vi.fn()} />);

    // The four-heading structure of this column is asserted in `BattleEditorView.test.tsx` and in
    // the e2e; this is the same claim at the unit that could break it.
    expect(screen.queryAllByRole('heading')).toHaveLength(0);
  });

  it('renders the mockup label uppercased by CSS, not by the DOM text (trap 15)', () => {
    render(<SidebarFooter onBack={vi.fn()} />);

    const button = screen.getByRole('button', { name: 'Back to Battles' });
    // The rendered text carries the glyph and sentence case; `text-transform` does the rest, which
    // is what keeps the accessible name readable.
    expect(button).toHaveTextContent('← Back to Battles');
    expect(button).toHaveStyle({ textTransform: 'uppercase' });
  });

  it('calls onBack exactly once per press', async () => {
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(<SidebarFooter onBack={onBack} />);

    await user.click(screen.getByRole('button', { name: 'Back to Battles' }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('is keyboard-operable: Enter on the focused button reaches onBack (AC9)', async () => {
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(<SidebarFooter onBack={onBack} />);

    await user.tab();
    expect(screen.getByRole('button', { name: 'Back to Battles' })).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('blocks the callback while disabled (forced decision 3a — the edit lock)', async () => {
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(<SidebarFooter onBack={onBack} disabled />);

    const button = screen.getByRole('button', { name: 'Back to Battles' });
    expect(button).toBeDisabled();
    await user.click(button);

    expect(onBack).not.toHaveBeenCalled();
  });

  it('has no axe violations', async () => {
    const { container } = render(<SidebarFooter onBack={vi.fn()} />);

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});

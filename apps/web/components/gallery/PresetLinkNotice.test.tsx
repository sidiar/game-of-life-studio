import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import PresetLinkNotice from './PresetLinkNotice';

describe('PresetLinkNotice', () => {
  it.each(['alert', 'status'] as const)('applies the %s role to the text', (role) => {
    render(<PresetLinkNotice notice={{ role, text: 'Hello there' }} onDismiss={() => {}} />);
    expect(screen.getByRole(role)).toHaveTextContent('Hello there');
  });

  it('Dismiss calls onDismiss', async () => {
    const onDismiss = vi.fn();
    render(<PresetLinkNotice notice={{ role: 'alert', text: 'x' }} onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss message' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <PresetLinkNotice notice={{ role: 'alert', text: 'x' }} onDismiss={() => {}} />,
    );
    expect((await axe(container)).violations).toEqual([]);
  });
});

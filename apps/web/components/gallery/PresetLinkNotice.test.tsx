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

  // jsdom cannot resolve `var(--gol-*)` in a computed border, so the proof is the emitted rule: the
  // two tones get different classes, and each class's rule carries its own token.
  it('an alert has a --gol-danger left border, a status a --gol-accent one, and no tone attribute leaks', () => {
    const banner = (role: 'alert' | 'status') =>
      render(<PresetLinkNotice notice={{ role, text: role }} onDismiss={() => {}} />).container
        .firstElementChild as HTMLElement;
    const alertBanner = banner('alert');
    const statusBanner = banner('status');
    const css = Array.from(document.querySelectorAll('style'))
      .map((s) => s.textContent ?? '')
      .join('\n');
    const ruleFor = (el: HTMLElement) => {
      const cls = Array.from(el.classList).find((c) => css.includes(`.${c}{`));
      if (cls === undefined) throw new Error('no emitted rule for the banner');
      return css.slice(css.indexOf(`.${cls}{`)).split('}')[0];
    };
    expect(ruleFor(alertBanner)).toContain('border-left:3px solid var(--gol-danger)');
    expect(ruleFor(statusBanner)).toContain('border-left:3px solid var(--gol-accent)');
    expect(alertBanner).not.toHaveAttribute('tone');
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

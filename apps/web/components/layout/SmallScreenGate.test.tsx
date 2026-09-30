import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SmallScreenGate from './SmallScreenGate';
import { NoticeAnchor } from './Notice';
import { SMALL_SCREEN_QUERY, resetSmallScreenDismissalForTests } from '@/lib/layout/smallScreen';

// jsdom has no layout and no `matchMedia`, and it never matches the panel's `@media` rule, so the
// panel is `display: none` here at every size — its visibility is Playwright's to prove
// (`e2e/smallScreenGate.spec.ts`), and every panel query below passes `hidden: true`. The query is
// stubbed to pin what the SCRIPT side owns: `inert` on the content, the dismissal, and its
// persistence for the tab.
function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === SMALL_SCREEN_QUERY ? matches : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

function renderGate() {
  return render(
    <SmallScreenGate exit={<NoticeAnchor href="/">Back to Battles</NoticeAnchor>}>
      <button type="button">Play</button>
    </SmallScreenGate>,
  );
}

const contentOf = (control: HTMLElement) => control.parentElement as HTMLElement;

describe('SmallScreenGate', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    resetSmallScreenDismissalForTests();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('below the floor, makes the content inert and offers the way out and Continue anyway', () => {
    stubMatchMedia(true);
    renderGate();

    expect(contentOf(screen.getByRole('button', { name: 'Play', hidden: true }))).toHaveAttribute(
      'inert',
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'This screen needs more room', hidden: true }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Battles', hidden: true })).toHaveAttribute(
      'href',
      '/',
    );
    expect(
      screen.getByRole('button', { name: 'Continue anyway', hidden: true }),
    ).toBeInTheDocument();
  });

  it('at or above the floor, leaves the content live (the panel is hidden by CSS alone)', () => {
    stubMatchMedia(false);
    renderGate();

    expect(contentOf(screen.getByRole('button', { name: 'Play' }))).not.toHaveAttribute('inert');
  });

  it('without matchMedia (no viewport to read), reads as not small rather than throwing', () => {
    renderGate();

    expect(contentOf(screen.getByRole('button', { name: 'Play' }))).not.toHaveAttribute('inert');
  });

  it('Continue anyway removes the panel, frees the content, and is remembered for the tab', async () => {
    stubMatchMedia(true);
    const user = userEvent.setup();
    const { unmount } = renderGate();

    await user.click(screen.getByRole('button', { name: 'Continue anyway', hidden: true }));

    expect(
      screen.queryByRole('heading', { name: 'This screen needs more room', hidden: true }),
    ).toBeNull();
    expect(contentOf(screen.getByRole('button', { name: 'Play' }))).not.toHaveAttribute('inert');

    // A second gated surface in the same tab (the editor after the battle route) asks nothing.
    unmount();
    renderGate();
    expect(
      screen.queryByRole('heading', { name: 'This screen needs more room', hidden: true }),
    ).toBeNull();
  });

  it('still honours Continue anyway when sessionStorage throws', async () => {
    stubMatchMedia(true);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const user = userEvent.setup();
    renderGate();

    await user.click(screen.getByRole('button', { name: 'Continue anyway', hidden: true }));

    expect(
      screen.queryByRole('heading', { name: 'This screen needs more room', hidden: true }),
    ).toBeNull();
    vi.restoreAllMocks();
  });
});

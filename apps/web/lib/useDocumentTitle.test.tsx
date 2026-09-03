import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { useDocumentTitle } from './useDocumentTitle';

/**
 * The hook extracted from `<BattlePage>` (2026-09-03). `BattlePage.test.tsx`'s "browser tab title
 * (AC6)" describe still owns the acceptance evidence — the display name, live typing, the
 * not-found branch, restore-on-unmount — and is unchanged by the extraction.
 *
 * What this file adds is the two hazards that had NO direct test at all before it, because neither
 * is reachable through the page's own surface: the bounded-corrections starvation guard (found in
 * review against the built export, where the page never recovered) and the whitespace read-back
 * (found by an e2e that typed a literal space). Both fail by hanging the event loop rather than by
 * rendering something wrong, which is exactly the failure a page-level assertion cannot see.
 *
 * jsdom was probed before these were written and implements both relevant behaviours faithfully:
 * `document.title` strips and collapses ASCII whitespace on read-back ("a  b" -> "a b"), and a
 * MutationObserver on `document.head` fires for a title write. Neither is stubbed here.
 *
 * Mutation checks (2026-09-03), each reddening the named tests and nothing else:
 *   - the bounded-corrections guard deleted -> "gives up after a fixed number of rounds".
 *   - the read-back replaced by the assigned string -> "settles immediately on a title the browser
 *     normalises".
 *   - the dev guard's decrement deleted -> both overlapping-instance tests.
 *   - the `title === null` branch deleted -> "claims nothing when given null" and "does not
 *     re-assert while the title is null".
 *
 * ❌ One mutation deliberately has NO test: reversing the cleanup's two statements (restore before
 * disconnect) reddens nothing, because `disconnect()` empties the record queue and the restore's
 * mutation record is discarded either way. The hook's inherited comment claimed that ordering was
 * load-bearing; it is not, and the hook now says so rather than being defended by a test that would
 * only be asserting a coincidence.
 */

const ORIGINAL_TITLE = 'Game of Life Studio';

function Probe({ title }: { title: string | null }) {
  useDocumentTitle(title);
  return null;
}

/** Lets a chain of MICROTASKS (which is what an observer feeding an observer is) run to
 * completion: everything queued drains before this macrotask resumes. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
}

/** Counts head mutations, i.e. how many times ANY agent rewrote the title. */
function countTitleWrites(): { stop(): number } {
  let writes = 0;
  const observer = new MutationObserver((records) => {
    writes += records.length;
  });
  observer.observe(document.head, { childList: true, subtree: true, characterData: true });
  return {
    stop() {
      observer.disconnect();
      return writes;
    },
  };
}

beforeEach(() => {
  document.title = ORIGINAL_TITLE;
});

afterEach(() => {
  vi.restoreAllMocks();
  document.title = ORIGINAL_TITLE;
});

describe('useDocumentTitle', () => {
  it('adopts the title, and tracks it as it changes', () => {
    const { rerender } = render(<Probe title="Three-Way Skirmish · Game of Life Studio" />);
    expect(document.title).toBe('Three-Way Skirmish · Game of Life Studio');

    rerender(<Probe title="Renamed · Game of Life Studio" />);

    expect(document.title).toBe('Renamed · Game of Life Studio');
  });

  it('claims nothing when given null', () => {
    render(<Probe title={null} />);

    expect(document.title).toBe(ORIGINAL_TITLE);
  });

  it('restores the pre-mount title on unmount', () => {
    const { unmount } = render(<Probe title="Owned · Game of Life Studio" />);
    expect(document.title).toBe('Owned · Game of Life Studio');

    unmount();

    expect(document.title).toBe(ORIGINAL_TITLE);
  });

  describe('the re-assertion that defeats Next’s async metadata commit', () => {
    it('takes the title back when something else overwrites it', async () => {
      render(<Probe title="Mine · Game of Life Studio" />);

      // Next 16's MetadataBoundary, committing the root layout's static <title> late — the whole
      // reason a plain `document.title = …` effect is not enough.
      document.title = 'Game of Life Studio';
      await settle();

      expect(document.title).toBe('Mine · Game of Life Studio');
    });

    it('does not re-assert while the title is null', async () => {
      render(<Probe title={null} />);

      document.title = 'Someone Else';
      await settle();

      expect(document.title).toBe('Someone Else');
    });

    it('stops re-asserting once unmounted', async () => {
      const { unmount } = render(<Probe title="Mine · Game of Life Studio" />);
      unmount();

      document.title = 'After The Fact';
      await settle();

      expect(document.title).toBe('After The Fact');
    });
  });

  /**
   * ⚠️ The two tests below are the reason this file exists. Both pin properties whose REGRESSION
   * mode is a starved event loop — no paint, no timers, no input — rather than a wrong value.
   *
   * Each is written to TERMINATE either way, deliberately: the adversary is bounded, so removing
   * the guard under test changes a COUNT rather than hanging the suite. A test that hung on
   * regression would be worse than useless here, because a starved microtask queue also stops
   * vitest's own timeout timer from ever firing.
   */
  describe('the bounded-corrections starvation guard', () => {
    it('gives up after a fixed number of rounds instead of fighting forever', async () => {
      const MINE = 'Mine · Game of Life Studio';
      const INTRUDER = 'Intruder';
      // Generous enough that an UNBOUNDED hook would reach it, and bounded so the test cannot hang.
      const INTRUDER_BUDGET = 30;
      let intruderWrites = 0;

      // A second agent that insists on its own title — the shape of any other title writer the hook
      // cannot know about (an extension, an analytics snippet, a second instance).
      const intruder = new MutationObserver(() => {
        if (document.title !== MINE) return;
        if (intruderWrites >= INTRUDER_BUDGET) return;
        intruderWrites += 1;
        document.title = INTRUDER;
      });
      intruder.observe(document.head, { childList: true, subtree: true, characterData: true });

      render(<Probe title={MINE} />);
      await settle();
      intruder.disconnect();

      // MAX_TITLE_CORRECTIONS is 10, so the intruder gets its opening write plus one reply per
      // correction. Unbounded, the hook would answer every one until the intruder's own budget ran
      // out — the assertion that distinguishes the two is the COUNT, not the final title.
      expect(intruderWrites).toBeLessThanOrEqual(12);
      expect(intruderWrites).toBeLessThan(INTRUDER_BUDGET);
      // Losing the tab title is cosmetic; hanging the page is not. The hook loses on purpose.
      expect(document.title).toBe(INTRUDER);
    });
  });

  describe('the whitespace read-back', () => {
    /**
     * A trailing space is an entirely normal mid-typing state ("New "), and the HTML spec's
     * `document.title` getter collapses it. Storing the string that was ASSIGNED rather than the
     * one the browser STORED makes the observer's inequality check permanently true, so the hook
     * fights the browser's own normalisation forever.
     */
    it('settles immediately on a title the browser normalises, rather than fighting itself', async () => {
      const counter = countTitleWrites();

      render(<Probe title="New  · Game of Life Studio" />);
      await settle();
      const writes = counter.stop();

      expect(document.title).toBe('New · Game of Life Studio');
      // One write — the hook's own. Storing the un-normalised string instead spends a correction on
      // every observer turn until MAX_TITLE_CORRECTIONS disconnects it, i.e. an order of magnitude
      // more writes for a title nothing else is even contesting.
      expect(writes).toBeLessThanOrEqual(2);
    });

    it('still tracks a normalised title when it changes', async () => {
      const { rerender } = render(<Probe title="New  · Game of Life Studio" />);
      await settle();

      rerender(<Probe title="Newer   · Game of Life Studio" />);
      await settle();

      expect(document.title).toBe('Newer · Game of Life Studio');
    });
  });

  /**
   * The capture/restore contract is stated app-wide ("one mounted consumer at a time"), so the
   * guard is too. Dev-only: in production the count is not even incremented.
   */
  it('reports overlapping instances in development, naming the consequence', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <>
        <Probe title="First · Game of Life Studio" />
        <Probe title="Second · Game of Life Studio" />
      </>,
    );

    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]?.[0]).toContain('2 instances are mounted at once');
  });

  it('does not warn for a single instance, or for remount after unmount', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { unmount } = render(<Probe title="First · Game of Life Studio" />);
    unmount();
    render(<Probe title="Second · Game of Life Studio" />);

    // The counter must DECREMENT on unmount, or the second mount of a normal navigation would warn.
    expect(error).not.toHaveBeenCalled();
  });
});

/**
 * IntersectionObserver as a small hook (Story 1.11 Task 5). Returns true once the element has
 * entered the viewport, and STAYS true — a thumbnail already painted must not be torn down when
 * it scrolls away, since repainting on every scroll reversal is strictly more work than keeping
 * the bitmap. `rootMargin` pre-loads one screenful ahead so the dish is painted before it is
 * looked at.
 */
import { useEffect, useRef, useState, type RefObject } from 'react';

// RefObject<HTMLElement>'s `current` is `HTMLElement | null` in React's own types (a ref is
// always null before mount) — the `| null` here is that same fact made explicit in the return
// type, not a deviation from it.
export function useInView(rootMargin = '200px'): [RefObject<HTMLElement | null>, boolean] {
  const ref = useRef<HTMLElement | null>(null);
  // Feature-detect and default to true when IntersectionObserver is undefined (jsdom, and any
  // environment we have not enumerated). Defaulting to false would make the thumbnail invisible
  // in every unit test and silently in any browser missing the API — a blank Gallery with a clean
  // console, which is the failure mode this project keeps finding.
  const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const element = ref.current;
    if (element === null) return;
    // Already latched true (a previous observer already saw it enter, or the feature-detect
    // default fired) — no need to observe again.
    if (inView) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect(); // stays true forever — nothing left to observe
        }
      },
      { rootMargin },
    );
    observer.observe(element);

    return () => observer.disconnect();
  }, [rootMargin, inView]);

  return [ref, inView];
}

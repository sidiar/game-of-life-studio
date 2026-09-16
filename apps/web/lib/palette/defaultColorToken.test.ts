import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { defaultColorToken } from './defaultColorToken';
import { PALETTE } from './paletteRegistry';

describe('defaultColorToken', () => {
  it('an empty library defaults to PALETTE[0] — first, not because it is a stored default', () => {
    expect(defaultColorToken([])).toBe(PALETTE[0].id);
  });

  it('one token used skips to the next unused entry', () => {
    expect(defaultColorToken([PALETTE[0].id])).toBe(PALETTE[1].id);
  });

  it('the first three ids in any order skip to PALETTE[3] — input order is irrelevant', () => {
    expect(defaultColorToken([PALETTE[2].id, PALETTE[0].id, PALETTE[1].id])).toBe(PALETTE[3].id);
  });

  it('every id used once: all tied at 1, so registry order picks PALETTE[0]', () => {
    expect(defaultColorToken(PALETTE.map((entry) => entry.id))).toBe(PALETTE[0].id);
  });

  it('every id once plus one extra PALETTE[0]: PALETTE[1] is now the sole least-used', () => {
    const used = [...PALETTE.map((entry) => entry.id), PALETTE[0].id];
    expect(defaultColorToken(used)).toBe(PALETTE[1].id);
  });

  it('every id twice, plus a third use of every id but PALETTE[5]: PALETTE[5] is the least-used', () => {
    const used = [
      ...PALETTE.map((entry) => entry.id),
      ...PALETTE.map((entry) => entry.id),
      ...PALETTE.filter((entry) => entry.id !== PALETTE[5].id).map((entry) => entry.id),
    ];
    expect(defaultColorToken(used)).toBe(PALETTE[5].id);
  });

  it('an unknown token occupies nothing: it is ignored, not counted as used', () => {
    expect(defaultColorToken(['not-a-token'])).toBe(PALETTE[0].id);
    expect(defaultColorToken([PALETTE[0].id, 'not-a-token'])).toBe(PALETTE[1].id);
  });

  it('duplicates of an unused token do not make it used', () => {
    expect(defaultColorToken([PALETTE[1].id, PALETTE[1].id])).toBe(PALETTE[0].id);
  });

  // Two arbitraries, not one: under fast-check's default size an array of 22 alternatives rarely
  // reaches every one of PALETTE's ids, so the least-used branch would be checked by the three
  // exact cases above only. The second arbitrary prepends every id once, which forces that branch
  // on every run.
  const knownIds = PALETTE.map((entry) => entry.id);
  const anyUsage = fc.array(fc.constantFrom(...knownIds, 'unknown-token-a', 'unknown-token-b'), {
    maxLength: 60,
  });
  const everyIdInUse = fc
    .array(fc.constantFrom(...knownIds, 'unknown-token-a'), { maxLength: 60 })
    .map((extra) => [...knownIds, ...extra]);

  it.each([
    ['any usage', anyUsage],
    ['every id already in use', everyIdInUse],
  ])(
    'property (%s): the result is always a PALETTE id, and matches the next-unused/least-used contract',
    (_label, usage) => {
      fc.assert(
        fc.property(usage, (usedColorTokens) => {
          const result = defaultColorToken(usedColorTokens);
          const resultIndex = PALETTE.findIndex((entry) => entry.id === result);
          expect(resultIndex).toBeGreaterThanOrEqual(0);

          const counts = new Map<string, number>();
          for (const token of usedColorTokens) {
            counts.set(token, (counts.get(token) ?? 0) + 1);
          }

          const someUnused = PALETTE.some((entry) => !counts.has(entry.id));
          if (someUnused) {
            expect(counts.has(result)).toBe(false);
            for (let i = 0; i < resultIndex; i++) {
              expect(counts.has(PALETTE[i].id)).toBe(true);
            }
          } else {
            const resultCount = counts.get(result) ?? 0;
            for (let i = 0; i < resultIndex; i++) {
              const earlierCount = counts.get(PALETTE[i].id) ?? 0;
              expect(earlierCount).toBeGreaterThan(resultCount);
            }
          }
        }),
      );
    },
  );
});

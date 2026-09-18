import { describe, expect, it } from 'vitest';
import { parseIntegerText } from './integerText';

describe('parseIntegerText', () => {
  it.each([
    ['5', 5],
    [' 42 ', 42],
    ['007', 7],
    ['150', 150],
    ['-5', -5],
    ['0', 0],
  ])('parses %j as %j', (text, expected) => {
    expect(parseIntegerText(text)).toBe(expected);
  });

  // A flat array — one case per string. Wrapping it in a second pair of brackets makes it ONE
  // row of ten columns, and only the first string is ever tested (the dominance.test.ts finding).
  it.each(['', ' ', '   ', 'abc', '5.5', '5.', '.5', '1e2', '+5', '5 5'])(
    'rejects %j as null',
    (text) => {
      expect(parseIntegerText(text)).toBeNull();
    },
  );

  it('a 400-digit string is an integer TEXT — it parses to a finite or Infinity number, never null', () => {
    const parsed = parseIntegerText('9'.repeat(400));
    expect(parsed).not.toBeNull();
    expect(typeof parsed).toBe('number');
  });
});

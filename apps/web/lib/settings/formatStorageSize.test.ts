import { describe, expect, it } from 'vitest';
import { formatStorageSize } from './formatStorageSize';

const KB = 1024;
const MB = KB * 1024;

describe('formatStorageSize', () => {
  it('formats 0 bytes', () => {
    expect(formatStorageSize(0)).toBe('0.0 KB');
  });

  it('formats the mockup number', () => {
    expect(formatStorageSize(2458)).toBe('2.4 KB');
  });

  it('formats just under 1 KB', () => {
    expect(formatStorageSize(1023)).toBe('1.0 KB');
  });

  it('formats exactly 1 KB', () => {
    expect(formatStorageSize(1024)).toBe('1.0 KB');
  });

  it('formats 1.5 KB', () => {
    expect(formatStorageSize(1536)).toBe('1.5 KB');
  });

  it('pins the 1 MiB boundary on the raw value, not a rounding-aware unit pick', () => {
    // The value one byte below 1 MiB renders 1,024.0 KB, not a flip to '1.00 MB' — the boundary is
    // the value, not the rounding.
    expect(formatStorageSize(MB - 1)).toBe('1,024.0 KB');
  });

  it('flips to MB at exactly 1 MiB', () => {
    expect(formatStorageSize(MB)).toBe('1.00 MB');
  });

  it('formats a RFC-006 soft-target workspace size in MB', () => {
    expect(formatStorageSize(Math.round(1.62 * MB))).toBe('1.62 MB');
  });

  it('formats a larger MB value with the house thousands separator', () => {
    expect(formatStorageSize(10 * MB + 512 * KB)).toBe('10.50 MB');
  });

  it('never renders KiB, bytes, or a lowercase unit', () => {
    for (const bytes of [0, 500, 2458, MB - 1, MB, 10 * MB]) {
      const result = formatStorageSize(bytes);
      expect(result).not.toMatch(/kib|bytes|kb$|mb$/);
    }
  });
});

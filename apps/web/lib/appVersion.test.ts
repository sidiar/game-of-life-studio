import { describe, expect, it } from 'vitest';
import packageJson from '../package.json';
import { APP_VERSION } from './appVersion';

describe('APP_VERSION', () => {
  it('equals apps/web/package.json’s version — the one source (FD2)', () => {
    expect(APP_VERSION).toBe(packageJson.version);
  });

  it('is a non-empty string', () => {
    expect(typeof APP_VERSION).toBe('string');
    expect(APP_VERSION.length).toBeGreaterThan(0);
  });
});

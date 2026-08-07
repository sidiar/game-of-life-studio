import { createMockOrganisms, MOCK_ORGANISM_IDS } from '@gol/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { paletteIndexOf } from './paletteRegistry';
import { buildRefToFillGroup, fillGroupOf, resetRefToFillGroupWarnings } from './refToFillGroup';

const ORGANISM_IDS = [
  MOCK_ORGANISM_IDS.aggressiveColonizer, // ref 1, vermillion, non-aging
  MOCK_ORGANISM_IDS.patientDefender, // ref 2, azure, aging
  MOCK_ORGANISM_IDS.chaoticSpreader, // ref 3, bluish-green, non-aging
] as const;

function buildLut() {
  const organismsById = new Map(createMockOrganisms().map((o) => [o.id, o]));
  return buildRefToFillGroup(ORGANISM_IDS, organismsById);
}

afterEach(() => {
  vi.restoreAllMocks();
  // The warn-once registry is a module singleton that restoreAllMocks does not touch. Without
  // this, "warns once" passes only while it happens to be the first test in the file to touch
  // that id, and any test added above it flips the assertion to zero calls.
  resetRefToFillGroupWarnings();
});

describe('buildRefToFillGroup', () => {
  it('maps refs 1-3 to the palette indices of their colorToken, and aging flags 0/1/0', () => {
    const lut = buildLut();

    expect(lut.tokenIndex[1]).toBe(paletteIndexOf('vermillion'));
    expect(lut.tokenIndex[2]).toBe(paletteIndexOf('azure'));
    expect(lut.tokenIndex[3]).toBe(paletteIndexOf('bluish-green'));
    expect(Array.from(lut.aging)).toEqual([0, 0, 1, 0]);
    expect(lut.size).toBe(4);
  });

  it('falls back to the default token and warns once for a roster id absent from the map', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const lut = buildRefToFillGroup(['no-such-organism'], new Map());

    expect(lut.tokenIndex[1]).toBe(paletteIndexOf('sky-blue'));
    expect(lut.aging[1]).toBe(0);

    // Calling again with the same battle-shaped roster must not warn a second time.
    buildRefToFillGroup(['no-such-organism'], new Map());
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('throws with the actual length on a roster over the 255-organism cap', () => {
    const oversized = Array.from({ length: 256 }, (_, i) => `organism-${i}`);
    expect(() => buildRefToFillGroup(oversized, new Map())).toThrow(/256/);
  });

  it('accepts a roster of exactly 255 — ref 255 is addressable, not off the end', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // The boundary the cap defends, tested from the legal side: size is 256, so ref 255 (the
    // largest value a Uint8Array occupant can carry) is the last valid slot rather than one past
    // it. Testing only the 256-throw leaves this off-by-one unguarded.
    const atCap = Array.from({ length: 255 }, (_, i) => `organism-${i}`);
    const lut = buildRefToFillGroup(atCap, new Map());

    expect(lut.size).toBe(256);
    expect(lut.tokenIndex).toHaveLength(256);
    expect(255).toBeLessThan(lut.size);
    expect(fillGroupOf(lut, 255, 0)).toBeLessThan(160);
  });
});

describe('fillGroupOf', () => {
  it('non-aging organisms key at ageShade 7 for every age 0..99', () => {
    const lut = buildLut();
    const tokenIndex = lut.tokenIndex[1]; // aggressiveColonizer, non-aging

    for (let age = 0; age <= 99; age++) {
      expect(fillGroupOf(lut, 1, age)).toBe(tokenIndex * 8 + 7);
    }
  });

  it('aging organisms key at min(age, 7)', () => {
    const lut = buildLut();
    const tokenIndex = lut.tokenIndex[2]; // patientDefender, aging

    for (let age = 0; age <= 99; age++) {
      expect(fillGroupOf(lut, 2, age)).toBe(tokenIndex * 8 + Math.min(age, 7));
    }
  });

  it('every group id produced across all refs x ages 0..99 stays under 160', () => {
    const lut = buildLut();

    for (let ref = 1; ref < lut.size; ref++) {
      for (let age = 0; age <= 99; age++) {
        expect(fillGroupOf(lut, ref, age)).toBeLessThan(160);
      }
    }
  });

  // Slot 0 (the empty-cell ref) is never read by design — groupByColourState (Task 4) skips
  // occupant === 0 before any LUT lookup, so fillGroupOf is never called with ref 0 in production.
  // There is nothing to assert here beyond that design boundary; see colourStateGroups.test.ts.
});

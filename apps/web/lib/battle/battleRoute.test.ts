import { describe, expect, it } from 'vitest';
import { BATTLE_MODE_PARAM, RUN_MODE_VALUE, battleHref, initialModeFromParam } from './battleRoute';

describe('battleHref', () => {
  // Pinned: BattleTile.test.tsx's own href test builds this exact string and must not change when
  // the tile switches from an inline template to this builder.
  it('without a mode, matches the title link’s existing shape exactly', () => {
    expect(battleHref('battle-1')).toBe('/battle?id=battle-1');
  });

  it('with { mode: "run" }, appends the mode param', () => {
    expect(battleHref('battle-1', { mode: 'run' })).toBe('/battle?id=battle-1&mode=run');
  });

  // BattleSummary.id is only as trustworthy as the stored record (BattleTile.tsx's own comment) —
  // the builder still encodes even though ids are uuids in practice.
  it('encodes an id that needs it, in both forms', () => {
    expect(battleHref('a b')).toBe('/battle?id=a%20b');
    expect(battleHref('a b', { mode: 'run' })).toBe('/battle?id=a%20b&mode=run');
  });
});

describe('initialModeFromParam', () => {
  it('reads the exact string "run" as Run mode', () => {
    expect(initialModeFromParam('run')).toBe('run');
  });

  // Every other value degrades to Lab silently (AC4) — a hand-typed ?mode=play is not an error
  // state this page announces.
  it.each([null, '', 'lab', 'RUN', 'play', ' run'])('reads %j as Lab mode', (value) => {
    expect(initialModeFromParam(value)).toBe('lab');
  });
});

describe('constants', () => {
  it('names the param and the run value', () => {
    expect(BATTLE_MODE_PARAM).toBe('mode');
    expect(RUN_MODE_VALUE).toBe('run');
  });
});

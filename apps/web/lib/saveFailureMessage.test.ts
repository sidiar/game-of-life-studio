import { describe, expect, it } from 'vitest';
import { CorruptDataError, NewerFormatVersionError, QuotaExceededError } from '@gol/persistence';
import { saveFailureMessage } from './saveFailureMessage';

// Story 4.16 Task 4: the six sentences by class × subject. The 'battle' three stay
// byte-identical to what shipped before the move — also asserted directly in
// `BattleEditorView.test.tsx` and `BattlePage.test.tsx`.
describe('saveFailureMessage', () => {
  const quota = new QuotaExceededError('gol:organisms');
  const corrupt = new CorruptDataError('gol:organisms', 'x');
  const other = new Error('x');

  it('quota / battle', () => {
    const message = saveFailureMessage(quota, 'battle');
    expect(message).toBe(
      'Storage is full, so this battle was not saved. Everything already saved is unchanged — ' +
        'delete a battle from the Gallery to free space, then save again.',
    );
  });

  it('quota / organism', () => {
    const message = saveFailureMessage(quota, 'organism');
    expect(message).toContain('organism');
    expect(message).not.toContain('battle was not saved');
    expect(message).toBe(
      'Storage is full, so this organism was not saved. Everything already saved is unchanged — ' +
        'delete a battle from the Gallery to free space, then save again.',
    );
  });

  it('corrupt / battle', () => {
    const message = saveFailureMessage(corrupt, 'battle');
    expect(message).toBe(
      'Saved battle data could not be read, so this battle was not saved. Nothing already ' +
        'stored was changed. Your work is still here — try again.',
    );
  });

  it('corrupt / organism', () => {
    const message = saveFailureMessage(corrupt, 'organism');
    expect(message).toContain('organism');
    expect(message).not.toContain('battle was not saved');
    expect(message).toBe(
      'Saved organism data could not be read, so this organism was not saved. Nothing already ' +
        'stored was changed. Your work is still here — try again.',
    );
  });

  it('other / battle', () => {
    const message = saveFailureMessage(other, 'battle');
    expect(message).toBe(
      'This battle could not be saved. Nothing already stored was changed, and your work is still ' +
        'here — try again.',
    );
  });

  it('other / organism', () => {
    const message = saveFailureMessage(other, 'organism');
    expect(message).toContain('organism');
    expect(message).not.toContain('battle was not saved');
    expect(message).toBe(
      'This organism could not be saved. Nothing already stored was changed, and your work is ' +
        'still here — try again.',
    );
  });

  // Story 5.11: tested before the CorruptDataError branch (a subclass) — reload, never "try again".
  it.each(['battle', 'organism'] as const)(
    'newer format / %s says reload, never try again',
    (subject) => {
      const message = saveFailureMessage(
        new NewerFormatVersionError('gol:schema', 2, 1, 'x'),
        subject,
      );
      expect(message).toBe(
        `This ${subject} was not saved because your workspace was saved by a newer version of the ` +
          'app. Nothing already stored was changed. Reload the page to continue.',
      );
      expect(message).not.toMatch(/try again/iu);
    },
  );
});

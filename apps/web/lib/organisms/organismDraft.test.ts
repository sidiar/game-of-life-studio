import { describe, expect, it } from 'vitest';
import { createNewOrganismDraft } from './organismDraft';

describe('createNewOrganismDraft', () => {
  it('seeds an empty name, never placeholder text the user would have to delete', () => {
    expect(createNewOrganismDraft()).toEqual({ name: '' });
  });

  // The seed must never be shared between two opens of the editor: Story 4.23 diffs the draft
  // against its seed, and a shared object would make every edit also an edit of the baseline.
  it('returns a distinct object on every call', () => {
    const first = createNewOrganismDraft();
    const second = createNewOrganismDraft();
    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });
});

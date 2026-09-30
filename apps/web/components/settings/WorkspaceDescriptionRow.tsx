'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { styled } from '@mui/material/styles';
import { MAX_WORKSPACE_DESCRIPTION_LENGTH } from '@gol/domain';
import type { WorkspaceMetaRepository } from '@gol/persistence';
import { RowDescription, RowLabel, type RowOutcome } from './SettingsCard';

export const WORKSPACE_DESCRIPTION_SAVED = 'Workspace description saved.';
export const WORKSPACE_DESCRIPTION_SAVE_FAILED =
  'The workspace description could not be saved. Nothing was changed — try again.';

export interface WorkspaceDescriptionRowProps {
  /** A `Pick` of the port (the Story 5.2 FD7 narrowing rule, AR-2/27) — never the aggregate. */
  workspaceMeta: Pick<WorkspaceMetaRepository, 'load' | 'save'>;
  /** Reports this row's outcome to `<DataManagement>`'s single shared slot (Review Finding D2):
   * `null` at the start of a save, the outcome once it settles. */
  onMessage(message: RowOutcome | null): void;
}

// A column rather than the shared `Row`'s space-between line: a textarea needs the card's width,
// and changing `Row` itself would move every other row on the page.
const Column = styled('div')({
  padding: '15px 0',
});

const TextArea = styled('textarea')({
  display: 'block',
  width: '100%',
  minHeight: '72px',
  resize: 'vertical',
  margin: '10px 0 4px',
  background: 'var(--gol-bg-hover)',
  border: '1px solid var(--gol-border-control)',
  color: 'var(--gol-text-primary)',
  padding: '12px 14px',
  fontSize: '14px',
  lineHeight: 1.4,
  fontFamily: 'inherit',
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '-2px',
  },
});

// The field and its Save side by side — every other Data Management row keeps its action in the
// card's right column (`LoadPresetRow`'s select + Load is the nearest match), so Save sits there
// too instead of hugging the textarea's bottom edge. Wraps below the field when the card is too
// narrow for both (the gallery routes are ungated at phone width).
const Field = styled('div')({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'flex-start',
  columnGap: '20px',
});

const FieldBody = styled('div')({
  flex: '1 1 320px',
  minWidth: 0,
});

const Counter = styled('div')({
  fontSize: '11px',
  color: 'var(--gol-text-tertiary)',
});

const CapNotice = styled('div')({
  fontSize: '11px',
  color: 'var(--gol-text-secondary)',
});

// `ExportButton`'s rule set (DataManagement.tsx), copied rather than imported for the same reason
// that file copies it: a local styled component per row. Never `disabled` (FD8's keyboard-focus
// trap) — a second click while a save is in flight is a `pendingRef` no-op instead.
const SaveButton = styled('button')({
  background: 'var(--gol-accent)',
  color: 'var(--gol-bg-primary)',
  border: 'none',
  padding: '12px 24px',
  fontSize: '13px',
  fontWeight: 600,
  fontFamily: 'inherit',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  cursor: 'pointer',
  flexShrink: 0,
  // The textarea's own top margin, so the button's top edge lines up with the field's.
  marginTop: '10px',
  transition: 'background-color 0.2s',
  '&:hover': {
    background: 'var(--gol-accent-hover)',
  },
  '&:focus-visible': {
    outline: '2px solid var(--gol-accent)',
    outlineOffset: '2px',
  },
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
  },
});

/**
 * The workspace description's authoring home (FR-9.5, Story 7.2 FD7) — the first row of Data
 * Management, above Export, because it is what Export will carry. Without it a workspace
 * description could only arrive by import, and FR-9.1 forbids hand-writing preset JSON.
 *
 * The textarea follows `<BattleNameField>`'s CLAMP pattern (FD8): native `maxLength`, a `.slice`
 * for the writes the attribute misses, an `aria-describedby` counter and a polite at-cap notice.
 * It loads its own value on mount; a failed load leaves it empty and still usable (the value is
 * cosmetic — a corrupt `gol:workspace` must never block the page). `<DataManagement>` remounts it
 * (a `key` bump) after an import or a Clear All so it re-reads what the store now holds.
 */
export default function WorkspaceDescriptionRow({
  workspaceMeta,
  onMessage,
}: WorkspaceDescriptionRowProps) {
  const labelId = useId();
  const helperId = useId();
  const counterId = useId();
  const [value, setValue] = useState('');
  const pendingRef = useRef(false);
  const mountedRef = useRef(true);
  // An edit made before the initial load settles wins over the loaded text.
  const editedRef = useRef(false);
  // Review finding (Story 7.2): Save fires from the current `value` state, which starts as `''`.
  // Without this, a Save that lands before the mount effect's `load()` resolves writes `''` over
  // whatever was actually stored, and the load's own `.then` (unaware a save just ran) then
  // repaints the field with the PRE-save text — storage and UI disagree, silently. Save is a
  // no-op (matching `pendingRef`'s existing no-op-not-disabled pattern, FD8) until the initial
  // read has settled, success or failure alike.
  const loadedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    workspaceMeta
      .load()
      .then((meta) => {
        if (active && !editedRef.current) setValue(meta.description ?? '');
      })
      .catch(() => {
        // Degrade to empty (FD4): the row stays usable, and a save overwrites the bad record.
      })
      .finally(() => {
        if (active) loadedRef.current = true;
      });
    return () => {
      active = false;
    };
  }, [workspaceMeta]);

  // Not ordered against Import / Clear All, which replace or clear the same `gol:workspace` key —
  // the FD6 "no cross-row locking" stance, extended to this row by owner ruling (Story 7.2 review,
  // 2026-09-28). The race is unreachable in localStorage mode: `LocalStorageWorkspaceMetaRepository
  // .save()` writes synchronously before any `await`, so the write lands at click time and only the
  // status message is pending; Import and Clear All run behind modal dialogs; and `DataManagement`
  // remounts this row (`descriptionKey`) after both, so no stale text survives in the field.
  // ⚠️ A connected-mode (truly async) `WorkspaceMetaRepository` must order this save against
  // Import / Clear All — see `deferred-work.md`.
  async function handleSave() {
    if (pendingRef.current || !loadedRef.current) return;
    pendingRef.current = true;
    onMessage(null);
    try {
      await workspaceMeta.save({ description: value });
      if (mountedRef.current) onMessage({ role: 'status', text: WORKSPACE_DESCRIPTION_SAVED });
    } catch {
      if (mountedRef.current) {
        onMessage({ role: 'alert', text: WORKSPACE_DESCRIPTION_SAVE_FAILED });
      }
    } finally {
      pendingRef.current = false;
    }
  }

  return (
    <Column>
      <RowLabel id={labelId}>Workspace description</RowLabel>
      <RowDescription id={helperId}>
        Shown at the top of the gallery and carried by Export Workspace.
      </RowDescription>
      <Field>
        <FieldBody>
          <TextArea
            value={value}
            onChange={(event) => {
              editedRef.current = true;
              setValue(event.target.value.slice(0, MAX_WORKSPACE_DESCRIPTION_LENGTH));
            }}
            maxLength={MAX_WORKSPACE_DESCRIPTION_LENGTH}
            aria-labelledby={labelId}
            aria-describedby={`${helperId} ${counterId}`}
          />
          <Counter id={counterId}>
            {value.length} / {MAX_WORKSPACE_DESCRIPTION_LENGTH}
          </Counter>
          {value.length >= MAX_WORKSPACE_DESCRIPTION_LENGTH && (
            <CapNotice role="status">
              Description limit reached — {MAX_WORKSPACE_DESCRIPTION_LENGTH} characters.
            </CapNotice>
          )}
        </FieldBody>
        <SaveButton type="button" aria-label="Save workspace description" onClick={handleSave}>
          Save
        </SaveButton>
      </Field>
    </Column>
  );
}

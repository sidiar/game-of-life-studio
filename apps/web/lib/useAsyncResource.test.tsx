import { StrictMode, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAsyncResource } from './useAsyncResource';

// A deferred promise, so a test can observe the 'loading' phase for real rather than racing a
// microtask that has already resolved by the time render() returns.
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function Probe({ load, deps }: { load: () => Promise<string>; deps: unknown[] }) {
  const { data, status } = useAsyncResource(load, deps);
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="data">{data ?? '—'}</span>
    </div>
  );
}

describe('useAsyncResource', () => {
  it('starts in loading and moves to ready with the resolved value', async () => {
    const { promise, resolve } = deferred<string>();
    render(<Probe load={() => promise} deps={[]} />);

    expect(screen.getByTestId('status')).toHaveTextContent('loading');
    expect(screen.getByTestId('data')).toHaveTextContent('—');

    resolve('conway');

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    expect(screen.getByTestId('data')).toHaveTextContent('conway');
  });

  // AC4's failure half. `data` stays undefined — the caller must not be handed a half-built
  // resource alongside an error status.
  it('moves to error when the load rejects, and holds no data', async () => {
    const { promise, reject } = deferred<string>();
    render(<Probe load={() => promise} deps={[]} />);

    reject(new Error('storage exploded'));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'));
    expect(screen.getByTestId('data')).toHaveTextContent('—');
  });

  // `null` is a VALUE, not an absence of one: BattleRepository.load() returns null for "no such
  // battle" and the page has to be able to tell that apart from "still loading". This is the
  // property Task 5's third terminal state rests on.
  it('reaches ready with a null value rather than staying in loading', async () => {
    function NullProbe() {
      const { data, status } = useAsyncResource<string | null>(() => Promise.resolve(null), []);
      return (
        <span data-testid="state">{`${status}:${data === null ? 'null' : String(data)}`}</span>
      );
    }
    render(<NullProbe />);

    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('ready:null'));
  });

  // Liveness. React logs "state update on an unmounted component" as a console.error in some
  // versions and silently no-ops in others, so the assertion is on the setState spies not firing
  // rather than on a warning that may never be emitted.
  it('sets no state when the load settles after unmount', async () => {
    const { promise, resolve } = deferred<string>();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { unmount } = render(<Probe load={() => promise} deps={[]} />);
    unmount();
    resolve('too late');
    await promise;

    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  // A deps change is a NEW request: the hook must re-run the load and must not keep showing the
  // previous resource's data while the new one is in flight.
  it('re-runs the load when deps change', async () => {
    const load = vi.fn((id: string) => Promise.resolve(`battle-${id}`));

    function Switcher() {
      const [id, setId] = useState('a');
      return (
        <>
          <button type="button" onClick={() => setId('b')}>
            switch
          </button>
          <Probe load={() => load(id)} deps={[id]} />
        </>
      );
    }

    render(<Switcher />);
    await waitFor(() => expect(screen.getByTestId('data')).toHaveTextContent('battle-a'));

    await userEvent.click(screen.getByRole('button', { name: 'switch' }));

    await waitFor(() => expect(screen.getByTestId('data')).toHaveTextContent('battle-b'));
    expect(load).toHaveBeenCalledTimes(2);
  });

  // The reset half of a deps change: while the NEW request is in flight the hook must not still
  // be reporting the OLD one's 'ready' status and data. Without it a page that switches resources
  // renders the previous resource as though it were the current one — the exact confusion the
  // status field exists to prevent.
  it('returns to loading and drops stale data the moment deps change', async () => {
    const pending = deferred<string>();
    const loads: Record<string, Promise<string>> = {
      a: Promise.resolve('battle-a'),
      b: pending.promise,
    };

    function Switcher() {
      const [id, setId] = useState('a');
      return (
        <>
          <button type="button" onClick={() => setId('b')}>
            switch
          </button>
          <Probe load={() => loads[id]} deps={[id]} />
        </>
      );
    }

    render(<Switcher />);
    await waitFor(() => expect(screen.getByTestId('data')).toHaveTextContent('battle-a'));

    await userEvent.click(screen.getByRole('button', { name: 'switch' }));

    expect(screen.getByTestId('status')).toHaveTextContent('loading');
    expect(screen.getByTestId('data')).toHaveTextContent('—');

    pending.resolve('battle-b');
    await waitFor(() => expect(screen.getByTestId('data')).toHaveTextContent('battle-b'));
  });

  // The only place the React 19 double-invoked-effect path is exercised (App Router turns
  // StrictMode on by default, so dev IS this environment). The hook has no run-once guard on
  // purpose: setup #2 starts its own load with its own live closure, so BOTH loads settle and the
  // second one — the live one — is what lands. A `mounted` ref copied from useWorkspaceSeed would
  // make this pass too, which is exactly why the assertion is on the call count as well.
  it('settles to ready under StrictMode, running the load once per effect setup', async () => {
    const load = vi.fn(() => Promise.resolve('strict'));

    render(
      <StrictMode>
        <Probe load={load} deps={[]} />
      </StrictMode>,
    );

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    expect(screen.getByTestId('data')).toHaveTextContent('strict');
    expect(load).toHaveBeenCalledTimes(2);
  });
});

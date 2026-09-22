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

  // Unmount safety, as a crash/noise smoke test only. React 18.3+ REMOVED the "state update on an
  // unmounted component" warning and made the update a silent no-op, so this test cannot fail if
  // the `alive` guard is deleted — it is not the liveness test, and the one below is. Kept because
  // it still catches a load that throws synchronously or logs on the unmount path.
  it('stays silent when the load settles after unmount', async () => {
    const { promise, resolve } = deferred<string>();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { unmount } = render(<Probe load={() => promise} deps={[]} />);
    unmount();
    resolve('too late');
    await promise;

    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  // ⚠️ THE liveness test. The closure `alive` flag's real job is not unmount (React no-ops that
  // silently) — it is this: a SUPERSEDED request resolving late must not overwrite the current
  // one. Delete `alive`/`if (!alive) return` from useAsyncResource and this test fails, showing
  // 'battle-a' after the user already switched to b. Nothing else in this file covers it.
  it('ignores a superseded request that resolves after the deps already changed', async () => {
    const slowA = deferred<string>();
    const loads: Record<string, Promise<string>> = {
      a: slowA.promise,
      b: Promise.resolve('battle-b'),
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
    // Switch while a is still in flight — a's closure is torn down by the effect cleanup here.
    await userEvent.click(screen.getByRole('button', { name: 'switch' }));
    await waitFor(() => expect(screen.getByTestId('data')).toHaveTextContent('battle-b'));

    // a now answers, far too late. It must be dropped on the floor.
    slowA.resolve('battle-a');
    await slowA.promise;

    expect(screen.getByTestId('data')).toHaveTextContent('battle-b');
    expect(screen.getByTestId('status')).toHaveTextContent('ready');
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

  // Task 5 (a): reload() re-invokes load once; status stays 'ready' and data stays the OLD value
  // between the call and the resolution, then flips to the new value — no 'loading' flash.
  it('reload() re-invokes load once and stays ready with the old value until it resolves', async () => {
    const first = Promise.resolve('v1');
    const second = deferred<string>();
    const load = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second.promise);

    function ReloadProbe() {
      const resource = useAsyncResource<string>(load, []);
      return (
        <div>
          <span data-testid="status">{resource.status}</span>
          <span data-testid="data">{resource.data ?? '—'}</span>
          <button type="button" onClick={resource.reload}>
            reload
          </button>
        </div>
      );
    }

    render(<ReloadProbe />);
    await waitFor(() => expect(screen.getByTestId('data')).toHaveTextContent('v1'));

    await userEvent.click(screen.getByRole('button', { name: 'reload' }));

    // Still ready, still the OLD value — no 'loading' flash.
    expect(screen.getByTestId('status')).toHaveTextContent('ready');
    expect(screen.getByTestId('data')).toHaveTextContent('v1');

    second.resolve('v2');
    await waitFor(() => expect(screen.getByTestId('data')).toHaveTextContent('v2'));
    expect(screen.getByTestId('status')).toHaveTextContent('ready');
    expect(load).toHaveBeenCalledTimes(2);
  });

  // Task 5 (b): reload() fired while the FIRST load is still pending — only the SECOND result
  // lands, even though the first resolves later (the liveness flag).
  it('drops a superseded reload the same way a deps change does', async () => {
    const initial = deferred<string>();
    const reloadA = deferred<string>();
    const load = vi.fn().mockReturnValueOnce(initial.promise).mockReturnValueOnce(reloadA.promise);

    function ReloadProbe() {
      const resource = useAsyncResource<string>(load, []);
      return (
        <div>
          <span data-testid="status">{resource.status}</span>
          <span data-testid="data">{resource.data ?? '—'}</span>
          <button type="button" onClick={resource.reload}>
            reload
          </button>
        </div>
      );
    }

    render(<ReloadProbe />);
    initial.resolve('v1');
    await waitFor(() => expect(screen.getByTestId('data')).toHaveTextContent('v1'));

    await userEvent.click(screen.getByRole('button', { name: 'reload' }));
    // A second reload before the first reload settles — supersedes it.
    const reloadB = deferred<string>();
    load.mockReturnValueOnce(reloadB.promise);
    await userEvent.click(screen.getByRole('button', { name: 'reload' }));

    reloadB.resolve('v3');
    await waitFor(() => expect(screen.getByTestId('data')).toHaveTextContent('v3'));

    // The superseded reload answers late — must be dropped on the floor.
    reloadA.resolve('v2 (stale)');
    await reloadA.promise;
    expect(screen.getByTestId('data')).toHaveTextContent('v3');
  });

  // Task 5 (c): reload identity is stable across renders (a caller may pass it to a memoised
  // callback without invalidating it every render).
  it('reload identity is stable across renders', async () => {
    const identities: Array<() => void> = [];

    function IdentityProbe() {
      const resource = useAsyncResource(() => Promise.resolve('x'), []);
      const [, forceRender] = useState(0);
      identities.push(resource.reload);
      return (
        <button type="button" onClick={() => forceRender((n) => n + 1)}>
          rerender
        </button>
      );
    }

    render(<IdentityProbe />);
    await userEvent.click(screen.getByRole('button', { name: 'rerender' }));
    await userEvent.click(screen.getByRole('button', { name: 'rerender' }));

    expect(identities.length).toBeGreaterThanOrEqual(3);
    expect(new Set(identities).size).toBe(1);
  });

  // Task 5 (d): a reload after an 'error' status recovers to 'ready' with data.
  it('a reload after an error status recovers to ready with data', async () => {
    const failing = Promise.reject(new Error('storage exploded'));
    const recovering = Promise.resolve('recovered');
    const load = vi.fn().mockReturnValueOnce(failing).mockReturnValueOnce(recovering);

    function ReloadProbe() {
      const resource = useAsyncResource<string>(load, []);
      return (
        <div>
          <span data-testid="status">{resource.status}</span>
          <span data-testid="data">{resource.data ?? '—'}</span>
          <button type="button" onClick={resource.reload}>
            reload
          </button>
        </div>
      );
    }

    render(<ReloadProbe />);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'));

    await userEvent.click(screen.getByRole('button', { name: 'reload' }));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    expect(screen.getByTestId('data')).toHaveTextContent('recovered');
  });
});

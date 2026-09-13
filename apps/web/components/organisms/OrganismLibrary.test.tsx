import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { createFakeRepositories, createMockOrganisms } from '@gol/test-utils';
import OrganismLibrary from './OrganismLibrary';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OrganismLibrary', () => {
  it('shows loading copy while seedStatus is "seeding", even after list() has resolved', async () => {
    const mocks = createMockOrganisms();
    const { organisms } = createFakeRepositories({ organisms: mocks });
    const list = vi.spyOn(organisms, 'list');

    render(<OrganismLibrary organisms={organisms} seedStatus="seeding" />);

    // Let the fake's list() promise settle FIRST — asserting synchronously after render would
    // pass on resource.status === 'loading' alone, with the seedStatus clause of the fold deleted.
    await waitFor(() => expect(list).toHaveResolved());
    expect(screen.getByText('Loading organisms…')).toBeInTheDocument();
    expect(screen.queryByText(mocks[0].name)).not.toBeInTheDocument();
  });

  // The `seedStatus` dep on useAsyncResource is deliberate (the first list() reads a pre-seed
  // store); this pins that the flip re-runs list() and the post-seed result is what renders —
  // dropping the dep leaves every other test here green.
  it('re-runs list() when seedStatus flips from "seeding" to "ready", rendering the seeded rows', async () => {
    const mocks = createMockOrganisms();
    const { organisms } = createFakeRepositories();
    const list = vi.spyOn(organisms, 'list');

    const { rerender } = render(<OrganismLibrary organisms={organisms} seedStatus="seeding" />);
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));

    // The "seed" lands while the first read is already settled against an empty store.
    for (const organism of mocks) await organisms.save(organism);
    rerender(<OrganismLibrary organisms={organisms} seedStatus="ready" />);

    await waitFor(() => {
      expect(screen.getAllByRole('listitem')).toHaveLength(mocks.length);
    });
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('renders each organism by name once ready, and nothing else', async () => {
    const mocks = createMockOrganisms();
    const { organisms } = createFakeRepositories({ organisms: mocks });

    render(<OrganismLibrary organisms={organisms} seedStatus="ready" />);

    await waitFor(() => {
      for (const organism of mocks) {
        expect(screen.getByText(organism.name)).toBeInTheDocument();
      }
    });
    // A COUNT, for the same reason AppNav.test.tsx counts links: name-presence alone passes with
    // a duplicated or phantom row.
    expect(screen.getAllByRole('listitem')).toHaveLength(mocks.length);
  });

  it('shows role="alert" when seedStatus is "error"', () => {
    const { organisms } = createFakeRepositories({ organisms: createMockOrganisms() });

    render(<OrganismLibrary organisms={organisms} seedStatus="error" />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Something went wrong loading your organisms.',
    );
  });

  it('shows role="alert" when list() rejects, even with seedStatus "ready"', async () => {
    const organisms = {
      list: vi.fn().mockRejectedValue(new Error('boom')),
    } as unknown as Parameters<typeof OrganismLibrary>[0]['organisms'];

    render(<OrganismLibrary organisms={organisms} seedStatus="ready" />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Something went wrong loading your organisms.',
      );
    });
  });

  it('renders exactly one h1, "Organism Library"', async () => {
    const { organisms } = createFakeRepositories({ organisms: createMockOrganisms() });

    const { container } = render(<OrganismLibrary organisms={organisms} seedStatus="ready" />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: 'Organism Library' }),
      ).toBeInTheDocument();
    });
    expect(container.querySelectorAll('h1')).toHaveLength(1);
  });

  it('has no axe accessibility violations once ready', async () => {
    const { organisms } = createFakeRepositories({ organisms: createMockOrganisms() });

    const { container } = render(<OrganismLibrary organisms={organisms} seedStatus="ready" />);

    await waitFor(() => screen.getByText(createMockOrganisms()[0].name));

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});

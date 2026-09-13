import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { createFakeRepositories, createMockOrganisms } from '@gol/test-utils';
import OrganismLibrary from './OrganismLibrary';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OrganismLibrary', () => {
  it('shows loading copy while seedStatus is "seeding", even if list() has already resolved', () => {
    const { organisms } = createFakeRepositories({ organisms: createMockOrganisms() });

    render(<OrganismLibrary organisms={organisms} seedStatus="seeding" />);

    expect(screen.getByText('Loading organisms…')).toBeInTheDocument();
  });

  it('renders each organism by name once ready', async () => {
    const mocks = createMockOrganisms();
    const { organisms } = createFakeRepositories({ organisms: mocks });

    render(<OrganismLibrary organisms={organisms} seedStatus="ready" />);

    await waitFor(() => {
      for (const organism of mocks) {
        expect(screen.getByText(organism.name)).toBeInTheDocument();
      }
    });
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

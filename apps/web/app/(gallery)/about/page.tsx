import type { Metadata } from 'next';
import AboutPage from '@/components/about/AboutPage';

// Title and description only: the root layout's openGraph/twitter blocks still apply, so the link
// preview keeps the site image. The title renders through the root template ("About · Game of
// Life Studio").
export const metadata: Metadata = {
  title: 'About',
  description: 'Who built Game of Life Studio, how it was built, and how to get in touch.',
};

// The page boundary for `/about` — a static path (Decision K.5) under `(gallery)` so it wears
// AppShell (FD1 of Story 5.1: a page outside the group gets no nav, no wordmark and no <main>).
// Unlike the other gallery routes it creates no repositories and runs no workspace seed: the page
// reads nothing from storage, so there is nothing to inject. No <main> here — AppShell owns it.
export default function AboutRoute() {
  return <AboutPage />;
}

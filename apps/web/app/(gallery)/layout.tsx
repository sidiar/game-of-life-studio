import type { ReactNode } from 'react';
import AppShell from '@/components/layout/AppShell';

// The branch that wears AppShell (Story 2.1 forced decision 2) — the gallery half of the
// route-group split. AppShell moved OFF the root layout and onto this group: it is mounted on
// every route it wraps, and the battle route must not wear it — the lab mockup's header is the
// battle title, with no wordmark and no nav (petri-dish-lab-mode.html:647-656), and two stacked
// headers is not a cosmetic problem because Story 2.4's auto-fit canvas sizes off the space the
// chrome leaves.
//
// The alternative — teaching AppShell to branch on usePathname() — puts route knowledge inside a
// presentational shell and grows a branch per route forever. Route groups cost one file move,
// once. Parentheses do NOT appear in the URL: `(gallery)/page.tsx` still serves `/`.
//
// It now hosts `/` AND `/organisms` (Story 4.1). `/settings` (Story 5.1) belongs here too, or it
// will ship without the shell — the exact trap app/not-found.tsx documents (a route rendered
// under a layout that never mounts this file gets no nav, no wordmark, no <main>, and every jsdom
// test stays green because none of them render the orphaned route). Adding a route to this group
// is a file, not a layout change; the group's name stays historical (FD1) — renaming it to
// `(shell)` buys nothing at runtime and is not this story's job.
//
// AppShell owns the <main> landmark for this branch and is otherwise unchanged.
export default function GalleryLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}

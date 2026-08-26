import type { ReactNode } from 'react';
import AppShell from '@/components/layout/AppShell';

// The gallery branch of the route-group split (this story). AppShell moved OFF the root layout
// and onto this group: it is mounted on every route it wraps, and the battle route must not wear
// it — the lab mockup's header is the battle title, with no wordmark and no nav
// (petri-dish-lab-mode.html:647-656), and two stacked headers is not a cosmetic problem because
// Story 2.4's auto-fit canvas sizes off the space the chrome leaves.
//
// The alternative — teaching AppShell to branch on usePathname() — puts route knowledge inside a
// presentational shell and grows a branch per route forever. Route groups cost one file move,
// once. Parentheses do NOT appear in the URL: `(gallery)/page.tsx` still serves `/`.
//
// AppShell owns the <main> landmark for this branch and is otherwise unchanged.
export default function GalleryLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}

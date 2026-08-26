import AppShell from '@/components/layout/AppShell';
import { BackLink, Notice, NoticeText, NoticeTitle } from '@/components/layout/Notice';

// Next renders this file under the ROOT layout ONLY — route-group layouts do not wrap it, because
// an unmatched URL belongs to no group. That is why the shell is mounted HERE explicitly rather
// than inherited: Story 2.1 moved AppShell off the root layout and onto app/(gallery)/layout.tsx
// (so the battle route could wear its own chrome), which silently took the wordmark, the nav and
// the <main> landmark off every 404 as a side effect. Verified before the fix: out/404.html and
// out/_not-found.html contained zero <nav> and zero <main>, where out/index.html had one of each.
// Caught in Story 2.1 code review and resolved by Sidiar (2026-08-26) as "restore it now".
//
// ⚠️ Any future route group that also needs the shell must mount it in its own layout. There is no
// inheritance path from a group layout to this file, so a green suite here says nothing about them.
//
// Stays a SERVER component: it renders client components (AppShell, Notice) but holds no state of
// its own, and the root layout's AppProviders already supplies the MUI theme above it.
export default function NotFound() {
  return (
    <AppShell>
      {/* gutters={false}: AppShell's <main> already pads 32px. The battle route's notices pad
          themselves because that layout's <main> is deliberately unpadded — see Notice.tsx. */}
      <Notice gutters={false}>
        <NoticeTitle>Page Not Found</NoticeTitle>
        <NoticeText>
          This address does not match anything in the studio. It may be mistyped, or the page may
          have moved.
        </NoticeText>
        <BackLink href="/">Back to Gallery</BackLink>
      </Notice>
    </AppShell>
  );
}

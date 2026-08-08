// Fixed 'en-US', not the user locale: the MVP has no i18n, and an undefined locale makes every
// date assertion depend on the runner's ICU default — green locally, red on CI. Module scope, not
// per render: constructing an Intl.DateTimeFormat is the expensive part.
const FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

// `updatedAt` is a required BattleSummary field (never optional) — this is FR-7.3's single
// "Date created / last modified" value: it equals a battle's creation time until the battle is
// first edited, then tracks the edit. No undefined-date placeholder branch exists because there
// is no longer a caller that can pass one (2026-08-08, Story 1.10 follow-up).
export function formatBattleDate(date: Date): string {
  return FORMATTER.format(date);
}

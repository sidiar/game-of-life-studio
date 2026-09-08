// Fixed 'en-US' AND a fixed 'UTC' zone, not the user locale or the host zone: the MVP has no i18n,
// and leaving either undefined makes the rendered date depend on the machine — an undefined locale
// picks up the runner's ICU default, and an undefined zone shifts the calendar day for any instant
// near a UTC midnight (a 09:00Z timestamp renders as the previous day at UTC-10 or further west).
// Both produce the same failure: green locally, red on CI, or vice versa. Module scope, not per
// render: constructing an Intl.DateTimeFormat is the expensive part.
const FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

// `updatedAt` is a required BattleSummary field (never optional) — this is FR-7.3's single
// "Date created / last modified" value: it equals a battle's creation time until the battle is
// first edited, then tracks the edit.
export function formatBattleDate(date: Date): string {
  return FORMATTER.format(date);
}

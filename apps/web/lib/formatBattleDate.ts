// Fixed 'en-US', not the user locale: the MVP has no i18n, and an undefined locale makes every
// date assertion depend on the runner's ICU default — green locally, red on CI. Module scope, not
// per render: constructing an Intl.DateTimeFormat is the expensive part.
const FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

// Story 1.10 AC3: createdAt is optional on BattleSummary (Task 1) — a stored battle written
// before this story shipped simply has none. Never format `undefined` through Intl (it throws),
// and never render "Invalid Date": a stable placeholder keeps the tile's metadata panel readable.
const UNKNOWN_DATE_PLACEHOLDER = 'Unknown';

export function formatBattleDate(date: Date | undefined): string {
  if (date === undefined) return UNKNOWN_DATE_PLACEHOLDER;
  return FORMATTER.format(date);
}

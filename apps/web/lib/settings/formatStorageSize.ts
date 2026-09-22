// 'en-US' is a fixed pin, not the user's locale — the same reasoning as formatBattleDate.ts: the
// MVP has no i18n, and an unpinned locale renders "12,3 KB" on de-DE (comma decimal separator)
// where this file's own tests expect "12.3 KB", green locally and red on a differently-configured
// CI runner or vice versa.
//
// Binary units (1024), not decimal (1000): the quota this figure is measured against is specified
// in binary units (Chromium: 10 MiB per origin; RFC-006: "5 MB per-origin"), and so is what
// developer tooling reports — the number the user sees stays comparable to the ceiling it is
// measured against.
//
// Precision: one decimal below 1 MiB (the mockup: "2.4 KB"), two from 1 MiB. A single saved
// 100×60 battle is roughly 12-24 KB ~= 0.01-0.02 MB — at one decimal in MB the figure would not
// move when the user saves a battle, and AC4's "refreshes when data changes" would be true and
// invisible.
//
// Precondition: `bytes` is a finite integer >= 0 — the AR-14 meter never produces anything else
// (it only ever sums string lengths). No clamping code guards an input that cannot occur.
const KB = 1024;
const MB = KB * 1024;

export function formatStorageSize(bytes: number): string {
  if (bytes < MB) {
    const kb = bytes / KB;
    return `${kb.toLocaleString('en-US', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} KB`;
  }
  const mb = bytes / MB;
  return `${mb.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} MB`;
}

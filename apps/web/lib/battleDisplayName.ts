// BattleSummarySchema.name is `z.string().max(100)` with no lower bound, so "" parses and lists.
// An empty <h2>/<h1> is both unidentifiable and an axe `empty-heading` violation, which would fail
// a whole page's zero-violations assertion over one bad record.
//
// Title case ("Battle", not "battle") is what four authority sites specify —
// component-tree-battle-page.md §3.2 and epics.md's Story 2.1/2.2/2.11 ACs. The shipped
// Story 1.13 constant used a lowercase "b" with no recorded rationale; the specs win.
const UNTITLED_BATTLE = 'Untitled Battle';

/**
 * The single fallback title for a battle with no usable name.
 *
 * Lives in lib/, not in a component: Story 1.13 exported it from `<BattleTile>` so the tile's own
 * heading and the delete dialog naming the same battle could not drift. `<BattleHeader>` is now the
 * third consumer, and a battle component importing from a gallery component would be the wrong
 * seam — so the helper moves to the layer both already depend on rather than growing a second copy.
 */
export function battleDisplayName(name: string): string {
  return name.trim() === '' ? UNTITLED_BATTLE : name;
}

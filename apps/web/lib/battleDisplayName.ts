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
/**
 * Zero-width and formatting characters that `String.prototype.trim` does NOT remove — they are not
 * ECMAScript `WhiteSpace` — and that render as nothing:
 *
 *   U+00AD SOFT HYPHEN · U+200B ZERO WIDTH SPACE · U+200C ZWNJ · U+200D ZWJ · U+200E LRM ·
 *   U+200F RLM · U+2060 WORD JOINER · U+FEFF ZERO WIDTH NO-BREAK SPACE
 *
 * Story 2.13 settles `deferred-work.md`'s ":349" entry, which named this story as "the first that
 * persists a name the user typed and therefore the first with a reason to decide what an invisible
 * name IS". The decision: a name that renders as nothing IS empty.
 *
 * Without this, a paste out of a web page produces an `<h1>` and a browser tab with no visible
 * text — the exact condition this helper exists to prevent — and axe does not catch it, because
 * its `text.sanitize` does not strip U+200B and `empty-heading` therefore sees non-empty text.
 *
 * ⚠️ This widens what THREE surfaces render for the same stored record: the battle header, the
 * Gallery tiles and the delete dialog all resolve their title through here. That is the intended
 * consequence and the reason it needed a decision rather than a patch — all three previously
 * rendered a blank where a title belongs.
 *
 * ⚠️ DISPLAY only. The stored `name` stays exactly what the user typed, including a name made of
 * these characters: the save path persists `battleName` raw (`<BattlePage>`), and silently
 * rewriting a user's data at the boundary between "what is stored" and "what is shown" is a much
 * larger claim than choosing a fallback title.
 */
const INVISIBLE_CHARACTERS = /[\u00AD\u200B-\u200F\u2060\uFEFF]/gu;

export function battleDisplayName(name: string): string {
  return name.replace(INVISIBLE_CHARACTERS, '').trim() === '' ? UNTITLED_BATTLE : name;
}

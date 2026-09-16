import { ageShadeFor, displayColor, MAX_AGE_SHADE } from '@/lib/palette/displayColor';

/**
 * The Aging Degradation field's example strip colours, pure (Story 4.7, FR-2.4/FR-5.7). Lives in
 * `lib` rather than the component, the `dominance.ts` precedent: this is a derivation with an
 * exact unit test, not presentation.
 *
 * Goes through `ageShadeFor` — never `agingEnabled ? age : 7` written out inline — because
 * `displayColor.ts`'s own doc records that the intuitive form is a spec violation (Decision B.2:
 * a non-aging organism's group key is `(token, 7)`, the identity shade, not `(token, 0)`). Reusing
 * the function keeps the strip unable to disagree with what `refToFillGroup.ts` (Story 3.9)
 * actually paints for this organism.
 *
 * One canvas colour string per age `0..MAX_AGE_SHADE`, exactly as the renderer would paint a cell
 * of that age for this organism: `displayColor(token, ageShadeFor(age, agingEnabled))`. Off —
 * every entry is the identity colour; On — the FR-5.7 ramp. Length is `MAX_AGE_SHADE + 1`, derived
 * — never a literal 8.
 */
export function agingExampleColors(colorToken: string, agingEnabled: boolean): readonly string[] {
  const colors: string[] = [];
  for (let age = 0; age <= MAX_AGE_SHADE; age++) {
    colors.push(displayColor(colorToken, ageShadeFor(age, agingEnabled)));
  }
  return colors;
}

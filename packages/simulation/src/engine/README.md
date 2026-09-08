# `src/engine/` — the domain-blind rules engine

Everything in this directory is **generic over an arbitrary subject `S`** and an **opaque
`Payload`**. No file here may name a cell, an organism, a grid, an age or an action (AR-16),
and none may import `@gol/domain` or any other GoL source (AR-40).

That is not a convention. `eslint.config.mjs` carries a `no-restricted-imports` block scoped to
this directory that bans `@gol/*` and any relative path escaping it. A GoL import here would
typecheck, pass every test, and silently end the reusability AR-16 exists for — which is why the
boundary is a lint rule and not a comment. It is the same move the repo made for
`apps/web/test-support/recordingContext2d` (2026-09-08).

## The sibling directory

Story 3.2's Game of Life layer — `CellSubject`, the five GoL properties, `resolveCellAction` —
belongs in `src/gol/`, **not here**. It is a _caller_ of this engine. If a later engine story
appears to need a file in this directory edited, the abstraction was drawn wrong; say so rather
than reaching across the boundary.

## Two types named `Condition`

`@gol/domain` exports a concrete, Zod-inferred `Condition`; `rule.ts` here exports the generic one.
They coexist across packages, but Story 3.2 imports both into one file and will have to alias one.
The names here are RFC-004's and stay as they are.

## The AR-40 proof

`rulesEngine.test.ts` proves domain-agnosticism with a library-loan subject. Its import list is
part of the assertion, and it sits inside this directory so the lint rule enforces that for free.
The AC5 assignability check lives **outside** at `src/domainRuleSetCompatibility.test.ts` — it must
import `@gol/domain`, and it has a different job.

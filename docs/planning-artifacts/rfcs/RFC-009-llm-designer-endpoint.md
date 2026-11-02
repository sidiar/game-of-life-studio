# RFC-009: The LLM Designer — Endpoint, Port and Measured Facts

**Status:** Proposed
**Date:** 2026-11-01
**Author:** Architecture Team

## Summary

This RFC defines **how the studio talks to an LLM**, for the "Describe an Organism" feature (`docs/specs/spec-describe-an-organism/`). The spec says *what* the feature does; this RFC owns *where each piece runs, what crosses each boundary, and how cost, abuse and failure are bounded*. It is the first part of the system that is not static: [Decision L](/docs/planning-artifacts/architecture.md#decision-l--one-llm-endpoint-outside-the-static-studio-reached-only-through-an-injected-port) amends NFR-6.1 for this feature alone and makes this RFC the owner of the endpoint.

The guiding decisions:

1. **One small endpoint, off the static site.** A Cloudflare Worker with one Durable Object holds the provider key, the monthly spend ledger and the per-visitor rate-limit windows. The static export (`output: 'export'`, Decision K) is unchanged and is still deployed to GitHub Pages.
2. **One port, three implementations.** `OrganismDesigner` is an interface in a new pure package, `@gol/designer`. The browser gets an HTTP client, injected at the page boundary like the repositories (AR-2/27). The endpoint and the eval suite share one provider-backed implementation. Tests get a fake from `@gol/test-utils`.
3. **The engine judges, in the browser.** Facts are measured by a new `facts/` layer in `@gol/simulation`, using a counting variant of the session compile that Play mode never builds, so the 60 FPS path pays nothing. The rule checks are pure code in the same package and work offline.
4. **The cost cap is a ledger, not a hope.** Every model call reserves its worst-case cost before it starts and settles the actual cost after, inside a single-writer Durable Object. The cap can therefore not be overshot by concurrent requests.
5. **Prompts are versioned server-side.** A prompt version pins its system text, output schema, model and parameters. It is released immutably, and switching versions is an endpoint deploy, never a site release.

## Links

- [Main Architecture Document](/docs/planning-artifacts/architecture.md) — Decision L (the cross-cutting rules this RFC operates under), Decision F (device-local data), Decision K (static routes), M3 (the editor preview instance), M10 (cross-action precedence), M15 (phase-partitioned evaluators)
- [SPEC: Describe an Organism](/docs/specs/spec-describe-an-organism/SPEC.md) and its companions `entry-points.md`, `failure-modes.md`, `behaviour-facts.md`, `eval-cases.md`, `delivery-order.md`
- [Product Requirements Document](/docs/planning-artifacts/prds/prd-GameOfLife-2026-05-26/prd.md) — NFR-6.1 (amended by Decision L), NFR-6.2, FR-2.5, FR-9.5, FR-5.4
- [RFC-001: Multi-Mode Architecture](/docs/planning-artifacts/rfcs/RFC-001-multi-mode-architecture.md) — the injected repository seam the port mirrors
- [RFC-003: Frontend UI Architecture](/docs/planning-artifacts/rfcs/RFC-003-frontend-ui-architecture.md) — dynamic imports, accessibility
- [RFC-004: Rules Engine & Simulation](/docs/planning-artifacts/rfcs/RFC-004-simulation-rules-engine.md) — the three-phase strategy, the session compile, age saturation (§3.3)
- [RFC-005: Application State](/docs/planning-artifacts/rfcs/RFC-005-application-state-modes-undo.md) — the editor's dirty scope, the preview's `useSimulation` instance
- [RFC-008: Testing & Tooling Strategy](/docs/planning-artifacts/rfcs/RFC-008-testing-and-tooling-strategy.md) — test layers, coverage, the bundle gate

## Overview

### Purpose & Goals

**Primary Purpose:** let a visitor of the public, static studio use an LLM to create, name and explain organisms, without giving up anything the static studio guarantees: it costs nothing to host, works offline, keeps user data on the device, and is provable by tests.

**Goals:**
1. **The key never reaches the browser**, and no user text or IP address is stored (SPEC constraints).
2. **Spend cannot exceed the monthly cap**, by construction, and a visitor cannot exhaust it alone.
3. **Every result is checked by code before a user sees it**: `OrganismSchema`, rule compilation, the trait claims and the explanation's tags.
4. **No new cost on existing paths**: Play mode's frame budget (NFR-1.1), each route's first-load JS (AR-3), and the offline studio.
5. **Testable without a model**: every outcome in `failure-modes.md` is reachable from a fake, and the paid eval runs the production code path.

### Background

Until now the architecture has had one rule about servers: there are none (NFR-6.1, `project-context.md`). Connected mode (RFC-001 §4, RFC-006 Decision 9) was the only planned server, and it is post-MVP. The spec needs a server for one reason only: the provider key and the spend counter cannot live in a browser. Everything else (validation, measurement, warnings) can and does stay in the client. That is why this RFC keeps the endpoint as small as possible: it holds the key, the prompts and the counters, and nothing else.

The engine was built to be reused on independent grids (M3, Story 4.15's draft preview). The fact runner is the third such reuse, and the first that needs to *observe* the engine (which rule fired) and not only run it.

## High Level Design Proposal

```
 Browser (static export, GitHub Pages)                     Cloudflare (free plan)
┌──────────────────────────────────────────────┐   HTTPS   ┌────────────────────────────────────┐
│ page boundary: createRepositories()           │  POST     │ Worker  apps/designer-endpoint     │
│                createDesigner() ──► HTTP port ├──────────►│  validate request (Zod)            │
│                                               │  /v1/design│ rate limit ─┐                      │
│ ✨ triggers ─► @gol/designer orchestration     │◄──────────┤  ledger ────┼─► Durable Object     │
│                 (describe + trait repair)     │  outcome  │  provider designer ─► Anthropic API│
│                 ▲                             │           │  (prompts, schema repair)          │
│ @gol/simulation facts/ (measure, rule checks) │           │  one log record per request        │
└──────────────────────────────────────────────┘           └────────────────────────────────────┘
          eval suite (dev machine / manual CI job) ─► provider designer ─► Anthropic API (never the Worker)
```

### Decision 1: Endpoint runtime and hosting — a Cloudflare Worker with one Durable Object class

**Decision.** The endpoint is a new workspace, `apps/designer-endpoint`, deployed as a **Cloudflare Worker** on the free plan, with one **SQLite-backed Durable Object** class (`DesignerLedger`) for every piece of state it keeps. It is deployed by its own manually started CI job (`workflow_dispatch`, a Cloudflare API token secret), never by the site's `v*` tag deploy, so the two release independently.

`apps/web` cannot host it: under `output: 'export'` the prerendered set is the whole reachable set (Decision K), so there is nothing to run a request handler. `apps/api/` stays reserved for Connected mode (RFC-001 §4), which is a different, post-MVP server.

**State the endpoint keeps, and nothing else:**

| State | Where | Key | Lifetime | Content |
|---|---|---|---|---|
| Monthly ledger | `DesignerLedger` instance `ledger:<YYYY-MM>` (UTC month) | the month | kept, for the operator | reserved and spent amount (micro-USD), request counts by prompt version × outcome, token totals |
| Visitor windows | `DesignerLedger` instance `visitors` | HMAC-SHA-256 of the visitor token with a secret salt | deleted by an alarm when the longest window ends | request timestamps inside the window |
| IP throttle | the Worker's Rate Limiting binding (or the isolate's memory) | client IP | in memory, the window only | a counter. Never written to storage or logs (SPEC constraint) |

No request field is stored. User text exists only in the Worker's memory for the life of the request.

**The cap (Goal 2).** Before each model call, the Worker asks the ledger to **reserve** that call's worst-case cost: the UTF-8 byte length of the whole input (an upper bound on its tokens) at the input price, plus the prompt version's `max_tokens` at the output price. The ledger refuses when `spent + reserved + this > cap`, and the request ends as `budget_exhausted`. After the call, the ledger **settles** the reservation to the actual cost from the response's `usage` (cache reads and writes priced as such). A Durable Object processes one request at a time, so the check and the reservation are atomic, and concurrent requests cannot overshoot. The cap (`MONTHLY_CAP_USD`) is set in the provider's billing currency at a value whose euro equivalent stays under the spec's ~€5. As a backstop against a bug in this code, the provider workspace that owns the key also gets the provider's own monthly spend limit, set slightly above the cap. That limit is a Console setting whose availability for this account the endpoint story confirms. The design does not depend on it.

**The rate limit.** Per visitor token: **10 requests per 10 minutes and 60 per UTC day** (Worker variables, tunable without a client release). A Describe whose trait check needs a repair costs two requests (Decision 5). On top of that, a per-IP throttle in memory (e.g. 30 requests per minute per isolate or per Rate Limiting key) blunts a script that mints a new token per request. The monthly cap is the final backstop, as the spec says. Requests without a well-formed token (a UUID v4) are refused as `rate_limited` before any model call.

**Hosting cost.** The Workers free plan and SQLite-backed Durable Objects on the free plan keep hosting at $0/month (NFR-6.2). The only spend is the provider's, under the cap. Free-plan limits that shape this design: **10 ms of CPU per invocation** (waiting on the provider does not count), which is why the endpoint never simulates (Decision 6), and the daily request quota, which is far above what the rate limits allow. Checked when this RFC was written: Durable Objects are available on Workers Free with the SQLite backend only (100,000 requests/day, 100,000 rows written/day; [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)). The 10 ms CPU figure is from Cloudflare's Workers limits and was not re-checked for this RFC. The endpoint story confirms both on a live Worker before relying on them.

**Alternatives rejected:**
- **Workers KV for the counters.** It is eventually consistent, so two requests at the same moment can both pass a cap check. A "hard" cap built on it is not hard. Its free-plan write quota is also low.
- **Vercel or Netlify functions plus a hosted Redis (e.g. Upstash).** This works, but it means two vendors and two free tiers to monitor for one feature. The site does not live on Vercel, so co-location buys nothing.
- **AWS Lambda + DynamoDB conditional writes.** This is a correct counter, but IAM, Function URLs and a second account are a large setup for a 2-endpoint service.
- **Supabase Edge Functions + Postgres.** Correct counters, but free projects pause when idle, which the first visitor after a quiet week would experience as `unavailable`.
- **Dropping static export to host a Next.js route.** Rejected for the reasons in Decision K.4: it reverses NFR-6 for the whole site to buy one endpoint.
- **Calling the provider from the browser** (with the key, or with bring-your-own-key). Ruled out by the SPEC: the key never reaches the browser.

### Decision 2: The model port — `OrganismDesigner` in `@gol/designer`, injected at the page boundary

**Decision.** A new pure package, **`packages/designer` (`@gol/designer`)**, owns the contract shared by browser, endpoint and eval: the port interface, the request and response schemas (Decision 4), the outcome vocabulary, the output validators, the Describe orchestration (Decision 5) and the fact-run protocol constants. It depends on `@gol/domain` and `@gol/simulation`, has no DOM types (`lib: ["ES2022"]`, like every package), no `fetch`, no provider SDK, and no prompt text. Its pure logic is core and carries the same ≥90% per-file coverage gate as `domain` and `simulation` (NFR-5.1, AR-39).

```ts
// @gol/designer — the port. Every method resolves; none throws for an expected outcome.
export interface OrganismDesigner {
  describe(request: DescribeRequest, signal: AbortSignal): Promise<DesignerResult<DescribeOutput>>;
  refine(request: RefineRequest, signal: AbortSignal): Promise<DesignerResult<DescribeOutput>>;
  suggestNames(request: NamesRequest, signal: AbortSignal): Promise<DesignerResult<NamesOutput>>;
  explain(request: ExplainRequest, signal: AbortSignal): Promise<DesignerResult<ExplainOutput>>;
  status(signal: AbortSignal): Promise<DesignerStatus>; // available | budget_exhausted | not_configured
}
```

(`AbortSignal` is declared structurally in the package, so it needs no DOM lib.)

**The three implementations:**

| Implementation | Lives in | Used by | What it does |
|---|---|---|---|
| `createHttpDesigner({ endpoint, visitorToken })` | `apps/web/lib/designer/` | the app | `fetch` to the Worker, parses the response with the shared schemas, maps network failure, non-200 and an unparseable body to `unavailable`, and the client deadline to `timeout` |
| `createProviderDesigner({ apiKey, prompts })` | `apps/designer-endpoint/src/provider/` | the Worker and the eval suite | builds the prompt for the active (or pinned) version, calls the provider through its official TypeScript SDK, runs the shared validators and the one schema repair |
| `createFakeDesigner(script)` | `@gol/test-utils` | unit tests (and, through `page.route`, e2e) | returns scripted outcomes per call, so each `failure-modes.md` row and each repair path is reachable |

**Injection.** `apps/web/lib/designerFactory.ts` exports `createDesigner()`, called **once at the page boundary** beside `createRepositories()` and passed down as a prop typed as the interface, exactly like the repositories (AR-2/27). No Context, no module singleton, and no component imports `createHttpDesigner`. The returned port is **lazy**: its methods `import()` the HTTP client on first use, so the port costs no first-load JS (Decision 10). The Editor is shared, so every page that mounts it (`/organisms`, `/battle`, `/battle/new`) passes the port down.

**The visitor token** is minted by the browser (`crypto.randomUUID()`) on first use and kept under `gol:visitor` by `@gol/persistence`. It joins `STORAGE_KEYS` (so the storage meter counts it) but not the data-key set, so `clearAll()`, Import and every export leave it alone, the same treatment as `gol:settings` (Decision F, Decision L.4). It reaches the HTTP client through the factory, never through a component.

**e2e.** The static build has no fake to switch to, and adding one would ship test code. e2e builds with `NEXT_PUBLIC_DESIGNER_ENDPOINT` set to a dummy origin and answers it with Playwright's `page.route`, using response bodies produced from the same `createFakeDesigner` scripts. This also tests the real HTTP client and the response parsing.

**Alternatives rejected:**
- **The interface in `apps/web/lib`.** The endpoint and the eval suite must implement it too, and neither may depend on `apps/web`.
- **Adding the designer to `AppRepositories`.** It persists nothing. Putting it there would make "repository" mean "anything injected" and would put a network client inside `@gol/persistence`.
- **Prompts and the provider client in `@gol/designer`** (behind a subpath export). That would put the provider SDK in the dependency tree of `apps/web`, and only a lint rule would stop the system prompt from reaching the bundle. In the endpoint workspace, the dependency graph enforces it.

### Decision 3: The endpoint URL reaches the browser through one read-point

**Decision.** A second build-time variable, **`NEXT_PUBLIC_DESIGNER_ENDPOINT`**, gets the same treatment as `NEXT_PUBLIC_MODE`: **only `apps/web/lib/designerEndpoint.ts` may read it**, by direct property access, because `NEXT_PUBLIC_*` is string-inlined only for that form.

```ts
// apps/web/lib/designerEndpoint.ts
export const DESIGNER_ENDPOINT: string | null = parseEndpoint(process.env.NEXT_PUBLIC_DESIGNER_ENDPOINT);
```

`parseEndpoint` accepts an `https:` URL (or `http://localhost` for development) and returns `null` for unset, empty or malformed values. `null` means **not configured**: `createDesigner()` returns a port whose `status()` is `not_configured` and whose requests resolve `unavailable` without touching the network. The ✨ triggers render disabled with the reason, the ✨ AI tab says the designer is not set up in this build, and nothing else changes. A fork or a local build gets exactly that. The release build sets the variable from a repository variable in the tag job, beside the existing build step. `next.config.mjs` does not read it: it changes no build output except the inlined string.

The rule generalises the existing one: **each `NEXT_PUBLIC_*` variable has exactly one read-point file in `apps/web/lib`**, and Epic 8 adds a lint rule (`no-restricted-syntax` on `process.env.NEXT_PUBLIC_*` outside those files) so the rule stops depending on discipline alone.

**Alternatives rejected:**
- **Reading it in `lib/mode.ts`.** That file is the mode flag, and `next.config.mjs` must default identically to it. Mixing an unrelated value into it couples the two invariants.
- **A runtime config file (`/designer.json`) fetched at load.** It would let one build point at different endpoints, which nothing needs, and it adds a request to every page load.
- **A hardcoded production URL.** Every fork would then call the real endpoint and spend its budget.

### Decision 4: Request and response schemas, prompts and model

**One route, four request types.** `POST /v1/design` takes `DesignerRequestSchema`, a Zod discriminated union on `type`; `GET /v1/status` takes nothing and calls no model. Every response is HTTP 200 with `DesignerResponseSchema`: `{ outcome, promptVersion?, retryAfterSeconds?, result? }`. Only `ok` carries a `result`. Any other status code, or a body that fails the schema, is `unavailable` on the client. The outcome vocabulary is `DesignerOutcomeSchema`, a `z.enum` of the ids in `failure-modes.md`. `ok_mismatch` is in the vocabulary but is never sent by the endpoint: the client produces it after the trait check (Decision 5).

| `type` | Capability | Request (besides `visitor`) | `result` on `ok` |
|---|---|---|---|
| `describe` | CAP-1/3/4 | `prompt` (1–280 characters, FR-9.5). Optional `traitRepair: { draft, claims, measured }` | `DescribeOutput` |
| `refine` | CAP-5 | `draft` as it stands in the Editor, hand edits included; `history` (the session's prompts and follow-ups, ≤ 10 turns); `instruction` (≤ 280) | `DescribeOutput` |
| `names` | CAP-8 | `organism` (name, description, rules); `libraryNames` (for duplicates only); `exclude` (names already shown this session) | `{ names: [5 × string] }` |
| `explain` | CAP-9 | `organism` (rules with ids, description, name); `facts`; `warnings` | `{ sentences: TaggedSentence[] }` |

Each request schema bounds its sizes (rules ≤ 50, conditions per rule ≤ 8, library names ≤ 500, body ≤ 32 KB), so the worst-case input cost of Decision 1 is bounded too.

**`DescribeOutput` — the model-supplied fields only.**

```ts
{
  kind: 'organism',
  name, dominance, agingEnabled,              // as OrganismSchema constrains them
  rules: [{ keepId?, conditions, action, summary }],   // summary non-empty, ≤ 120 (FR-2.5, CAP-4)
  claims: [{ fact: 'trend' | 'oscillation' | 'maxAge' | 'extinction', value }],   // possibly empty (CAP-3)
} | { kind: 'decline', reason: 'off_topic' | 'unsafe' | 'injection' }
```

- **The app mints the system fields** (SPEC constraint): the organism `id`, each rule's `id` and `contentHash` (`apps/web/lib/organisms/ruleContentHash.ts`), and `schemaVersion`. A refine may set `keepId` to an input rule's id, which the app keeps only if that id was in the request; every other rule gets a new id. `contentHash` is always recomputed. The draft's `description` is the prompt as typed, set by the app, never by the model. `colorToken` is not asked of the model: the existing next-unused default applies (FR-2.3). The SPEC's assumption allows the model to choose a colour, but that would put the palette registry in the request for no behavioural value.
- **Validation (CAP-2)** is one shared function, `validateDescribeOutput`, in `@gol/designer`. It assembles a candidate with placeholder system fields and passes it through `OrganismSchema`, `validateSurvivalRules` (the session compile's own sweep, M12), a check that no condition is on `organismType`, and the claim vocabulary. The endpoint runs it to decide on the schema repair. The client runs it again after minting, because the client parses at its own boundary and does not trust the network.
- **Declines.** `off_topic`, `unsafe` and `injection` are the model's `decline` output. A provider `refusal` stop reason also maps to `unsafe`. The structured output is itself the main defence against injection (D3): the only free text that can reach the user is a name (≤ 50) or a summary (≤ 120), so "print your system prompt" has nowhere to go.

**`TaggedSentence` (CAP-9, the structured-explanation constraint).**

```ts
{ text, tag: { kind: 'fact', fact, run: 'solo' | 'withRival', value, ruleId? }
           | { kind: 'rule', ruleId }
           | { kind: 'warning', warning, ruleIds } }
```

`validateExplainOutput` rejects the whole response (schema repair, then `invalid_output`) when any of these hold: a sentence has no tag; a fact tag names a fact or run it was not given, or a `value` that differs from the measured one (compared on a canonical form, Decision 6); a rule or warning id does not exist; a `neverFired` or `needsTarget` rule, or a warning it was given, is not named by some tag ("rules that never fired and every warning are named", CAP-9).

**`names`.** `validateNamesOutput` requires exactly 5 names, distinct case-insensitively, 1–`MAX_ORGANISM_NAME_LENGTH` characters, none equal to a library name or an excluded name, none on the endpoint's blocklist (N4). The blocklist ships only with the endpoint.

**Prompts and versions.** Prompts live in `apps/designer-endpoint/src/prompts/`, one module per version, for example `names@1`. A **prompt version** pins together the system text, the output JSON Schema (generated from the Zod schema with Zod 4's `z.toJSONSchema` and passed as the provider's structured-output format), the model id, the effort and `max_tokens`, and the price table used by the ledger. A released version is **immutable**: a test pins each released version's content hash, so editing one fails CI and a change is a new version, the same rule `eval-cases.md` applies to its prompts. `src/prompts/active.ts` maps each request type to its active version. Changing it is a one-line endpoint change, deployed by the endpoint's own job, with no client release (CAP-7). The client never sees prompt text, only the `promptVersion` id echoed in responses.

**Model.** The model is chosen per prompt version, so changing it is a new version that has to pass the eval. The provider is Anthropic, called with its official TypeScript SDK, with SDK retries off (`maxRetries: 0`) because the endpoint owns the call budget and the deadline. The approximate per-call costs, at list prices when this RFC was written and with a ~4 k-token input and ~1.5 k-token output (thinking included), are:

| Model | ≈ cost per call | Calls inside a $5 cap |
|---|---|---|
| `claude-opus-5-5` | $0.046 | ~110 |
| `claude-sonnet-5-5` | $0.023 | ~220 |
| `claude-haiku-5-5` | $0.0012 | ~4,000 |

With a public audience and a ~€5 cap, the cost per call decides how many visitors the feature can serve in a month. **The first prompt version of each request type is pinned to the cheapest of these models that meets that type's eval threshold at its version**, tried from the cheapest up. The eval report records the choice. This is a procedure, not a pre-picked model. The operator confirms the pin when Epic 8's first story records its first eval report.

**Alternatives rejected:**
- **Four routes** (`/v1/names`, …). The rate limit, ledger, logging and outcome mapping are identical, so one discriminated union says it once. The `type` field is also the CAP-7 record's request type.
- **Free-text model output parsed with a regex.** Unverifiable (CAP-9) and the main injection surface.
- **Prompt text in the client** (sent with each request). It leaks the system prompt, lets any caller rewrite it, and makes a prompt change a site release.

### Decision 5: Call budget and repair loops — schema repair at the endpoint, trait repair in the client

**Decision.**
- **The endpoint runs the schema repair**, inside one HTTP request: the first call; if the output fails its validator, **one** repair call carrying the validation errors; if that fails too, `invalid_output`. So one HTTP request makes **at most 2 model calls**, a bound enforced server-side for every request type (CAP-5/8/9's budget in full).
- **The client runs the trait repair** for Describe, because only the client can measure (Decision 6). The orchestration is one shared function in `@gol/designer`, `describeWithTraitCheck(designer, measure, request)`, used by the app and the eval suite alike:
  1. `designer.describe({ prompt })` → a valid draft (or a failure outcome, which ends here).
  2. If the draft has no claims, the result is `ok`. The fact runner is not even needed (CAP-3: an unclaimed trait is never compared).
  3. Otherwise measure the claimed traits. If all match → `ok`.
  4. On a mismatch, **one** `designer.describe({ prompt, traitRepair: { draft, claims, measured } })`. The endpoint serves a `traitRepair` request with **exactly one model call and no schema repair**, because a trait repair is never retried (SPEC call budget).
  5. Measure again. A match → `ok` with the repaired draft. A mismatch → `ok_mismatch` with the repaired draft and its measured traits. If the repair returned no valid draft, the result is `ok_mismatch` with the **first** draft, since it is valid and the user can still keep or tweak it.

  That bounds Describe at **3 model calls** (2 + 1) and **2 fact runs**, as the SPEC requires. The fake-model test asserts the call count for every path.
- **The deadline.** The client starts a 15 s deadline at the click and passes the remaining time with each request (`deadlineMs`). The endpoint does not start a repair call that cannot finish inside it (it answers `timeout`), and gives each model call its own timeout from the prompt version. Progress shows within 1 s because it is driven by the click, not by the response (`entry-points.md`).

**Alternatives rejected:**
- **All repairs in the client.** One extra round trip per schema repair, and the call bound would rest on client code that any caller can bypass. The server's 2-call bound would disappear.
- **All repairs at the endpoint.** The endpoint would have to simulate, which its 10 ms CPU limit forbids (Decision 1), and the facts would come from a different place than CAP-9's.
- **A server-held "attempt" token that links the trait repair to its first request.** It would let the endpoint count the 3 calls itself, but it adds state with user-linked lifetime. The trait repair is already rate-limited as an ordinary request and bounded to one call.

### Decision 6: The fact runner — `@gol/simulation`'s `facts/` layer, on the main thread in slices

**Decision.** A new directory, `packages/simulation/src/facts/`, measures the `behaviour-facts.md` catalogue. It is pure and DOM-free, has no classes and no module state (AR-16), and takes the grid size as a parameter (Decision A), with the spec's protocol (50×30, 3 seeds, 30 % fill, 200 generations) passed in from `@gol/designer`'s `FACT_RUN_PROTOCOL`.

**Counting `ruleFired` without touching Play mode.** `session/` gains `compileCountingSession(organisms, counters)`. It returns the same `CompiledSession` shape as `compileSession`, built from the same compiled conditions, but its evaluators also record which rule matched:
- `resolvesToDeath` adds one to the first matching Die rule. Phase 1 applies every match, so that count is the applied count.
- `resolveBirthSurvival` pushes the matching rule's index into a caller-owned list, **except for a `survive` match on a cell the organism does not hold**, which mirrors Phase 2's own drop. The pushed list is then aligned one-to-one with the `Claims` arrays (claims invariant 1), and the runner asserts the two lengths are equal each generation.
- The runner calls `deathPhase`, `birthSurvivalPhase` and `conflictPhase` itself, which is `threePhaseStep`'s composition. After Phase 3, claim `i` **applied** exactly when the cell's new occupant is `ref[i]`, so its rule's count goes up. This gives "how many times each rule's action applied" exactly, including a birth that lost a Dominance contest in the rival run. A test pins that this composition produces the same grids as `threePhaseStep` on the golden fixtures, so the two cannot drift.

Play mode, the preview and the benchmark keep calling `compileSession` and `threePhaseStep`, which are unchanged. The counting variant exists only in a measurement run, so the 60 FPS path pays nothing and `bench:check` is unaffected (NFR-1.1, AR-43).

**Determinism.** The soups are seeded, and so is the FR-5.4 tie-break generator (`createRng` with a fixed seed). Facts are measurements and must be "deterministic for the same rules" (`behaviour-facts.md`). That is the test-fixture convention, not production's fresh seed, and it is deliberate.

**The rival run.** When any rule has a `cellState: occupied` or `occupantNeighborCount` condition, or targets `conways-classic` by `organismType`, the same three soups are replayed with each live cell assigned to the subject or to `conways-classic` by a second seeded draw (50/50). Conway's Classic keeps its library Dominance. It is compiled under its real library id, so an `organismType` rule targeting it resolves. A rule whose `organismType` target is any other id resolves to `NO_MATCH_REF` and is reported as `needsTarget`.

**The facts, in engine terms** (as `behaviour-facts.md` defines them):
- `maxAge` is the highest `age` value any cell reaches. Age is 0 at birth and +1 per survived cycle, saturating at the session's `maxRelevantAge` = `max(7, highest age literal + 1)` (Decision B.5, `maxRelevantAge.ts`). A reached value equal to the saturation value is reported as `{ atLeast: N }` (shown as `≥ N`), never as an age at which cells die.
- `oscillation` compares the full engine state (occupant and age buffers) over gens 150–200 for the smallest period from 2 to 10. A state that is already static (period 1) is reported as `none`: otherwise a still life would also repeat at period 2 and read as "blinks". That reading is called out in the PR, since `behaviour-facts.md` does not say it.
- `trend`, `extinction`, `neverFired`, `needsRival` and `needsTarget` are as tabled in `behaviour-facts.md`. Every fact value has one canonical JSON form, which is what Decision 4's tag check compares.

**Where it runs: the main thread, in slices.** The run is small: 3 × 200 generations on 1,500 cells for one or two organisms, far below the benchmark's 100×60 × 20 organisms at ~6 ms per generation. The runner is incremental (`createBehaviourRun(…)` → `advance(maxGenerations)` / `facts()`), and the app advances it in slices of about 25 generations per task, so no task blocks input for long. It is loaded with `import()` on first use (Decision 10).

**Alternatives rejected:**
- **A counter inside `threePhaseStep` behind a flag.** Even a predictable branch per cell per organism is cost on the gated path, and it puts a measurement concern in the strategy.
- **A Web Worker.** `project-context.md` keeps the Worker as the documented escape hatch, not a tool to reach for, and the run does not need one. If measurement ever shows a slice blocking input, a worker can host the same pure runner without changing it.
- **Measuring at the endpoint.** Its CPU limit forbids it (Decision 1), and it would need the rules sent and the facts trusted from two places.

### Decision 7: The rule checks — pure code in `@gol/simulation`, exhaustive over a finite subject space

**Decision.** `packages/simulation/src/facts/ruleChecks.ts` exports `checkRules(rules) → RuleWarning[]` (`{ warning, ruleIds }`), for the five warnings in `behaviour-facts.md`. It lives beside the fact runner and not in `@gol/domain` because `shadowedByDie` is a statement about the three-phase strategy (death precedes survival, M10), and strategy semantics belong to `@gol/simulation`.

The checks are exact, not heuristic. A cell, from one organism's point of view, is a finite subject: `cellState` (3 values) × `neighborCount` and `occupantNeighborCount` with sum ≤ 8 (45 pairs) × `age`, which the rules' own literals partition into a small number of intervals (each comparison changes value only at a literal), × whether the occupant is a given `organismType`. Enumerating one representative per interval is sound and complete for these operators:
- `unsatisfiable`: no subject satisfies all of a rule's conditions.
- `shadowedByDie`: every subject that satisfies a Survive rule also satisfies **at least one Die rule** (the Die rules are ORed in Phase 1, so a disjunction is what matters). The warning lists the Survive rule and the Die rules involved.
- `bornOnLiving`, `surviveOnEmpty` and `noBornRule` are direct readings of the rules.

They run in the browser, need no endpoint, and are shown even when the explanation fails (E9, `entry-points.md`). They are also sent to the model as input for `explain`.

### Decision 8: The eval suite — in the endpoint workspace, through the provider designer, never through the Worker

**Decision.** The suite lives in `apps/designer-endpoint/eval/` and runs with:

```
ANTHROPIC_API_KEY=… npm run eval -w @gol/designer-endpoint -- [--prompt-version names@2] [--cases B,N,E,D,R]
```

from a developer machine, or from a `workflow_dispatch` CI job (`eval`) that uses a secret key from a separate provider workspace with its own spend limit. It is never part of `ci` or `ci:dev`, and never runs on a PR (SPEC: the paid suite runs on demand).

- **Same code path as production, minus the Worker.** It builds `createProviderDesigner` (the module the Worker uses) and runs Describe cases through `describeWithTraitCheck` with the real fact runner from `@gol/simulation`. So the prompt version, model, validators, schema repair and trait repair are the production ones. It does not touch the ledger or the rate limit, and so it neither eats the visitors' limit nor counts against the endpoint's cap (SPEC: LLM access constraint).
- **Judged by the engine.** Each case in `eval-cases.md` is a fixture plus a check written against the facts and the grid, never an LLM grader. Cases that need a person (language, name fit, prose) are printed for review and are outside the thresholds.
- **The pinned prompt version** is `src/prompts/active.ts`: by default the suite runs the versions production would serve. `--prompt-version` runs a candidate before it is made active. A PR that changes `active.ts` must include the eval report for the new version.
- **The report**, keyed by prompt version (CAP-7), is written to `docs/implementation-artifacts/eval-reports/<promptVersion>/<date>.md`. It lists each case's pass or fail, the thresholds (≥ 10/12 behavioural, 100 % naming, explain and decline), tokens, and **the run's cost**, computed from each response's `usage` and the version's price table. The spec's bound is about 40 cases × at most 3 calls.

**Alternatives rejected:**
- **A top-level `evals/` workspace.** It would need the prompts and provider designer exported from the endpoint, a second public surface for code that only these two consumers use.
- **Through the deployed endpoint.** It would consume the cap and the rate limit on every run, and test the network, not the prompt.

### Decision 9: Observability — one record per request at the endpoint, GoatCounter events in the client

**The CAP-7 record.** The Worker writes **one structured log line per `POST /v1/design`** (JSON on `console.log`), with: request type, prompt version, model, model-call count, input and output tokens (summed across calls, cache reads and writes separate), latency, and the outcome id. It carries **no visitor id, no IP and no text**. The same counts are added to the month's ledger, so the totals outlive the log retention. They are read with `GET /v1/ops/summary?month=YYYY-MM`, which needs an operator token (a Worker secret), and from the Cloudflare dashboard's logs for the per-request lines.

⚠️ **The platform's automatic invocation logs are turned off** (`[observability.logs] invocation_logs = false` in the Wrangler file; custom `console.log` lines are unaffected, [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)). Left on, they record request metadata including the client IP, which the SPEC forbids. Errors are logged as class and outcome only, never with a request body.

**GoatCounter events (CAP-7).** One event per use of each action and one per kept result, sent with the existing script's `count({ path, event: true })` and gated by the same `isProductionHost` check as page views:

| Event path | Counted when |
|---|---|
| `ai/use/describe`, `ai/use/names`, `ai/use/explain`, `ai/use/refine` | the action starts. A shortcut in the empty ✨ AI tab counts under the action it repeats |
| `ai/kept/describe` | a generated or refined organism is saved for the first time |
| `ai/kept/names` | a suggested name is picked |
| `ai/kept/explain` | "Use as description" is confirmed |

No event carries user text or the visitor id. The helper lives in `apps/web/components/analytics/` beside `GoatCounter.tsx`.

### Decision 10: The ✨ AI tab and the Editor — short, because RFC-003 and RFC-005 already decide most of it

- **Two tabs in the right column.** `OrganismEditorLayout`'s right column becomes MUI `Tabs` with **Preview & Test** and **✨ AI** (`entry-points.md`). Both panels stay **mounted**. The hidden one gets the `hidden` attribute, so it is out of the accessibility tree and the tab order. `PreviewPanel` gains an `active` prop and pauses its `useSimulation` instance when it becomes inactive, keeping its grid, generation and run state (M3, RFC-005 Decision 5). It does not resume on its own. The result dot is a visually hidden-labelled badge on the tab (RFC-003 Decision 5).
- **Create mode with a prefilled draft.** `useOrganismEditorModal` gains `requestCreateFromDraft(draft, session)`. The modal stays a create session (`organism: null`) and takes an optional `seed` that replaces the default seed. The dirty baseline stays the empty create seed, so an unsaved draft counts as changes and the existing unsaved-changes guard asks before discarding it (RFC-005 Decision 7). The AI history is local state of the modal and is discarded when it closes.
- **The Describe prompt dialog** is a dialog over the Library that shows progress and failures in place. On `ok` or `ok_mismatch`, the Editor opens only **after the dialog's exit transition**, and the outcome is published from the call site, the live-region rule `project-context.md` records from Story 4.18.
- **Bundle (AR-3, AR-35).** The ✨ AI tab content, the prompt dialog, the HTTP client and the fact runner each sit behind `next/dynamic` or `import()`. What stays in first-load is the ✨ trigger buttons, the tab strip and the lazy port. That growth is bounded by each route's 8 KB allowance per PR, with the baseline refreshed in the same PR.

## Risks & Mitigations

**Risk 1: A free-plan limit or term changes.**
- *Mitigation:* the endpoint is small and its storage is two Durable Object instances. Moving it to another host means rewriting the ledger adapter, not the contract. The feature degrades to `unavailable`, never the page (Decision L.5).

**Risk 2: The worst-case reservation is too pessimistic and refuses requests well below the cap.**
- *Mitigation:* the reservation is per call and released on settlement, so it only affects requests that run at the same moment as the last few cents of the month. `max_tokens` per prompt version is set from the eval's observed maximum plus margin.

**Risk 3: Token-minting abuse.**
- *Mitigation:* the in-memory IP throttle, the daily per-token limit, the hard cap, and the provider's own spend limit, in that order. A challenge (e.g. Cloudflare Turnstile) is a Future Extension if the summary shows abuse.

**Risk 4: The counting compile drifts from the real one.**
- *Mitigation:* both are built from the same compiled conditions; the per-phase composition is pinned against `threePhaseStep` on the golden fixtures; and a test asserts that `compileCountingSession`'s evaluators return the same actions as `compileSession`'s on random subjects (fast-check).

**Risk 5: The model meets its thresholds only on a costlier tier, and the cap then serves few visitors.**
- *Mitigation:* the procedure in Decision 4 makes the trade visible in the eval report before a version is pinned, and the operator decides. The rate limits are Worker variables and can be tightened without a client release.

**Risk 6: A `ruleFired` or `oscillation` reading differs from what the spec's author meant.**
- *Mitigation:* the readings this RFC adds (applied counts via claim alignment, period 1 as `none`, the 50/50 rival split) are listed in the PR for review, and each has a named fixture test.

**Risk 7: Privacy regressions through the platform rather than the code** (automatic logs, analytics, error trackers).
- *Mitigation:* Decision 9's ⚠️, plus a deployment checklist in the endpoint's README that the endpoint story verifies on the live Worker: invocation logs off, no tail consumers, no third-party error tracking.

## Alternatives Considered

**Alt 1: No endpoint at all — ship the feature only with bring-your-own-key.**
- *Rejected:* the SPEC rules it out (the key never reaches the browser), and the audience includes children, who have no keys.

**Alt 2: Connected mode first, with the LLM as one of its routes.**
- *Rejected:* Connected mode brings accounts, sync and a database (RFC-006 Decision 9). The feature needs none of them, and the SPEC's non-goals exclude accounts and server-side user content.

**Alt 3: Streaming tokens to the client.**
- *Rejected:* the output is a validated structure, so a partial stream is not showable. The SPEC accepts a 15 s p95 with progress, not streamed text.

## Future Extensions (explicitly out of scope)

- A human challenge (e.g. Turnstile) on the endpoint if the ledger shows token-minting abuse.
- A Web Worker for the fact runner if a slice is measured blocking input.
- Phase 2's simulation-as-a-tool agent (SPEC non-goal); it would reuse this port and the fact runner.
- More rule checks, such as a Born or Survive rule shadowed by an earlier rule of the same organism under first-match order.
- Provider failover (SPEC non-goal).

---

**Status:** Proposed (2026-11-01)

**Next Steps (implementation, in `delivery-order.md`'s order):**
1. CAP-8: `@gol/designer`, the Worker and its ledger, the HTTP port and its page-boundary injection, `gol:visitor`, the read-point and its lint rule, CAP-7 logging and events, CAP-6 handling, the ✨ AI tab.
2. CAP-9: `compileCountingSession`, the fact runner, the rule checks, `explain` with tag validation.
3. CAP-1–4: `describe`, `describeWithTraitCheck`, the prompt dialog, create mode with a seed.
4. CAP-5: `refine`.

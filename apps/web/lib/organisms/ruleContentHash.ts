import type { SurvivalRule } from '@gol/domain';

/**
 * The real `contentHash` generator (Story 4.16, AC7, FD1). RFC-004 §2.4 / AR-21 specify "a
 * deterministic hash over the canonicalized `{ conditions, payload }`"; Story 1.5 pinned the exact
 * scheme (`defaultWorkspace.ts:31-37`) so its two frozen literals and `@gol/test-utils`' eight mock
 * rules could be regenerated identically once a real hasher existed. This file's test reproduces
 * all ten and is the authority — do not regenerate a pinned literal to make it pass (AC7).
 *
 * The scheme, exactly:
 *
 *   sha256hex(JSON.stringify(sortKeysDeep({ conditions, payload })))
 *
 * — bare lowercase 64-hex, no `sha256:` prefix (Story 1.5 settled that), `id` excluded (the hash
 * would otherwise be self-referential and two structurally identical rules could never share one,
 * which RFC-004 §2.4 requires them to).
 *
 * ⚠️ **Lives in `apps/web`, not `@gol/domain`, and uses WebCrypto (FD1).** A probe file with
 * `crypto.subtle.digest` + `TextEncoder` typechecks inside `packages/domain` today — but only
 * because `apps/web`'s `@types/node` devDependency is hoisted to the root `node_modules/@types`
 * and TypeScript auto-includes it, an undeclared dependency of a package whose own fixture code
 * says the opposite (`fakeRepositories.ts:38-39`: "packages/* compile with lib: ["ES2022"] and no
 * @types/node"). Declaring it there to make that honest would widen a DOM-free, synchronous
 * package's surface for one async function. A hand-rolled synchronous SHA-256 was the other
 * alternative — ~80 lines of bit arithmetic nobody reviews, reinventing a platform primitive. Every
 * known consumer of this function is already in `apps/web` (this story's save, Story 4.17's
 * re-save, Story 4.18's clone; Epic 5 only CONSUMES hashes, never computes one). `apps/web` carries
 * the `dom` lib, where `crypto.subtle` and `TextEncoder` are first-class types, and Vitest's jsdom
 * test environment keeps Node's own `crypto` global (measured 2026-09-22: a `crypto.subtle.digest`
 * call inside `apps/web`'s jsdom run returns a real 64-hex digest — jsdom's own `Crypto` has no
 * `subtle`, but Vitest does not swap Node's global out for it).
 *
 * **Secure-context caveat:** `crypto.subtle` is `undefined` over plain `http://` on a LAN IP —
 * exactly the condition under which `crypto.randomUUID()` already fails on the battle save path
 * (Story 2.13 forced decision 2). The resulting `TypeError` surfaces through this story's AC5
 * generic failure sentence. No fallback, no polyfill.
 *
 * Story 4.15's preview keeps its own session-only `contentHash: rule.id` stand-in
 * (`previewOrganism.ts`) — this hasher does not replace it (`deferred-work.md:1639-1643`).
 */

/**
 * Rebuilds every plain object with `Object.keys(v).sort()` order (the scheme's `Array#sort`, a
 * default code-unit sort). Arrays are mapped element-wise IN ORDER — array order is never
 * reordered, because rule/condition order is priority (FR-2.6) and must stay part of what is
 * hashed. Every other value (string, number, boolean, null) is returned as-is.
 */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = sortKeysDeep(record[key]);
    }
    return sorted;
  }
  return value;
}

/** The canonical string a rule's content hashes over — exported so its exact shape is pinned by
 * its own test, independent of the async digest step. */
export function canonicalRuleContent(rule: Pick<SurvivalRule, 'conditions' | 'payload'>): string {
  return JSON.stringify(sortKeysDeep({ conditions: rule.conditions, payload: rule.payload }));
}

/** The real, async digest. `id` and `schemaVersion` never enter the input — see the scheme above. */
export async function ruleContentHash(
  rule: Pick<SurvivalRule, 'conditions' | 'payload'>,
): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalRuleContent(rule));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

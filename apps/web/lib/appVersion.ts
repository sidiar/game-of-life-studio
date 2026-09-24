import packageJson from '../package.json';

/**
 * The app's single version source (FD2, Story 5.5). Three options were on the table
 * (`deferred-work.md:2556-2567`): a `packages/*` constant (drifts from the root the first time
 * either moves), a `NEXT_PUBLIC_*` env var (project-context confines env reads to
 * `apps/web/lib/mode.ts`), or a literal at the page boundary (honest but puts a version string in
 * a component). A JSON import of `apps/web/package.json` is none of those — one module, the file
 * the version already lives in, resolved at build time by the bundler, with no env var and no
 * duplication.
 *
 * `apps/web/package.json`, not the workspace root's — `web` is the application; the root is a
 * private workspace container with nothing meaningful to version. `resolveJsonModule` is already
 * on in `tsconfig.base.json`.
 *
 * Provenance only, never branched on (Decision I.4): every export today stamps `"0.0.0"`, and that
 * is fine — bumping it is a release concern outside this story.
 */
export const APP_VERSION: string = packageJson.version;

/**
 * Single read-point for the build-time mode flag (AR-2).
 *
 * The Story 1.4 repository factory consumes APP_MODE; nothing else may read
 * process.env.NEXT_PUBLIC_MODE directly. NEXT_PUBLIC_* vars are string-inlined
 * at build time and ONLY direct property access is replaced — dynamic access
 * (process.env[name], destructuring) yields undefined in the browser bundle.
 */
export const APP_MODE = process.env.NEXT_PUBLIC_MODE ?? 'standalone';

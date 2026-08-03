import withBundleAnalyzer from '@next/bundle-analyzer';

// Must default identically to apps/web/lib/mode.ts — the two consumers of this
// flag disagreeing is what makes a build claim one mode while emitting another.
const mode = process.env.NEXT_PUBLIC_MODE ?? 'standalone';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export only in standalone mode (RFC-001 §5). The `next export`
  // CLI was removed in Next 14 — `output: 'export'` is the only mechanism.
  output: mode === 'standalone' ? 'export' : undefined,
  // @gol/* packages export TS source directly (just-in-time packages).
  transpilePackages: ['@gol/domain', '@gol/simulation', '@gol/persistence', '@gol/test-utils'],
};

// Analyzer only activates with ANALYZE=true (`npm run analyze` -w web); normal
// builds are untouched. It opens an interactive treemap for diagnosing what the
// bundle-size gate (scripts/check-bundle-size.mjs) is measuring.
export default withBundleAnalyzer({ enabled: process.env.ANALYZE === 'true' })(nextConfig);

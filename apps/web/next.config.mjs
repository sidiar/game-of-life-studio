/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export only in standalone mode (RFC-001 §5). The `next export`
  // CLI was removed in Next 14 — `output: 'export'` is the only mechanism.
  output: process.env.NEXT_PUBLIC_MODE === 'standalone' ? 'export' : undefined,
  // @gol/* packages export TS source directly (just-in-time packages).
  transpilePackages: [
    '@gol/domain',
    '@gol/simulation',
    '@gol/persistence',
    '@gol/test-utils'
  ]
};

export default nextConfig;

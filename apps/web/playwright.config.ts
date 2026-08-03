import { defineConfig, devices } from '@playwright/test';

// E2E runs against the shipped artifact: the static export served from out/, not
// `next dev`. This is what the $0 static host will serve, so it is what we test.
const PORT = 4173;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  // Cross-browser matrix (NFR-2.1): Chromium→Chrome/Edge, Firefox, WebKit→Safari.
  // Plus a tablet viewport (>=1024px, NFR-3.1) exercised on WebKit.
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'tablet', use: { ...devices['iPad Pro 11 landscape'] } },
  ],
  // Self-contained: build the standalone export, then serve out/. In `npm run ci`
  // the build is a Turborepo cache hit, so this does not rebuild from scratch.
  webServer: {
    command: `npm run build:standalone && npx --yes serve out -l ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});

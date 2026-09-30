import { defineConfig } from '@playwright/test'

/**
 * End-to-end suite: launches the real Electron app from out/ (build it first
 * with `npm run build && npm run build:mcp`, or just `npm run test:e2e`).
 * Unit and integration tests stay on Vitest (`npm test`).
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  // Each test launches its own Electron with its own user-data dir, but one at
  // a time keeps CI runners (and the xvfb display) predictable.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  outputDir: 'test-results/e2e'
})

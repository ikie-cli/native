import { defineConfig } from '@playwright/test'

/**
 * Two projects:
 *  - e2e        functional flows against the built Electron app
 *  - visual-qa  screenshots every major screen into qa-screenshots/
 *
 * Both require `npm run build` first (they launch out/main/index.js).
 * On Linux CI, run under xvfb-run.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['junit', { outputFile: 'test-results/e2e-junit.xml' }]] : 'list',
  projects: [
    { name: 'e2e', testMatch: /e2e\/.*\.spec\.ts/ },
    { name: 'visual-qa', testMatch: /visual\/.*\.vqa\.ts/ }
  ]
})

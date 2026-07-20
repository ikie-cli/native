import { defineWorkspace } from 'vitest/config'

/**
 * Three test projects:
 *  - unit        pure logic, no fs/network — fast, deterministic, runs everywhere
 *  - integration real better-sqlite3 + tmpdir filesystem pipelines
 *  - renderer    Zustand stores + pure helpers under happy-dom
 */
export default defineWorkspace([
  {
    extends: './vitest.config.ts',
    test: {
      name: 'unit',
      environment: 'node',
      include: ['tests/unit/**/*.test.ts'],
      setupFiles: ['tests/setup/unit.setup.ts']
    }
  },
  {
    extends: './vitest.config.ts',
    test: {
      name: 'integration',
      environment: 'node',
      include: ['tests/integration/**/*.test.ts'],
      setupFiles: ['tests/setup/integration.setup.ts'],
      testTimeout: 30_000,
      hookTimeout: 30_000
    }
  },
  {
    extends: './vitest.config.ts',
    test: {
      name: 'renderer',
      environment: 'happy-dom',
      include: ['tests/renderer/**/*.test.{ts,tsx}'],
      setupFiles: ['tests/setup/renderer.setup.ts']
    }
  }
])

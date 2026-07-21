import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

/**
 * Root Vitest config with inline projects (Vitest 3.2+ replaced workspace
 * files with test.projects). Each project inherits aliases from this config.
 * Run a single project with `vitest run --project <name>`.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@': resolve(__dirname, 'src/renderer/src'),
      // Node-side tests can't load the real electron runtime module.
      electron: resolve(__dirname, 'tests/stubs/electron.ts')
    }
  },
  test: {
    globals: true,
    reporters: process.env.CI ? ['default', 'junit'] : ['default'],
    outputFile: { junit: 'test-results/vitest-junit.xml' },
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text-summary', 'html', 'lcov'],
      include: ['src/main/**/*.ts', 'src/shared/**/*.ts', 'src/renderer/src/lib/**/*.ts'],
      exclude: ['src/main/workers/**', 'src/**/*.d.ts']
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
          setupFiles: ['tests/setup/unit.setup.ts']
        }
      },
      {
        extends: true,
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
        extends: true,
        test: {
          name: 'renderer',
          environment: 'happy-dom',
          include: ['tests/renderer/**/*.test.{ts,tsx}'],
          setupFiles: ['tests/setup/renderer.setup.ts']
        }
      }
    ]
  }
})

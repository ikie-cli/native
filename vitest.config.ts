import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

/**
 * Root vitest config. Projects (unit / integration / renderer) live in
 * vitest.workspace.ts and inherit these resolve aliases + coverage settings.
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
    }
  }
})

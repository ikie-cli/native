/**
 * The `electron` module is aliased to tests/stubs/electron.ts in
 * vitest.config.ts, so no vi.mock is needed. This file remains as the
 * explicit call site in setup files.
 */
export function installElectronMock(): void {
  // alias-based; nothing to register at runtime
}

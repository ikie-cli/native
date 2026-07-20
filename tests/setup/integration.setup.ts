import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll } from 'vitest'
import { installElectronMock } from './electron.mock'
import { installLoggerMock } from './logger.mock'

// A process-wide data dir so any module reading paths.dataRoot() during import
// lands in a tmp sandbox. Individual tests still create their own tmp dirs for
// isolation; this is the safety net.
if (!process.env.NATIVE_DATA_DIR) {
  process.env.NATIVE_DATA_DIR = mkdtempSync(join(tmpdir(), 'native-it-'))
}

installElectronMock()
installLoggerMock()

beforeAll(() => {
  // fetch is provided by node 20+; assert so failures are legible.
  if (typeof fetch !== 'function') throw new Error('global fetch missing — need Node 20+')
})

import log from 'electron-log/main'
import { join } from 'node:path'
import { dataRoot } from './paths'

export function initLogger(): void {
  log.transports.file.resolvePathFn = () => join(dataRoot(), 'logs', 'native.log')
  log.transports.file.maxSize = 5 * 1024 * 1024
  log.transports.console.level = process.env.NODE_ENV === 'development' ? 'debug' : 'info'
  log.errorHandler.startCatching()
}

export { log }

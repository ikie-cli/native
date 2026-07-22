import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createRankedServer } from './server.mjs'

const host = process.env.NATIVE_RANKED_HOST ?? '127.0.0.1'
const port = Number(process.env.NATIVE_RANKED_PORT ?? 3847)
const dbFile = process.env.NATIVE_RANKED_DB ?? '/var/lib/native-ranked/ranked.db'
mkdirSync(dirname(dbFile), { recursive: true })

const { server } = createRankedServer({
  dbFile,
  artifactDir: process.env.NATIVE_RANKED_ARTIFACT_DIR ?? '/var/lib/native-ranked/artifacts'
})
server.listen(port, host, () => {
  process.stdout.write(`Native Ranked listening on http://${host}:${port}\n`)
})

const stop = () => server.close(() => process.exit(0))
process.on('SIGTERM', stop)
process.on('SIGINT', stop)

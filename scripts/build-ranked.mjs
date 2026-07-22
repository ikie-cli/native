import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { existsSync } from 'node:fs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const windows = process.platform === 'win32'
const executable = join(root, 'native-ranked-mod', windows ? 'gradlew.bat' : 'gradlew')
const javaCandidates = [
  '/usr/lib/jvm/java-21-openjdk-arm64',
  '/usr/lib/jvm/java-21-openjdk-amd64',
  '/usr/lib/jvm/temurin-21-jdk-amd64',
  process.env.JAVA_HOME
].filter(Boolean)
const javaHome = javaCandidates.find((candidate) => existsSync(join(candidate, 'bin', windows ? 'java.exe' : 'java')))
const result = spawnSync(executable, ['build', '--no-daemon'], {
  cwd: join(root, 'native-ranked-mod'),
  stdio: 'inherit',
  shell: windows,
  env: { ...process.env, ...(javaHome ? { JAVA_HOME: javaHome } : {}) }
})
if (result.error) throw result.error
process.exitCode = result.status ?? 1

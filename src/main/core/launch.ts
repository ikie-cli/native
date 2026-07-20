import { EventEmitter } from 'node:events'
import { spawn, type ChildProcess } from 'node:child_process'
import { readdir, readFile, stat, statfs } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  CrashInfo,
  InstanceConfig,
  LaunchValidation,
  LogLevel,
  LogLine,
  RunningGame
} from '@shared/types'
import { buildCommand, normalizeMemory, type LaunchAccount } from './args'
import { installVersion, ruleCtx, validateFiles } from './install'
import { ensureJava, guessJavaMajor, probeJava } from './java'
import { DownloadManager } from './download'
import { paths } from '../paths'
import { ensureDir, exists } from '../utils/fsx'
import { log } from '../logger'
import os from 'node:os'

const LOG_BUFFER_MAX = 5000
const APP_VERSION = process.env.npm_package_version ?? '0.1.0'

export interface LaunchDeps {
  resolveVersionId: (inst: InstanceConfig) => Promise<string>
  account: () => Promise<LaunchAccount>
  concurrency: () => number
  onPlaytime: (instanceId: string, startedAt: number, endedAt: number) => void
}

interface RunningEntry {
  game: RunningGame
  child: ChildProcess
  logs: LogLine[]
}

/**
 * Owns running game processes: launch, kill, log streaming, crash detection,
 * playtime accounting.
 */
export class LaunchManager extends EventEmitter {
  private running = new Map<string, RunningEntry>()

  constructor(private deps: LaunchDeps) {
    super()
  }

  list(): RunningGame[] {
    return [...this.running.values()].map((r) => r.game)
  }

  isRunning(instanceId: string): boolean {
    return this.running.has(instanceId)
  }

  logs(instanceId: string): LogLine[] {
    return this.running.get(instanceId)?.logs ?? []
  }

  kill(instanceId: string): boolean {
    const entry = this.running.get(instanceId)
    if (!entry) return false
    entry.child.kill(process.platform === 'win32' ? undefined : 'SIGTERM')
    setTimeout(() => {
      if (this.running.has(instanceId)) entry.child.kill('SIGKILL')
    }, 8000).unref?.()
    return true
  }

  /** Pre-launch validation: java, files, disk space, memory sanity. */
  async validate(inst: InstanceConfig, javaOverride: string | null): Promise<LaunchValidation> {
    const problems: LaunchValidation['problems'] = []
    let javaPath: string | null = null
    let majorNeeded = guessJavaMajor(inst.mcVersion)

    let versionId: string
    try {
      versionId = await this.deps.resolveVersionId(inst)
      const { resolveVersionJson } = await import('./manifest')
      const vjson = await resolveVersionJson(versionId)
      majorNeeded = vjson.javaVersion?.majorVersion ?? majorNeeded
    } catch (err) {
      problems.push({
        severity: 'error',
        code: 'version',
        message: `Version metadata unavailable: ${err instanceof Error ? err.message : err}`
      })
      versionId = inst.mcVersion
    }

    const javaCandidate = inst.javaPath ?? javaOverride ?? process.env.NATIVE_JAVA_BIN ?? null
    if (javaCandidate) {
      const probed = await probeJava(javaCandidate)
      if (!probed) {
        problems.push({
          severity: 'error',
          code: 'java-broken',
          message: `Java at ${javaCandidate} is not runnable`
        })
      } else if (probed.major < majorNeeded) {
        problems.push({
          severity: 'error',
          code: 'java-version',
          message: `Java ${probed.major} configured but Minecraft ${inst.mcVersion} needs Java ${majorNeeded}+`
        })
      } else {
        javaPath = javaCandidate
      }
    }

    let diskFreeBytes = Number.MAX_SAFE_INTEGER
    try {
      const fsStat = await statfs(paths.root())
      diskFreeBytes = fsStat.bavail * fsStat.bsize
      if (diskFreeBytes < 2 * 1024 * 1024 * 1024 && !inst.installed) {
        problems.push({
          severity: 'warn',
          code: 'disk',
          message: 'Less than 2 GB of free disk space'
        })
      }
    } catch {
      /* statfs unsupported */
    }

    if (inst.installed) {
      try {
        const missing = await validateFiles(versionId)
        if (missing.length > 0) {
          problems.push({
            severity: 'warn',
            code: 'files',
            message: `${missing.length} game files missing or corrupt — they will be re-downloaded`
          })
        }
      } catch {
        /* validated during install instead */
      }
    }

    const totalMB = Math.round(os.totalmem() / (1024 * 1024))
    if (inst.memMax > totalMB) {
      problems.push({
        severity: 'warn',
        code: 'memory',
        message: `Max RAM (${inst.memMax} MB) exceeds system memory (${totalMB} MB)`
      })
    }

    return {
      ok: !problems.some((p) => p.severity === 'error'),
      problems,
      javaPath,
      javaMajorNeeded: majorNeeded,
      diskFreeBytes
    }
  }

  /**
   * Full launch: ensure installed (delta-downloads anything missing), ensure
   * java, build command, spawn, wire logs + crash detection + playtime.
   */
  async launch(
    inst: InstanceConfig,
    opts: {
      javaOverride: string | null
      server?: { host: string; port: number } | null
      quickPlay?: boolean
    }
  ): Promise<RunningGame> {
    if (this.running.has(inst.id)) throw new Error(`${inst.name} is already running`)

    const task = DownloadManager.createTask(`launch:${inst.id}`, {
      label: inst.name,
      phase: 'prepare'
    })
    try {
      const versionId = await this.deps.resolveVersionId(inst)
      const prepared = await installVersion(versionId, task, this.deps.concurrency())

      const majorNeeded = prepared.json.javaVersion?.majorVersion ?? guessJavaMajor(inst.mcVersion)
      const javaPath = await ensureJava(
        majorNeeded,
        inst.javaPath ?? opts.javaOverride ?? process.env.NATIVE_JAVA_BIN ?? null,
        task
      )

      const gameDir = paths.instanceGameDir(inst.id)
      await ensureDir(gameDir)

      const account = await this.deps.account()
      const mem = normalizeMemory(inst.memMin, inst.memMax, Math.round(os.totalmem() / 1048576))
      const cmd = buildCommand({
        version: prepared.json,
        versionId,
        gameDir,
        assetsDir: prepared.assetsDir,
        legacyAssetsDir: prepared.legacyAssetsDir,
        nativesDir: prepared.nativesDir,
        librariesDir: paths.libraries(),
        classpath: prepared.classpath,
        memMinMB: mem.minMB,
        memMaxMB: mem.maxMB,
        extraJvmArgs: splitArgs(inst.jvmArgs),
        account,
        resolution:
          inst.gameWidth && inst.gameHeight
            ? { width: inst.gameWidth, height: inst.gameHeight }
            : null,
        fullscreen: inst.fullscreen,
        server: opts.server ?? null,
        launcherName: 'Native',
        launcherVersion: APP_VERSION,
        log4jConfigPath: prepared.log4jConfigPath,
        os: ruleCtx()
      })

      task.finish()

      log.info(`Launching ${inst.name} (${versionId}) with ${javaPath}`)
      const child = spawn(javaPath, cmd.all, {
        cwd: gameDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false
      })

      const startedAt = Date.now()
      const game: RunningGame = { instanceId: inst.id, pid: child.pid ?? -1, startedAt }
      const entry: RunningEntry = { game, child, logs: [] }
      this.running.set(inst.id, entry)
      this.emit('changed', this.list())

      const push = (text: string, fallback: LogLevel): void => {
        for (const line of text.split(/\r?\n/)) {
          if (!line) continue
          const lvl = levelOf(line) ?? fallback
          const entryLine: LogLine = { t: Date.now(), level: lvl, text: line }
          entry.logs.push(entryLine)
          if (entry.logs.length > LOG_BUFFER_MAX) entry.logs.splice(0, entry.logs.length - LOG_BUFFER_MAX)
          this.emit('log', inst.id, entryLine)
        }
      }
      child.stdout?.on('data', (d: Buffer) => push(d.toString(), 'info'))
      child.stderr?.on('data', (d: Buffer) => push(d.toString(), 'error'))

      child.on('error', (err) => {
        push(`Failed to start process: ${err.message}`, 'error')
      })

      child.on('close', (code) => {
        const endedAt = Date.now()
        this.running.delete(inst.id)
        this.emit('changed', this.list())
        this.deps.onPlaytime(inst.id, startedAt, endedAt)
        // Crash detection: abnormal exit code or a fresh crash report.
        void this.detectCrash(inst, code, startedAt, entry.logs).then((crash) => {
          if (crash) this.emit('crash', crash)
        })
        log.info(`${inst.name} exited with code ${code}`)
      })

      return game
    } catch (err) {
      task.fail(err)
      throw err
    }
  }

  private async detectCrash(
    inst: InstanceConfig,
    exitCode: number | null,
    startedAt: number,
    logs: LogLine[]
  ): Promise<CrashInfo | null> {
    const crashed =
      (exitCode !== null && exitCode !== 0 && exitCode !== 143 && exitCode !== 130) ||
      logs.some((l) => l.text.includes('---- Minecraft Crash Report ----'))
    if (!crashed) return null
    let reportPath: string | null = null
    let report: string | null = null
    try {
      const dir = join(paths.instanceGameDir(inst.id), 'crash-reports')
      const files = await readdir(dir)
      let newest: { p: string; m: number } | null = null
      for (const f of files) {
        const p = join(dir, f)
        const s = await stat(p)
        if (s.mtimeMs >= startedAt - 1000 && (!newest || s.mtimeMs > newest.m)) {
          newest = { p, m: s.mtimeMs }
        }
      }
      if (newest) {
        reportPath = newest.p
        report = (await readFile(newest.p, 'utf-8')).slice(0, 200_000)
      }
    } catch {
      /* no crash-reports dir */
    }
    return {
      instanceId: inst.id,
      exitCode,
      reportPath,
      report,
      lastLog: logs
        .slice(-120)
        .map((l) => l.text)
        .join('\n'),
      at: Date.now()
    }
  }
}

function levelOf(line: string): LogLevel | null {
  if (/\/(FATAL|ERROR)\]|^\s*(FATAL|ERROR)\b|Exception|\tat /.test(line)) return 'error'
  if (/\/WARN\]|^\s*WARN\b/.test(line)) return 'warn'
  if (/\/DEBUG\]|^\s*DEBUG\b/.test(line)) return 'debug'
  if (/\/INFO\]/.test(line)) return 'info'
  return null
}

/** Split a raw JVM args string respecting quotes. */
export function splitArgs(raw: string): string[] {
  const out: string[] = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw))) out.push(m[1] ?? m[2] ?? m[3])
  return out
}

export async function diskFree(dir: string): Promise<number> {
  try {
    const s = await statfs(dir)
    return s.bavail * s.bsize
  } catch {
    return Number.MAX_SAFE_INTEGER
  }
}

export function fileExists(p: string): Promise<boolean> {
  return exists(p)
}

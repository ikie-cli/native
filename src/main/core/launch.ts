import { EventEmitter } from 'node:events'
import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream, type WriteStream } from 'node:fs'
import { readdir, readFile, rename, rm, stat, statfs } from 'node:fs/promises'
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
import { ensureJava, guessJavaMajor, probeJava, type JavaDownloadConfirm } from './java'
import { resolveVersionJson } from './manifest'
import { DownloadManager } from './download'
import { paths } from '../paths'
import { ensureDir, exists } from '../utils/fsx'
import { log } from '../logger'
import { APP_VERSION } from '../version'
import os from 'node:os'

const LOG_BUFFER_MAX = 5000
const SESSION_KEEP = 20

export interface LaunchDeps {
  resolveVersionId: (inst: InstanceConfig) => Promise<string>
  /** Read-only variant: resolved id if installed locally, else null. Never downloads. */
  peekVersionId: (inst: InstanceConfig) => Promise<string | null>
  account: () => Promise<LaunchAccount>
  concurrency: () => number
  onPlaytime: (instanceId: string, startedAt: number, endedAt: number) => void
  /** Ask the user before downloading a Java runtime. Resolve false to abort the launch. */
  confirmJavaDownload: (req: {
    major: number
    javaVersion: string
    sizeBytes: number
    instanceName: string
    mcVersion: string
  }) => Promise<boolean>
}

interface RunningEntry {
  game: RunningGame
  child: ChildProcess
  logs: LogLine[]
  /** Append stream to this session's on-disk log file; null if it couldn't open. */
  sink: WriteStream | null
  /** Path of the in-progress `.log` file (renamed to `.crash.log` on crash). */
  sessionPath: string
  /** Multiplayer connection inferred from this process's client log. */
  activeServer: { address: string; connectedAt: number } | null
}

/**
 * Minecraft logs multiplayer joins as `Connecting to host, port`. Some loader
 * stacks use `host:port` or include the resolved IP after a slash, so accept
 * those forms while rejecting unrelated chat text.
 */
export function serverAddressFromLog(line: string): string | null {
  const comma = line.match(/\bConnecting to\s+(.+?),\s*(\d{1,5})\s*$/i)
  const colon = line.match(/\bConnecting to\s+(\[[^\]]+\]|[^\s,]+):(\d{1,5})\s*$/i)
  const match = comma ?? colon
  if (!match) return null

  let host = match[1].trim().replace(/^\//, '')
  if (!host.startsWith('[') && host.includes('/')) host = host.split('/')[0]
  host = host.replace(/^\[|\]$/g, '').toLowerCase()
  const port = Number(match[2])
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return null
  const renderedHost = host.includes(':') ? `[${host}]` : host
  return port === 25565 ? renderedHost : `${renderedHost}:${port}`
}

export function isServerDisconnectLog(line: string): boolean {
  return /\b(?:Disconnecting from server|Lost connection|Connection (?:closed|reset))\b/i.test(line)
}

/**
 * Owns running game processes: launch, kill, log streaming, crash detection,
 * playtime accounting.
 */
export class LaunchManager extends EventEmitter {
  private running = new Map<string, RunningEntry>()
  private preparing = new Set<string>()

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

  /**
   * Pre-launch validation: java, files, disk space, memory sanity.
   * Read-only — never downloads anything or shows progress UI. When the
   * loader isn't installed yet, java requirements fall back to a heuristic
   * and the real check happens during launch.
   */
  async validate(inst: InstanceConfig, javaOverride: string | null): Promise<LaunchValidation> {
    const problems: LaunchValidation['problems'] = []
    let javaPath: string | null = null
    let majorNeeded = guessJavaMajor(inst.mcVersion)

    let versionId = inst.mcVersion
    try {
      const peeked = await this.deps.peekVersionId(inst)
      if (peeked) {
        versionId = peeked
        const vjson = await resolveVersionJson(versionId)
        majorNeeded = vjson.javaVersion?.majorVersion ?? majorNeeded
      }
    } catch {
      /* metadata unreadable — heuristic major stands, launch re-checks */
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
    if (this.preparing.has(inst.id)) {
      throw new Error(`${inst.name} is already starting — wait for its download to finish`)
    }
    // A manual install kicked off from the UI owns the same files; launching on
    // top of it would download them twice concurrently.
    for (const prefix of ['install', 'loader']) {
      if (DownloadManager.get(`${prefix}:${inst.id}`)?.state === 'running') {
        throw new Error(`${inst.name} is still downloading — try again when the install finishes`)
      }
    }

    this.preparing.add(inst.id)
    const task = DownloadManager.createTask(`launch:${inst.id}`, {
      label: inst.name,
      phase: 'prepare'
    })
    try {
      const versionId = await this.deps.resolveVersionId(inst)

      // Settle Java before the (potentially huge) asset download: read the
      // required major from the version metadata, and if a download is needed,
      // ask the user first so declining costs nothing.
      let majorNeeded = guessJavaMajor(inst.mcVersion)
      try {
        const vjson = await resolveVersionJson(versionId)
        majorNeeded = vjson.javaVersion?.majorVersion ?? majorNeeded
      } catch {
        /* metadata unavailable — re-checked against the installed json below */
      }
      const javaOverride = inst.javaPath ?? opts.javaOverride ?? process.env.NATIVE_JAVA_BIN ?? null
      let approved = false
      const confirm: JavaDownloadConfirm = async (info) => {
        if (approved) return true
        approved = await this.deps.confirmJavaDownload({
          ...info,
          instanceName: inst.name,
          mcVersion: inst.mcVersion
        })
        return approved
      }
      let javaPath = await ensureJava(majorNeeded, javaOverride, task, confirm)

      const prepared = await installVersion(versionId, task, this.deps.concurrency())

      const exactMajor = prepared.json.javaVersion?.majorVersion ?? majorNeeded
      if (exactMajor !== majorNeeded) {
        javaPath = await ensureJava(exactMajor, javaOverride, task, confirm)
      }

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

      // Persist this session to disk so logs survive after the game exits.
      // One file per launch, named by start time; opened best-effort — a failure
      // to open the sink must never abort the launch.
      const logsDir = paths.instanceLogsDir(inst.id)
      const sessionPath = join(logsDir, `${startedAt}.log`)
      let sink: WriteStream | null = null
      try {
        await ensureDir(logsDir)
        sink = createWriteStream(sessionPath, { flags: 'a' })
        sink.on('error', (err) => log.warn(`session log write failed: ${err.message}`))
        sink.write(`# ${inst.name} — started ${new Date(startedAt).toISOString()}\n`)
      } catch (err) {
        log.warn(`could not open session log: ${(err as Error).message}`)
      }

      const entry: RunningEntry = { game, child, logs: [], sink, sessionPath, activeServer: null }
      this.running.set(inst.id, entry)
      this.emit('changed', this.list())

      const push = (text: string, fallback: LogLevel): void => {
        for (const line of text.split(/\r?\n/)) {
          if (!line) continue
          const lvl = levelOf(line) ?? fallback
          const entryLine: LogLine = { t: Date.now(), level: lvl, text: line }
          entry.logs.push(entryLine)
          if (entry.logs.length > LOG_BUFFER_MAX) entry.logs.splice(0, entry.logs.length - LOG_BUFFER_MAX)
          entry.sink?.write(line + '\n')
          this.emit('log', inst.id, entryLine)

          const serverAddress = serverAddressFromLog(line)
          if (serverAddress && serverAddress !== entry.activeServer?.address) {
            if (entry.activeServer) {
              this.emit('server-disconnect', inst.id, entryLine.t)
            }
            entry.activeServer = { address: serverAddress, connectedAt: entryLine.t }
            this.emit('server-connect', inst.id, serverAddress, entryLine.t)
          } else if (entry.activeServer && isServerDisconnectLog(line)) {
            entry.activeServer = null
            this.emit('server-disconnect', inst.id, entryLine.t)
          }
        }
      }
      child.stdout?.on('data', (d: Buffer) => push(d.toString(), 'info'))
      child.stderr?.on('data', (d: Buffer) => push(d.toString(), 'error'))

      child.on('error', (err) => {
        push(`Failed to start process: ${err.message}`, 'error')
      })

      child.on('close', (code) => {
        const endedAt = Date.now()
        if (entry.activeServer) {
          entry.activeServer = null
          this.emit('server-disconnect', inst.id, endedAt)
        }
        this.running.delete(inst.id)
        this.emit('changed', this.list())
        this.deps.onPlaytime(inst.id, startedAt, endedAt)
        // Crash detection: abnormal exit code or a fresh crash report.
        void this.detectCrash(inst, code, startedAt, entry.logs).then((crash) => {
          if (crash) this.emit('crash', crash)
          // Close the session file, mark crashes, then prune old sessions.
          void this.finalizeSession(inst.id, entry, crash != null)
        })
        log.info(`${inst.name} exited with code ${code}`)
      })

      return game
    } catch (err) {
      task.fail(err)
      throw err
    } finally {
      this.preparing.delete(inst.id)
    }
  }

  /**
   * Close a session's log stream, rename crashed sessions to `.crash.log` so the
   * UI can flag them without reading contents, and prune to SESSION_KEEP newest.
   */
  private async finalizeSession(
    instanceId: string,
    entry: RunningEntry,
    crashed: boolean
  ): Promise<void> {
    // Wait for the append stream to flush before renaming/pruning.
    if (entry.sink) {
      await new Promise<void>((resolve) => entry.sink!.end(resolve))
    }
    let finalPath = entry.sessionPath
    if (crashed && entry.sink) {
      const crashPath = entry.sessionPath.replace(/\.log$/, '.crash.log')
      try {
        await rename(entry.sessionPath, crashPath)
        finalPath = crashPath
      } catch (err) {
        log.warn(`could not mark crash session: ${(err as Error).message}`)
      }
    }
    void finalPath
    await this.pruneSessions(instanceId)
  }

  /** Keep only the SESSION_KEEP most recent session files for an instance. */
  private async pruneSessions(instanceId: string): Promise<void> {
    const dir = paths.instanceLogsDir(instanceId)
    let files: string[]
    try {
      files = (await readdir(dir)).filter((f) => f.endsWith('.log'))
    } catch {
      return
    }
    if (files.length <= SESSION_KEEP) return
    // Filenames are `<startedAt>.log` / `<startedAt>.crash.log`; the leading
    // epoch sorts chronologically as a string of equal-length integers.
    files.sort()
    const stale = files.slice(0, files.length - SESSION_KEEP)
    await Promise.all(stale.map((f) => rm(join(dir, f), { force: true }).catch(() => {})))
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

export function levelOf(line: string): LogLevel | null {
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

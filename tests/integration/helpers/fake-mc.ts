import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import AdmZip from 'adm-zip'
import type { VersionJson } from '../../../src/main/core/mojang-types'
import type { Fixture } from './fixture-server'

/** Locate a JDK javac next to the java binary (JAVA_HOME / PATH). */
export function findJavac(): string | null {
  const candidates: string[] = []
  if (process.env.NATIVE_JAVA_BIN) {
    candidates.push(join(dirname(process.env.NATIVE_JAVA_BIN), 'javac'))
  }
  if (process.env.JAVA_HOME) candidates.push(join(process.env.JAVA_HOME, 'bin', 'javac'))
  candidates.push('/usr/bin/javac')
  for (const c of candidates) if (existsSync(c)) return c
  try {
    execFileSync('javac', ['-version'], { stdio: 'ignore' })
    return 'javac'
  } catch {
    return null
  }
}

export function findJava(): string | null {
  const candidates: string[] = []
  if (process.env.NATIVE_JAVA_BIN) candidates.push(process.env.NATIVE_JAVA_BIN)
  if (process.env.JAVA_HOME) candidates.push(join(process.env.JAVA_HOME, 'bin', 'java'))
  candidates.push('/usr/bin/java')
  for (const c of candidates) if (existsSync(c)) return c
  try {
    execFileSync('java', ['-version'], { stdio: 'ignore' })
    return 'java'
  } catch {
    return null
  }
}

const FAKE_CLIENT_SRC = `
import java.nio.file.*;

public class FakeClient {
    public static void main(String[] args) throws Exception {
        System.out.println("[main/INFO]: FakeClient starting");
        StringBuilder sb = new StringBuilder();
        for (String a : args) sb.append(a).append('\\n');
        Files.writeString(Path.of("launched.txt"), sb.toString());
        boolean crash = false, sleep = false;
        String server = null, port = "25565";
        for (int i = 0; i < args.length; i++) {
            String a = args[i];
            if (a.equals("--crash")) crash = true;
            if (a.equals("--sleep")) sleep = true;
            if (a.equals("--server") && i + 1 < args.length) server = args[i + 1];
            if (a.equals("--port") && i + 1 < args.length) port = args[i + 1];
        }
        if (server != null) System.out.println("[Render thread/INFO]: Connecting to " + server + ", " + port);
        if (sleep) {
            System.out.println("[main/INFO]: FakeClient sleeping (waiting for stop)");
            Thread.sleep(120000);
        }
        if (crash) {
            Files.createDirectories(Path.of("crash-reports"));
            Files.writeString(Path.of("crash-reports/crash-test.txt"),
                "---- Minecraft Crash Report ----\\nDescription: Manually triggered debug crash\\n");
            System.err.println("[main/ERROR]: ---- Minecraft Crash Report ----");
            System.exit(255);
        }
        if (server != null) System.out.println("[Render thread/INFO]: Disconnecting from server");
        System.out.println("[main/INFO]: FakeClient done");
    }
}
`

/**
 * Compile FakeClient.java once and package it as a client "jar".
 * Returns the jar bytes; callers register it on the fixture server.
 */
export async function buildFakeClientJar(workDir: string): Promise<Buffer> {
  const javac = findJavac()
  if (!javac) throw new Error('javac not found — install a JDK to run pipeline tests')
  const srcDir = join(workDir, 'src')
  const outDir = join(workDir, 'classes')
  await mkdir(srcDir, { recursive: true })
  await mkdir(outDir, { recursive: true })
  await writeFile(join(srcDir, 'FakeClient.java'), FAKE_CLIENT_SRC)
  // --release 11: the launcher auto-matches "lowest Java ≥ required", so the
  // class must run on any JRE ≥ the version json's javaVersion (11).
  try {
    execFileSync(javac, ['--release', '11', '-d', outDir, join(srcDir, 'FakeClient.java')], {
      stdio: 'pipe'
    })
  } catch {
    execFileSync(javac, ['-d', outDir, join(srcDir, 'FakeClient.java')], { stdio: 'pipe' })
  }
  const zip = new AdmZip()
  zip.addLocalFile(join(outDir, 'FakeClient.class'))
  return zip.toBuffer()
}

export interface FakeMc {
  versionId: string
  clientJar: Buffer
  versionJson: VersionJson
}

/**
 * Register a complete fake Minecraft version on the fixture server:
 * client jar download, empty asset index, no libraries/natives.
 */
export async function installFakeVersionFixture(
  fx: Fixture,
  workDir: string,
  opts: { versionId?: string; gameArgs?: string[] } = {}
): Promise<FakeMc> {
  const versionId = opts.versionId ?? 'test-1.0'
  const clientJar = await buildFakeClientJar(workDir)
  const clientMeta = fx.add(`/client-${versionId}.jar`, clientJar)

  const assetIndexBody = JSON.stringify({ objects: {} })
  const assetMeta = fx.add(`/assets-${versionId}.json`, assetIndexBody, {
    contentType: 'application/json'
  })

  const versionJson: VersionJson = {
    id: versionId,
    type: 'release',
    mainClass: 'FakeClient',
    javaVersion: { component: 'jre-legacy', majorVersion: 11 },
    assetIndex: {
      id: `${versionId}-assets`,
      sha1: assetMeta.sha1,
      size: assetMeta.size,
      url: `${fx.baseUrl}/assets-${versionId}.json`
    },
    downloads: {
      client: {
        url: `${fx.baseUrl}/client-${versionId}.jar`,
        sha1: clientMeta.sha1,
        size: clientMeta.size
      }
    },
    libraries: [],
    arguments: {
      jvm: ['-cp', '${classpath}'],
      game: ['--gameDir', '${game_directory}', '--username', '${auth_player_name}', ...(opts.gameArgs ?? [])]
    }
  }
  fx.add(`/versions/${versionId}.json`, JSON.stringify(versionJson), {
    contentType: 'application/json'
  })
  return { versionId, clientJar, versionJson }
}

/** Write the version json into the local data dir (skips manifest lookups). */
export async function writeLocalVersionJson(dataDir: string, json: VersionJson): Promise<void> {
  const dir = join(dataDir, 'versions', json.id)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, `${json.id}.json`), JSON.stringify(json, null, 2))
}

export function sha1(buf: Buffer | string): string {
  return createHash('sha1').update(buf).digest('hex')
}

export async function readTextIfExists(p: string): Promise<string | null> {
  try {
    return await readFile(p, 'utf-8')
  } catch {
    return null
  }
}

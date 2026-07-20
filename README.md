# Native

A fast, beautiful Minecraft launcher for Windows and Linux. Electron + React + TypeScript,
designed against a pixel-sampled dark design system (see [`design-system.md`](design-system.md)).

![CI](https://github.com/native-launcher/native/actions/workflows/ci.yml/badge.svg)

## Features

- **Microsoft sign-in** — powered by [msmc](https://github.com/Hanro50/MSMC): a popup
  OAuth window against the official launcher client, so it **works out of the box with no
  Azure/app-registration setup**. Game-ownership verification, transparent token refresh,
  OS-keychain token encryption (`safeStorage`). Offline profiles for singleplayer/LAN.
  Multi-account switching.
- **Instances** — create, rename, duplicate, delete; per-instance RAM sliders, JVM args,
  resolution, icon; playtime tracking.
- **Mod loaders** — one-click Fabric, Quilt, Forge, and NeoForge installs with automatic
  Java matching (8 / 17 / 21, via Adoptium download when missing).
- **Content** — Modrinth search built in (CurseForge with an API key): mods, resource packs,
  shaders. One-click install with required-dependency resolution, enable/disable, local file
  imports.
- **Downloads** — parallel, resumable (HTTP Range), sha1-verified, with real speed/ETA.
  Corrupt or missing files self-heal on the next launch.
- **Worlds & screenshots** — list/backup (zip)/delete worlds; in-app screenshot gallery.
- **Servers** — add/edit/remove, live Server List Ping (MOTD, players, latency, favicon),
  quick join straight into the game.
- **Launch flow** — pre-launch validation (Java, files, disk), live log console with level
  filters, crash detection with a copyable report, playtime accounting.
- **Auto-updates** — electron-updater against GitHub Releases: startup + periodic checks,
  background download, restart-to-apply. NSIS (Windows) with delta blockmaps; AppImage (Linux).
  `.deb` installs update via the system package manager.

## Install

Grab the latest from **Releases**:

| Platform | Artifact |
|---|---|
| Windows 10/11 | `Native-Setup-<version>.exe` (NSIS, auto-updates) |
| Linux | `Native-<version>-<arch>.AppImage` (auto-updates) or `.deb` |
| macOS | **Planned — next phase.** The codebase is kept cross-platform-safe (rule-based OS handling, no platform hacks), so macOS ships without a rewrite. |

Native ships in **Mono** — a pure black & white identity (white accent on black, imagery
desaturated until hover). Classic green palettes from the reference design remain available
in Settings → Theme.

## Development

```bash
npm ci
npm run dev            # electron-vite dev server + HMR

npm run typecheck
npm run rebuild:node   # better-sqlite3 → Node ABI (for vitest)
npx vitest run         # unit + integration + renderer store tests

npm run build          # bundle main/preload/renderer
npm run rebuild:electron  # better-sqlite3 → Electron ABI (for the app/E2E)
npm run e2e            # Playwright E2E against the built app
npm run qa:visual      # screenshot every screen + perceptual diff vs ./screenshots
```

The native-module ABI dance: `better-sqlite3` must be compiled for **Node** when running
vitest and for **Electron** when running the app or Playwright. CI runs them in that order.

Integration and E2E suites are fully hermetic — a local fixture HTTP server plays Mojang,
Fabric, Modrinth, MSA, and news endpoints (all base URLs are `NATIVE_URL_*` env-overridable),
and the "game" is a tiny compiled Java `FakeClient` that records its argv, so the entire
create → install → launch → crash pipeline is exercised without touching the internet.

### Auth

Microsoft sign-in needs **no setup** — msmc drives the official Minecraft launcher OAuth
client through a popup window. A custom Azure client ID can optionally be supplied via
`NATIVE_MSA_CLIENT_ID` or Settings for orgs that want their own registration. Native
enforces game ownership at sign-in; playing online requires owning Minecraft: Java Edition.

### Packaging

```bash
npm run package:linux   # AppImage + deb into dist/
npm run package:win     # NSIS installer (run on Windows, or CI)
```

Releases: tag `v*` → CI builds both platforms and attaches artifacts plus the
`latest*.yml` update feeds consumed by electron-updater.

## Architecture

```
src/
  shared/     types + IPC channel contract (imported by all three processes)
  main/       Electron main: core engine (download/install/launch/java/loaders),
              services (auth, accounts, instances, content, servers, worlds,
              screenshots, news, settings, updater), sqlite (better-sqlite3, WAL),
              io worker thread (hashing/zip), typed IPC registry
  preload/    contextBridge → window.native (typed)
  renderer/   React + Zustand + Tailwind (tokens from design-system.md) +
              Framer Motion (transform/opacity only), virtualized lists
```

Heavy work never blocks: downloads and installs run in the main process off the renderer,
hashing/extraction runs in a worker thread, progress streams over IPC throttled to 10 Hz,
and log lines batch at ~15 Hz into a virtualized console.

## License

MIT

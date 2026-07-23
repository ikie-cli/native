# Native

A fast, beautiful Minecraft launcher for Windows, Linux, and macOS. Electron + React + TypeScript,
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
- **Content** — Modrinth and CurseForge search built in: mods, modpacks, resource packs,
  and shaders. Home blends popular packs from both catalogs. One-click install with
  required-dependency resolution, enable/disable, and local file imports.
- **Downloads** — parallel, resumable (HTTP Range), sha1-verified, with real speed/ETA.
  Corrupt or missing files self-heal on the next launch.
- **Worlds & screenshots** — list/backup (zip)/delete worlds; in-app screenshot gallery.
- **Servers** — automatically detected from Minecraft connection logs with per-server
  playtime, visit count, last-played history, and preferred instance. Includes live Server
  List Ping (MOTD, players, latency, favicon) and quick join.
- **Discord Rich Presence** — shows the current instance, Minecraft version, loader, and
  session time; reconnects automatically when Discord starts or restarts.
- **Launch flow** — pre-launch validation (Java, files, disk), live log console with level
  filters, crash detection with a copyable report, playtime accounting.
- **Auto-updates** — electron-updater against the public
  [`native-releases`](https://github.com/ikie-cli/native-releases/releases) feed: startup + periodic checks,
  retrying background downloads, release notes, stable/beta/nightly channels, and restart-to-apply.
  NSIS (Windows) uses delta blockmaps; AppImage updates atomically on Linux.
  `.deb` installs update via the system package manager.

## Install

Grab the latest from **Releases**:

| Platform | Artifact |
|---|---|
| Windows 10/11 | `Native-Setup-<version>-<arch>.exe` (NSIS, auto-updates) |
| Linux | `Native-<version>-<arch>.AppImage` (auto-updates) or `.deb` |
| macOS 13+ | `Native-<version>-<arch>.dmg` (Apple Silicon and Intel) |

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
npm run package:mac     # DMG + updater ZIP (run on macOS, or CI)
```

Releases: tag `v*` → CI builds all three platforms for x64 and ARM64, creates a GitHub
Release, merges architecture-correct channel feeds consumed by electron-updater, mirrors
stable feeds for older installs, and deploys the website to Cloudflare Pages.

Release channels are selected by tag:

- `v3.3.3` → stable (`latest`)
- `v3.3.3-beta.1` → beta
- `v3.3.3-nightly.1` → nightly

CI produces unsigned builds by default. macOS signing/notarization activates when `MAC_CSC_LINK`,
`MAC_CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`
are configured. Windows signing uses
`WIN_CSC_LINK` + `WIN_CSC_KEY_PASSWORD` or the configured SignPath Foundation project.
The website deploys through its Cloudflare Pages Git integration; optional
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_PAGES_PROJECT_NAME`
secrets enable an explicit Wrangler deployment as well.

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

Native is released under the [MIT License](LICENSE).

## Code signing

Windows builds are signed through the [SignPath Foundation](https://signpath.org/)
free code-signing program for open-source projects. Note that the publisher shown
in Windows SmartScreen/UAC is **SignPath Foundation**, not Native Labs — the
certificate is issued to the Foundation and verified against this repository.

> Free code signing provided by [SignPath.io](https://signpath.io), certificate by [SignPath Foundation](https://signpath.org/)

macOS builds remain unsigned until Apple Developer signing is configured (SignPath
covers Windows only).

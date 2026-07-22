# Release checklist — Native 3.4.0

Verified on 2026-07-22. Gate order (identical to CI): typecheck → vitest (Node-ABI) →
build + Electron-ABI rebuild → Playwright E2E → visual QA → package.

- [x] **Design system extracted and applied consistently** — every surface/typography/radius/
      motion token was pixel-sampled from `./screenshots/` into `design-system.md`, encoded in
      `tailwind.config.ts` + `tokens` CSS variables, and enforced by the perceptual QA gate.
- [x] **All 9 core features implemented and reachable in UI** — auth (msmc popup OAuth —
      zero-setup, entitlement gate, refresh, safeStorage, offline profiles, multi-account), version
      management (manifest, parallel/resumable/sha1-verified downloads with speed & ETA),
      mod loaders (Fabric/Quilt via meta profiles, Forge/NeoForge via headless installer,
      Java 8/17/21 auto-match with Adoptium download), instances (CRUD/duplicate, RAM
      sliders, JVM args, resolution, icons, content manager, screenshots gallery, worlds
      backup/delete), servers (SLP ping + quick join), home dashboard (recents + news +
      quick launch), settings (Java detect/download/override, defaults, launch behavior,
      4 themes, language scaffold), launch flow (validation, live console, crash report
      capture, playtime), auto-updates.
- [x] **Native Ranked is end-to-end** — the launcher provisions a managed 1.16.1 Fabric
      instance and Native identity, the deployed SQLite coordinator matches two players on
      one seed and synchronized timestamp, and the custom-rendered in-game UI handles world
      creation, countdown, HUD milestones, dragon-kill results, Elo, and leaderboard data.
- [x] **Auto-updater tested end-to-end** — `e2e/updater.spec.ts` runs the app against a
      local generic-provider feed: detects v99.9.9 → background-downloads with progress →
      "restart to apply". The install step itself was empirically verified:
      `autoInstallOnAppQuit` replaced the packaged 0.1.0 AppImage with the downloaded
      new-version file on quit (old version → new version on disk).
- [x] **Windows installer & Ubuntu package build cleanly** — AppImage built & boot-tested on
      this machine (`dist/Native-*-arm64.AppImage`, logs healthy under Xvfb). The `.deb` and
      Windows NSIS targets build in CI (`ubuntu-22.04` / `windows-2022` runners) — this dev
      box is arm64 and lacks the x86 `fpm`/Wine toolchains, which is an environment limit,
      not a config one. `electron-builder.yml` carries both targets + GitHub publish config.
- [x] **All animations smooth at 60fps, no blocking on download/IO** — transform/opacity-only
      animation policy (audited; the tab pill uses a measured-transform glide, no layout
      projections), virtualized mod/log lists, lazy-loaded screens, downloads/hash/zip run
      in the main process + worker thread with 10 Hz progress IPC and ~15 Hz log batching;
      cold start measured at **~950 ms** (3-run mean, 4-core arm64 under Xvfb) vs the 2 s
      budget.
- [x] **All tests green** — 191 vitest tests (unit + integration + renderer stores; hermetic
      fixture server for Mojang/Fabric/Modrinth/CurseForge/MSA endpoints; real compiled Java client for
      the download→install→launch→crash pipeline), 7 Playwright E2E (create → loader → mod →
      launch → process spawn verified → stop; options persistence across restart; servers;
      accounts; settings; updater), CI matrix runs the same on `windows-2022` + `ubuntu-22.04`.
- [x] **Full screenshot QA pass** — 17/17 screens ≥ their similarity bar (85%; empty/error
      states 75% — sparse by design) against the reference screenshots. Method + scores in
      [`qa-report.md`](qa-report.md); captures in `qa-screenshots/`.
- [x] **macOS packages in CI** — GitHub-hosted Intel and Apple Silicon runners build x64
      and ARM64 DMGs. Builds remain unsigned until Apple signing/notarization secrets are
      configured; code paths are rule-based per OS and `osx` is handled throughout.

## Ship steps

1. Configure Windows signing and macOS signing/notarization secrets when certificates are
   available; unsigned packages remain publishable in the meantime.
2. Cloudflare Pages deploys pushes through its Git integration. Optional API/account/project
   secrets enable the explicit Wrangler deployment path.
3. `git tag v3.4.0 && git push origin v3.4.0` — CI packages Windows, Linux, and macOS
   for x64/ARM64, merges architecture-correct update feeds, and publishes the release.
4. CI validates every feed entry against public release assets, mirrors stable migration
   feeds, and deploys the website.
5. Microsoft sign-in works out of the box via msmc (official launcher OAuth client);
   `NATIVE_MSA_CLIENT_ID` remains available for orgs preferring their own registration.

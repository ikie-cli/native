/**
 * IPC channel names, grouped by domain. Both main (handlers) and preload
 * (invokers) import from here so the contract can't drift.
 */
export const IPC = {
  win: {
    minimize: 'win:minimize',
    toggleMaximize: 'win:toggle-maximize',
    close: 'win:close',
    isMaximized: 'win:is-maximized',
    onMaximized: 'win:maximized-changed'
  },
  app: {
    info: 'app:info',
    openExternal: 'app:open-external',
    openPath: 'app:open-path',
    revealFile: 'app:reveal-file',
    systemMemory: 'app:system-memory',
    pickFile: 'app:pick-file'
  },
  auth: {
    beginMsa: 'auth:begin-msa',
    cancelMsa: 'auth:cancel-msa',
    addOffline: 'auth:add-offline',
    list: 'auth:list',
    setActive: 'auth:set-active',
    remove: 'auth:remove',
    onFlow: 'auth:flow-state',
    onChanged: 'auth:changed'
  },
  versions: {
    manifest: 'versions:manifest',
    loaderVersions: 'versions:loader-versions'
  },
  instances: {
    list: 'instances:list',
    get: 'instances:get',
    create: 'instances:create',
    update: 'instances:update',
    remove: 'instances:remove',
    duplicate: 'instances:duplicate',
    install: 'instances:install',
    validate: 'instances:validate',
    launch: 'instances:launch',
    kill: 'instances:kill',
    openFolder: 'instances:open-folder',
    onChanged: 'instances:changed'
  },
  running: {
    list: 'running:list',
    logs: 'running:logs',
    sessions: 'running:sessions',
    readSession: 'running:read-session',
    deleteSession: 'running:delete-session',
    onChanged: 'running:changed',
    onLog: 'running:log',
    onCrash: 'running:crash'
  },
  content: {
    search: 'content:search',
    project: 'content:project',
    versions: 'content:versions',
    install: 'content:install',
    listLocal: 'content:list-local',
    installedProjects: 'content:installed-projects',
    toggle: 'content:toggle',
    removeLocal: 'content:remove-local',
    addLocalFiles: 'content:add-local-files',
    onLocalChanged: 'content:local-changed',
    updates: 'content:updates',
    checkUpdates: 'content:check-updates',
    applyUpdate: 'content:apply-update',
    updateAll: 'content:update-all',
    onUpdatesChanged: 'content:updates-changed'
  },
  packs: {
    installModrinth: 'packs:install-modrinth',
    importFile: 'packs:import-file'
  },
  worlds: {
    list: 'worlds:list',
    backup: 'worlds:backup',
    remove: 'worlds:remove'
  },
  screenshots: {
    list: 'screenshots:list',
    remove: 'screenshots:remove',
    data: 'screenshots:data'
  },
  files: {
    list: 'files:list',
    openPath: 'files:open-path',
    reveal: 'files:reveal',
    delete: 'files:delete',
    readText: 'files:read-text'
  },
  servers: {
    list: 'servers:list',
    add: 'servers:add',
    update: 'servers:update',
    remove: 'servers:remove',
    ping: 'servers:ping',
    quickJoin: 'servers:quick-join',
    onChanged: 'servers:changed'
  },
  ranked: {
    install: 'ranked:install'
  },
  news: {
    fetch: 'news:fetch'
  },
  icons: {
    importImage: 'icons:import-image',
    data: 'icons:data'
  },
  java: {
    list: 'java:list',
    detect: 'java:detect',
    download: 'java:download',
    test: 'java:test',
    onAskDownload: 'java:ask-download',
    answerDownload: 'java:answer-download'
  },
  settings: {
    get: 'settings:get',
    set: 'settings:set',
    onChanged: 'settings:changed'
  },
  downloads: {
    active: 'downloads:active',
    cancel: 'downloads:cancel',
    onProgress: 'downloads:progress'
  },
  updater: {
    state: 'updater:state',
    check: 'updater:check',
    download: 'updater:download',
    install: 'updater:install',
    onState: 'updater:state-changed'
  }
} as const

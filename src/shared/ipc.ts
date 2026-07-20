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
    onChanged: 'running:changed',
    onLog: 'running:log',
    onCrash: 'running:crash'
  },
  content: {
    search: 'content:search',
    versions: 'content:versions',
    install: 'content:install',
    listLocal: 'content:list-local',
    toggle: 'content:toggle',
    removeLocal: 'content:remove-local',
    addLocalFiles: 'content:add-local-files'
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
  servers: {
    list: 'servers:list',
    add: 'servers:add',
    update: 'servers:update',
    remove: 'servers:remove',
    ping: 'servers:ping',
    quickJoin: 'servers:quick-join'
  },
  news: {
    fetch: 'news:fetch'
  },
  java: {
    list: 'java:list',
    detect: 'java:detect',
    download: 'java:download',
    test: 'java:test'
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

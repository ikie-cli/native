import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Package, Search } from 'lucide-react'
import type { LoaderKind } from '@shared/types'
import { LOADER_LABELS } from '@shared/types'
import { useModals, useNav } from '@/stores/nav'
import { useInstances, useManifest, useToasts, toastError } from '@/stores/data'
import { Modal, FieldLabel } from '@/components/ui/modal'
import { Button, Input, SearchInput, Spinner } from '@/components/ui/ui'
import { BUILTIN_ICONS, BUILTIN_ICON_KEYS, InstanceIcon } from '@/components/InstanceIcon'
import { cn } from '@/lib/util'

const LOADERS: LoaderKind[] = ['vanilla', 'fabric', 'quilt', 'forge', 'neoforge']

export function CreateInstanceModal(): React.JSX.Element {
  const open = useModals((s) => s.createOpen)
  const setOpen = useModals((s) => s.setCreateOpen)
  const { go } = useNav()
  const refresh = useInstances((s) => s.refresh)
  const push = useToasts((s) => s.push)
  const { manifest, load } = useManifest()

  const [name, setName] = useState('')
  const [nameEdited, setNameEdited] = useState(false)
  const [loader, setLoader] = useState<LoaderKind>('fabric')
  const [mcVersion, setMcVersion] = useState('')
  const [icon, setIcon] = useState('builtin:cube')
  const [showSnapshots, setShowSnapshots] = useState(false)
  const [versionQuery, setVersionQuery] = useState('')
  const [loaderVersions, setLoaderVersions] = useState<{ version: string; stable: boolean }[] | null>(null)
  const [loaderVersion, setLoaderVersion] = useState<string>('stable')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open && !manifest) void load()
  }, [open, manifest, load])

  useEffect(() => {
    if (open && manifest && !mcVersion) setMcVersion(manifest.latest.release)
  }, [open, manifest, mcVersion])

  // Auto-suggest a name from loader + version until the user types their own.
  useEffect(() => {
    if (!nameEdited && mcVersion) setName(`${LOADER_LABELS[loader]} ${mcVersion}`)
  }, [loader, mcVersion, nameEdited])

  // Fetch loader versions when loader/mc changes.
  useEffect(() => {
    if (!open || loader === 'vanilla' || !mcVersion) {
      setLoaderVersions(null)
      return
    }
    let cancelled = false
    setLoaderVersions(null)
    setLoaderVersion('stable')
    window.native.versions
      .loaderVersions(loader, mcVersion)
      .then((v) => !cancelled && setLoaderVersions(v))
      .catch(() => !cancelled && setLoaderVersions([]))
    return () => {
      cancelled = true
    }
  }, [open, loader, mcVersion])

  const versions = useMemo(() => {
    if (!manifest) return []
    return manifest.versions
      .filter((v) => (showSnapshots ? true : v.type === 'release'))
      .filter((v) => v.id.toLowerCase().includes(versionQuery.toLowerCase()))
      .slice(0, 300)
  }, [manifest, showSnapshots, versionQuery])

  const reset = (): void => {
    setName('')
    setNameEdited(false)
    setLoader('fabric')
    setMcVersion(manifest?.latest.release ?? '')
    setIcon('builtin:cube')
    setVersionQuery('')
    setLoaderVersion('stable')
  }

  const create = async (): Promise<void> => {
    if (!name.trim() || !mcVersion) return
    setBusy(true)
    try {
      const inst = await window.native.instances.create({
        name: name.trim(),
        mcVersion,
        loader,
        loaderVersion: loader === 'vanilla' ? null : loaderVersion,
        icon
      })
      await refresh()
      setOpen(false)
      reset()
      push({ kind: 'success', title: `Created ${inst.name}`, detail: 'Installing game files…' })
      go({ name: 'instance', id: inst.id, tab: 'content' })
      // Kick off install; progress shows in the download indicator.
      window.native.instances
        .install(inst.id)
        .then(() => push({ kind: 'success', title: `${inst.name} is ready to play` }))
        .catch((err) => toastError(err, `Install failed for ${inst.name}`))
    } catch (err) {
      toastError(err, "Couldn't create instance")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      width={640}
      title="Create new instance"
      titleIcon={<Package size={22} className="text-accent" />}
      bodyClassName="p-0"
      footer={
        <>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={create}
            disabled={busy || !name.trim() || !mcVersion}
            icon={busy ? undefined : Check}
            data-testid="create-confirm"
          >
            {busy ? <Spinner size={16} /> : 'Create'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5 p-6">
        {/* Name + icon */}
        <div className="flex items-end gap-4">
          <div className="flex flex-col items-center gap-2">
            <InstanceIcon icon={icon} name={name || 'New'} size={72} />
          </div>
          <div className="flex-1">
            <FieldLabel>Instance name</FieldLabel>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setNameEdited(true)
              }}
              placeholder="My instance"
              data-testid="create-name"
              autoFocus
            />
          </div>
        </div>

        {/* Icon picker */}
        <div>
          <FieldLabel>Icon</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {BUILTIN_ICON_KEYS.map((key) => {
              const active = icon === `builtin:${key}`
              const { icon: Ic, from } = BUILTIN_ICONS[key]
              return (
                <button
                  key={key}
                  onClick={() => setIcon(`builtin:${key}`)}
                  className={cn(
                    'flex h-11 w-11 items-center justify-center rounded-md2 transition-all duration-fast',
                    active ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface-inset' : 'opacity-80 hover:opacity-100'
                  )}
                  style={{ background: from }}
                  aria-label={key}
                >
                  <Ic size={22} className="text-white" />
                </button>
              )
            })}
          </div>
        </div>

        {/* Loader */}
        <div>
          <FieldLabel>Mod loader</FieldLabel>
          <div className="grid grid-cols-5 gap-2">
            {LOADERS.map((l) => (
              <button
                key={l}
                onClick={() => setLoader(l)}
                data-testid={`loader-${l}`}
                className={cn(
                  'relative flex h-16 flex-col items-center justify-center gap-1 rounded-md2 border-[1.5px] text-small font-semibold transition-colors duration-fast',
                  loader === l
                    ? 'border-accent bg-accent-tint text-accent'
                    : 'border-transparent bg-surface-raised text-content-secondary hover:bg-surface-hover'
                )}
              >
                {loader === l && (
                  <motion.span
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent"
                  >
                    <Check size={11} className="text-accent-contrast" strokeWidth={3} />
                  </motion.span>
                )}
                <span className="text-lg">{LOADER_GLYPH[l]}</span>
                {LOADER_LABELS[l]}
              </button>
            ))}
          </div>
        </div>

        {/* Loader version */}
        {loader !== 'vanilla' && (
          <div>
            <FieldLabel>{LOADER_LABELS[loader]} version</FieldLabel>
            {loaderVersions === null ? (
              <div className="flex h-10 items-center gap-2 text-small text-content-secondary">
                <Spinner size={14} /> Fetching versions…
              </div>
            ) : loaderVersions.length === 0 ? (
              <p className="text-small text-danger">
                No {LOADER_LABELS[loader]} builds for Minecraft {mcVersion}. Try another version.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {['stable', 'latest', ...loaderVersions.slice(0, 6).map((v) => v.version)]
                  .filter((v, i, a) => a.indexOf(v) === i)
                  .map((v) => (
                    <button
                      key={v}
                      onClick={() => setLoaderVersion(v)}
                      className={cn(
                        'h-8 rounded-full px-3.5 text-small font-semibold capitalize transition-colors duration-fast',
                        loaderVersion === v
                          ? 'bg-accent text-accent-contrast'
                          : 'bg-surface-raised text-content-secondary hover:bg-surface-hover'
                      )}
                    >
                      {v}
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* Version picker */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <FieldLabel className="mb-0">Minecraft version</FieldLabel>
            <label className="flex cursor-pointer items-center gap-2 text-small text-content-secondary">
              <input
                type="checkbox"
                checked={showSnapshots}
                onChange={(e) => setShowSnapshots(e.target.checked)}
                className="accent-accent"
              />
              Show snapshots
            </label>
          </div>
          <SearchInput
            placeholder="Filter versions"
            value={versionQuery}
            onChange={(e) => setVersionQuery(e.target.value)}
            className="mb-2"
          />
          <div className="max-h-48 overflow-y-auto rounded-md2 bg-surface-base p-1.5">
            {!manifest && (
              <div className="flex justify-center py-6">
                <Spinner />
              </div>
            )}
            {versions.map((v) => (
              <button
                key={v.id}
                onClick={() => setMcVersion(v.id)}
                className={cn(
                  'flex w-full items-center justify-between rounded-sm2 px-3 py-2 text-left text-body transition-colors duration-fast',
                  mcVersion === v.id
                    ? 'bg-accent text-accent-contrast font-semibold'
                    : 'text-content-primary hover:bg-surface-hover'
                )}
              >
                <span>{v.id}</span>
                <span className={cn('text-tiny capitalize', mcVersion === v.id ? 'text-accent-contrast/80' : 'text-content-muted')}>
                  {v.type === 'release' ? '' : v.type.replace('old_', '')}
                </span>
              </button>
            ))}
            {manifest && versions.length === 0 && (
              <div className="flex items-center gap-2 px-3 py-4 text-small text-content-muted">
                <Search size={16} /> No versions match “{versionQuery}”.
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

const LOADER_GLYPH: Record<LoaderKind, string> = {
  vanilla: '🟩',
  fabric: '🧵',
  quilt: '🧶',
  forge: '🔨',
  neoforge: '⚒️'
}

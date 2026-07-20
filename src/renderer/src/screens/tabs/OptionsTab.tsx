import { useEffect, useMemo, useRef, useState } from 'react'
import { Cpu, HardDriveDownload, ImagePlus, RotateCcw, Save, Trash2 } from 'lucide-react'
import type { InstanceConfig, SystemMemory } from '@shared/types'
import { useInstances, useSettings, useToasts, toastError } from '@/stores/data'
import { useNav } from '@/stores/nav'
import { Button, Input } from '@/components/ui/ui'
import { InstanceIcon } from '@/components/InstanceIcon'
import { Slider } from '@/components/ui/slider'
import { FieldLabel } from '@/components/ui/modal'

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section className="rounded-card bg-surface-raised p-5">
      <h3 className="mb-4 text-h3 text-content-primary">{title}</h3>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  )
}

export function OptionsTab({ inst }: { inst: InstanceConfig }): React.JSX.Element {
  const refresh = useInstances((s) => s.refresh)
  const defaults = useSettings((s) => s.settings)
  const push = useToasts((s) => s.push)
  const { go } = useNav()
  const [sysMem, setSysMem] = useState<SystemMemory>({ totalMB: 16384 })

  const [name, setName] = useState(inst.name)
  const [memMin, setMemMin] = useState(inst.memMin)
  const [memMax, setMemMax] = useState(inst.memMax)
  const [jvmArgs, setJvmArgs] = useState(inst.jvmArgs)
  const [width, setWidth] = useState(inst.gameWidth ?? defaults.defaultWidth ?? 854)
  const [height, setHeight] = useState(inst.gameHeight ?? defaults.defaultHeight ?? 480)
  const savedRef = useRef(false)

  useEffect(() => {
    window.native.app.systemMemory().then(setSysMem)
  }, [])

  const memCeil = useMemo(() => Math.max(2048, Math.floor(sysMem.totalMB / 1024) * 1024), [sysMem])

  const dirty =
    name !== inst.name ||
    memMin !== inst.memMin ||
    memMax !== inst.memMax ||
    jvmArgs !== inst.jvmArgs ||
    width !== (inst.gameWidth ?? defaults.defaultWidth ?? 854) ||
    height !== (inst.gameHeight ?? defaults.defaultHeight ?? 480)

  const save = async (): Promise<void> => {
    try {
      await window.native.instances.update(inst.id, {
        name: name.trim(),
        memMin: Math.min(memMin, memMax),
        memMax,
        jvmArgs,
        gameWidth: width,
        gameHeight: height
      })
      await refresh()
      savedRef.current = true
      push({ kind: 'success', title: 'Options saved' })
    } catch (err) {
      toastError(err)
    }
  }

  return (
    <div className="h-full overflow-y-auto px-6 pb-24">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 pt-1">
        <Section title="General">
          <div className="flex items-end gap-4">
            <InstanceIcon icon={inst.icon} name={inst.name} size={56} />
            <div className="flex-1">
              <FieldLabel>Instance name</FieldLabel>
              <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="options-name" />
            </div>
            <Button
              variant="secondary"
              icon={ImagePlus}
              onClick={() => {
                window.native.icons
                  .importImage()
                  .then(async (ref) => {
                    if (!ref) return
                    await window.native.instances.update(inst.id, { icon: ref })
                    await refresh()
                    push({ kind: 'success', title: 'Instance image updated' })
                  })
                  .catch(toastError)
              }}
            >
              Change image
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel>Minecraft version</FieldLabel>
              <Input value={inst.mcVersion} disabled />
            </div>
            <div>
              <FieldLabel>Mod loader</FieldLabel>
              <Input value={inst.loaderVersion ? `${inst.loader} ${inst.loaderVersion}` : inst.loader} disabled />
            </div>
          </div>
        </Section>

        <Section title="Memory">
          <div>
            <div className="mb-1 flex items-center gap-2 text-body font-bold text-content-primary">
              <Cpu size={16} /> Maximum RAM
            </div>
            <p className="mb-2 text-small text-content-muted">
              {sysMem.totalMB >= 1024 ? `${Math.round(sysMem.totalMB / 1024)} GB` : `${sysMem.totalMB} MB`} system memory
              available. 4–8 GB is plenty for most modpacks.
            </p>
            <Slider
              value={memMax}
              min={1024}
              max={memCeil}
              step={512}
              onChange={(v) => {
                setMemMax(v)
                if (memMin > v) setMemMin(v)
              }}
              formatValue={(v) => `${(v / 1024).toFixed(1)} GB`}
              label="Maximum RAM"
            />
          </div>
          <div>
            <FieldLabel>Minimum RAM</FieldLabel>
            <Slider
              value={memMin}
              min={512}
              max={memMax}
              step={512}
              onChange={setMemMin}
              formatValue={(v) => `${(v / 1024).toFixed(1)} GB`}
              label="Minimum RAM"
            />
          </div>
        </Section>

        <Section title="Window & Java">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel>Window width</FieldLabel>
              <Input type="number" value={width} onChange={(e) => setWidth(Number(e.target.value))} />
            </div>
            <div>
              <FieldLabel>Window height</FieldLabel>
              <Input type="number" value={height} onChange={(e) => setHeight(Number(e.target.value))} />
            </div>
          </div>
          <div>
            <FieldLabel>JVM arguments</FieldLabel>
            <Input
              value={jvmArgs}
              onChange={(e) => setJvmArgs(e.target.value)}
              placeholder="-XX:+UseG1GC -XX:+ParallelRefProcEnabled"
              className="font-mono text-small"
              data-testid="options-jvm"
            />
            <p className="mt-1.5 text-tiny text-content-muted">
              Advanced. Native picks a matching Java runtime automatically for {inst.mcVersion}.
            </p>
          </div>
        </Section>

        <Section title="Maintenance">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              icon={HardDriveDownload}
              onClick={() => {
                push({ kind: 'info', title: 'Verifying & repairing files…' })
                window.native.instances
                  .install(inst.id)
                  .then(() => push({ kind: 'success', title: 'Files verified' }))
                  .catch(toastError)
              }}
            >
              Verify & repair files
            </Button>
            <Button
              variant="secondary"
              icon={Trash2}
              onClick={() => {
                if (!window.confirm(`Delete "${inst.name}" and all its files? This cannot be undone.`)) return
                window.native.instances
                  .remove(inst.id)
                  .then(() => {
                    push({ kind: 'info', title: `Deleted ${inst.name}` })
                    go({ name: 'library' })
                  })
                  .catch(toastError)
              }}
              className="text-danger hover:bg-danger-tint"
            >
              Delete instance
            </Button>
          </div>
        </Section>
      </div>

      {/* Sticky save bar */}
      {dirty && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-20 -translate-x-1/2">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-surface-active/95 py-2 pl-5 pr-2 shadow-modal backdrop-blur">
            <span className="text-small text-content-secondary">Unsaved changes</span>
            <Button
              size="sm"
              variant="ghost"
              icon={RotateCcw}
              onClick={() => {
                setName(inst.name)
                setMemMin(inst.memMin)
                setMemMax(inst.memMax)
                setJvmArgs(inst.jvmArgs)
                setWidth(inst.gameWidth ?? defaults.defaultWidth ?? 854)
                setHeight(inst.gameHeight ?? defaults.defaultHeight ?? 480)
              }}
            >
              Reset
            </Button>
            <Button size="sm" icon={Save} onClick={save} data-testid="options-save">
              Save changes
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

import { AlertTriangle, ClipboardCopy, FolderOpen } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/ui'
import { useInstances, useRunning, useToasts } from '@/stores/data'

/** Crash detection surface: copyable report + open folder. */
export function CrashDialog(): React.JSX.Element {
  const { crash, clearCrash } = useRunning()
  const byId = useInstances((s) => s.byId)
  const push = useToasts((s) => s.push)
  const [copied, setCopied] = useState(false)

  const inst = crash ? byId(crash.instanceId) : null
  const text = crash?.report ?? crash?.lastLog ?? ''

  return (
    <Modal
      open={crash !== null}
      onClose={clearCrash}
      width={720}
      title={
        <span className="flex items-center gap-3">
          <AlertTriangle className="text-danger" size={24} />
          {inst?.name ?? 'Game'} crashed
        </span>
      }
      footer={
        <>
          <div className="text-small text-content-secondary">
            Exit code {crash?.exitCode ?? '—'}
            {crash?.reportPath ? ' · crash report captured' : ' · last log lines shown'}
          </div>
          <div className="flex gap-2">
            {crash?.reportPath && (
              <Button
                variant="secondary"
                icon={FolderOpen}
                onClick={() => void window.native.app.revealFile(crash.reportPath!)}
              >
                Show file
              </Button>
            )}
            <Button
              icon={ClipboardCopy}
              onClick={() => {
                void navigator.clipboard.writeText(text).then(() => {
                  setCopied(true)
                  push({ kind: 'success', title: 'Crash report copied' })
                  setTimeout(() => setCopied(false), 1500)
                })
              }}
            >
              {copied ? 'Copied!' : 'Copy report'}
            </Button>
          </div>
        </>
      }
    >
      <pre className="max-h-[46vh] overflow-auto whitespace-pre-wrap rounded-md2 bg-surface-base p-4 font-mono text-[13px] leading-[19px] text-content-secondary">
        {text || 'No crash output was captured.'}
      </pre>
    </Modal>
  )
}

import { Coffee, Download } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/ui'
import { useJavaAsk } from '@/stores/data'
import { formatBytes } from '@/lib/util'

/**
 * Shown when a launch needs a Java runtime that isn't installed anywhere on
 * this machine. The launch is paused in the main process until answered;
 * declining cancels the launch before any game files are downloaded.
 */
export function JavaDownloadDialog(): React.JSX.Element {
  const { request, answer } = useJavaAsk()

  return (
    <Modal
      open={request !== null}
      onClose={() => answer(false)}
      width={480}
      title={
        <span className="flex items-center gap-3">
          <Coffee size={24} />
          Java {request?.major} required
        </span>
      }
      footer={
        <>
          <div className="text-small text-content-secondary">
            {request ? formatBytes(request.sizeBytes) : ''} · Eclipse Temurin {request?.javaVersion}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => answer(false)} data-testid="java-ask-cancel">
              Cancel launch
            </Button>
            <Button icon={Download} onClick={() => answer(true)} data-testid="java-ask-accept">
              Download Java {request?.major}
            </Button>
          </div>
        </>
      }
    >
      <p className="text-body text-content-secondary">
        {request?.instanceName ? (
          <>
            <span className="font-semibold text-content-primary">{request.instanceName}</span>
            {request.mcVersion ? ` (Minecraft ${request.mcVersion})` : ''}
          </>
        ) : (
          'This version of Minecraft'
        )}{' '}
        needs Java {request?.major}, which isn&apos;t installed on this computer. Native can download
        it now and keep it in its own folder — it won&apos;t touch your system Java, and other
        instances that need Java {request?.major} will reuse it.
      </p>
    </Modal>
  )
}

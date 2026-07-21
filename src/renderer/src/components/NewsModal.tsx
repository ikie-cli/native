import { CalendarDays, ExternalLink, Newspaper } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button, Chip } from '@/components/ui/ui'
import { useNews } from '@/stores/data'
import { useModals } from '@/stores/nav'
import { formatDate } from '@/lib/util'

/** Full-article news reader. */
export function NewsModal(): React.JSX.Element {
  const { newsItemId, openNews } = useModals()
  const item = useNews((s) => s.items.find((n) => n.id === newsItemId) ?? null)

  return (
    <Modal
      open={item !== null}
      onClose={() => openNews(null)}
      width={680}
      bodyClassName="p-0"
      title={
        <span className="flex items-center gap-3">
          <Newspaper size={22} />
          Minecraft news
        </span>
      }
      footer={
        item ? (
          <>
            <div className="flex items-center gap-2 text-small text-content-secondary">
              <CalendarDays size={15} />
              {formatDate(item.date)}
            </div>
            <Button
              icon={ExternalLink}
              variant="secondary"
              onClick={() => void window.native.app.openExternal(item.url)}
            >
              Read on minecraft.net
            </Button>
          </>
        ) : undefined
      }
    >
      {item && (
        <article data-testid="news-article">
          {item.image && (
            <div className="max-h-[300px] w-full overflow-hidden bg-surface-base">
              <img src={item.image} alt="" className="w-full object-cover" />
            </div>
          )}
          <div className="p-6">
            <Chip>{item.category}</Chip>
            <h1 className="mt-3 text-h1 leading-snug text-content-primary">{item.title}</h1>
            <p className="mt-4 whitespace-pre-line text-[15px] leading-[1.7] text-content-secondary">
              {item.text || 'Open the full story on minecraft.net for all the details.'}
            </p>
          </div>
        </article>
      )}
    </Modal>
  )
}

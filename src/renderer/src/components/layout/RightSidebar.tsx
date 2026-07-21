import { ChevronDown, Newspaper } from 'lucide-react'
import { useAccounts, useNews } from '@/stores/data'
import { useModals } from '@/stores/nav'
import { timeAgo } from '@/lib/util'
import { Spinner } from '@/components/ui/ui'
import { PlayerHead } from '@/components/PlayerHead'

function PlayingAs(): React.JSX.Element {
  const accounts = useAccounts((s) => s.accounts)
  const setAccountsOpen = useModals((s) => s.setAccountsOpen)
  const active = accounts.find((a) => a.active)

  return (
    <section className="border-b border-line-subtle p-4">
      <h3 className="mb-3 text-h3 text-content-primary">Playing as</h3>
      {active ? (
        <button
          onClick={() => setAccountsOpen(true)}
          className="flex w-full items-center gap-3 rounded-md2 bg-surface-raised p-3 text-left transition-colors duration-fast hover:bg-surface-hover"
        >
          <PlayerHead account={active} size={36} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-body font-bold text-content-primary">{active.username}</div>
            <div className="text-small text-content-secondary">
              {active.type === 'msa' ? 'Minecraft account' : 'Offline account'}
            </div>
          </div>
          <ChevronDown size={18} className="text-content-secondary" />
        </button>
      ) : (
        <p className="text-body text-content-secondary">
          <button className="font-bold text-accent hover:underline" onClick={() => setAccountsOpen(true)}>
            Sign in to a Minecraft account
          </button>{' '}
          to start playing!
        </p>
      )}
    </section>
  )
}

function NewsPanel(): React.JSX.Element {
  const { items, loaded, error } = useNews()
  const openNews = useModals((s) => s.openNews)
  return (
    <section className="min-h-0 flex-1 overflow-y-auto p-4">
      <h3 className="mb-3 text-h3 text-content-primary">News</h3>
      {!loaded && (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      )}
      {loaded && error && (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <Newspaper size={28} className="text-content-muted" />
          <p className="text-small text-content-secondary">News is unavailable right now.</p>
        </div>
      )}
      <div className="flex flex-col gap-3">
        {items.slice(0, 8).map((n) => (
          <button
            key={n.id}
            onClick={() => openNews(n.id)}
            className="group overflow-hidden rounded-md2 bg-surface-raised text-left transition-colors duration-fast hover:bg-surface-hover"
          >
            {n.image && (
              <div className="aspect-[2/1] w-full overflow-hidden bg-surface-inset">
                <img
                  src={n.image}
                  alt=""
                  loading="lazy"
                  className="mono-media h-full w-full object-cover transition-transform duration-page group-hover:scale-105"
                />
              </div>
            )}
            <div className="p-3">
              <div className="line-clamp-2 text-body font-bold text-content-primary">{n.title}</div>
              <div className="mt-1 text-tiny text-content-muted">
                {n.category} · {timeAgo(n.date)}
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}

/** 300px context sidebar (design-system.md §4). */
export function RightSidebar(): React.JSX.Element {
  return (
    <aside className="hidden w-[300px] shrink-0 flex-col border-l border-line-subtle bg-surface-base min-[1100px]:flex">
      <PlayingAs />
      <NewsPanel />
    </aside>
  )
}

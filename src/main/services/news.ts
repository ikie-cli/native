import type { NewsItem } from '@shared/types'
import { URLS } from '../paths'
import { fetchJsonCached } from '../core/install'

interface RawNews {
  entries: {
    id?: string
    title: string
    category?: string
    date: string
    text?: string
    playPageImage?: { url: string }
    newsPageImage?: { url: string }
    readMoreLink?: string
    newsType?: string[]
  }[]
}

/** Official Minecraft launcher news feed. */
export async function fetchNews(): Promise<NewsItem[]> {
  const base = URLS.launcherContent()
  const raw = await fetchJsonCached<RawNews>(`${base}/v2/news.json`, 'news.json', 60 * 60 * 1000)
  const entries = raw.entries ?? []
  return entries
    .filter((e) => !e.newsType || e.newsType.includes('Java'))
    .slice(0, 30)
    .map((e, i) => {
      const img = e.newsPageImage?.url ?? e.playPageImage?.url ?? null
      return {
        id: e.id ?? `news-${i}`,
        title: e.title,
        category: e.category ?? 'News',
        date: e.date,
        image: img ? (img.startsWith('http') ? img : `${base}${img}`) : null,
        url: e.readMoreLink ?? 'https://www.minecraft.net',
        text: e.text ?? ''
      }
    })
}

import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { useMemo } from 'react'

// External links open in the system browser; renderer navigation is blocked.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('data-external', 'true')
    node.removeAttribute('target')
  }
})

const PURIFY_OPTS = {
  ALLOWED_TAGS: [
    'a', 'p', 'br', 'hr', 'b', 'strong', 'i', 'em', 'u', 's', 'del', 'code', 'pre',
    'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'img',
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'details', 'summary', 'span', 'div', 'center'
  ],
  ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'width', 'height', 'align', 'data-external'],
  ALLOW_DATA_ATTR: false
}

export function renderRichText(body: string, format: 'markdown' | 'html'): string {
  const html = format === 'markdown' ? (marked.parse(body, { async: false }) as string) : body
  return DOMPurify.sanitize(html, PURIFY_OPTS)
}

/**
 * Sanitized long-form content (mod descriptions, articles). Clicks on links
 * are intercepted and sent to the system browser.
 */
export function RichText({
  body,
  format,
  className
}: {
  body: string
  format: 'markdown' | 'html'
  className?: string
}): React.JSX.Element {
  const html = useMemo(() => renderRichText(body, format), [body, format])
  return (
    <div
      className={`richtext ${className ?? ''}`}
      onClick={(e) => {
        const a = (e.target as HTMLElement).closest('a')
        if (a?.href) {
          e.preventDefault()
          if (/^https?:\/\//.test(a.href)) void window.native.app.openExternal(a.href)
        }
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

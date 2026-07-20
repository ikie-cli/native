const UA = 'NativeLauncher/0.1.0 (native-launcher)'

export interface FetchOpts {
  timeoutMs?: number
  retries?: number
  headers?: Record<string, string>
  method?: string
  body?: string
  /** treat these statuses as retryable */
  retryOn?: number[]
}

export async function httpRaw(url: string, opts: FetchOpts = {}): Promise<Response> {
  const { timeoutMs = 30_000, retries = 3, retryOn = [408, 429, 500, 502, 503, 504] } = opts
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), timeoutMs)
    try {
      const res = await fetch(url, {
        method: opts.method ?? 'GET',
        headers: { 'user-agent': UA, ...opts.headers },
        body: opts.body,
        signal: ac.signal
      })
      if (!res.ok && retryOn.includes(res.status) && attempt < retries) {
        lastErr = new Error(`HTTP ${res.status} for ${url}`)
        await backoff(attempt)
        continue
      }
      return res
    } catch (err) {
      lastErr = err
      if (attempt < retries) {
        await backoff(attempt)
        continue
      }
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

async function backoff(attempt: number): Promise<void> {
  const ms = Math.min(8000, 500 * 2 ** attempt) + Math.random() * 250
  await new Promise((r) => setTimeout(r, ms))
}

export async function fetchJson<T>(url: string, opts: FetchOpts = {}): Promise<T> {
  const res = await httpRaw(url, opts)
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return (await res.json()) as T
}

export async function fetchText(url: string, opts: FetchOpts = {}): Promise<string> {
  const res = await httpRaw(url, opts)
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return await res.text()
}

export async function postForm<T>(
  url: string,
  form: Record<string, string>,
  opts: FetchOpts = {}
): Promise<{ status: number; json: T }> {
  const res = await httpRaw(url, {
    ...opts,
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...opts.headers },
    body: new URLSearchParams(form).toString(),
    retryOn: []
  })
  const json = (await res.json().catch(() => ({}))) as T
  return { status: res.status, json }
}

export async function postJson<T>(
  url: string,
  body: unknown,
  opts: FetchOpts = {}
): Promise<{ status: number; json: T }> {
  const res = await httpRaw(url, {
    ...opts,
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', ...opts.headers },
    body: JSON.stringify(body)
  })
  const json = (await res.json().catch(() => ({}))) as T
  return { status: res.status, json }
}

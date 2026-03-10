export class HttpError extends Error {
  status: number
  bodyText?: string
  constructor(status: number, message: string, bodyText?: string) {
    super(message)
    this.status = status
    this.bodyText = bodyText
  }
}

export async function fetchJson<T>(
  url: string,
  opts?: {
    timeoutMs?: number
    signal?: AbortSignal
    method?: string
    headers?: Record<string, string>
    body?: BodyInit | null
  }
): Promise<T> {
  const timeoutMs = opts?.timeoutMs ?? 10_000

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  const signal = mergeSignals(opts?.signal, controller.signal)

  try {
    const res = await fetch(url, {
      method: opts?.method ?? 'GET',
      headers: { 'Accept': 'application/json', ...(opts?.headers ?? {}) },
      body: opts?.body,
      signal
    })

    const text = await res.text()
    if (!res.ok) {
      throw new HttpError(res.status, `HTTP ${res.status} for ${url}`, text)
    }

    if (!text) return {} as T
    return JSON.parse(text) as T
  } finally {
    clearTimeout(timeout)
  }
}

function mergeSignals(a?: AbortSignal, b?: AbortSignal): AbortSignal | undefined {
  if (!a) return b
  if (!b) return a

  if (a.aborted) return a
  if (b.aborted) return b

  const controller = new AbortController()
  const onAbort = () => controller.abort()
  a.addEventListener('abort', onAbort)
  b.addEventListener('abort', onAbort)
  return controller.signal
}

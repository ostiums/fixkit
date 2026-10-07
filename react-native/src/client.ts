// Talks to the receiver the fixkit mod runs on this Mac. The simulator shares the Mac's loopback
// interface, so no address has to be configured.
const BASE = 'http://127.0.0.1:4747'

/** The receiver's answer about a report: its run, its id and where Claude is with it. */
export type ReportStatus = { run: string; id: string | null; status: string | null }

async function call<T>(path: string, init: RequestInit | undefined, timeout: number): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(BASE + path, { ...init, signal: controller.signal })
    if (!response.ok) throw new Error(`${path} answered ${response.status}`)
    return (await response.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

/** Sends the report and returns its id. The receiver answers once it has read the screen. */
export async function sendReport(body: object) {
  const headers = { 'Content-Type': 'application/json' }
  const receipt = await call<{ id: string }>('/report', { method: 'POST', headers, body: JSON.stringify(body) }, 20_000)
  return receipt.id
}

export const statusOf = (id: string) => call<ReportStatus>(`/status?id=${encodeURIComponent(id)}`, undefined, 3_000)

/**
 * Says the app is up with its latest code; answers the report Claude is working on, else the newest.
 * At launch it sends a stack from the bundle it runs, whose source map the receiver then keeps.
 */
export const launched = (stack: string | null) =>
  call<ReportStatus>('/launched', { method: 'POST', body: stack ? JSON.stringify({ stack }) : undefined }, 3_000)

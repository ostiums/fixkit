// Talks to the receiver the fixkit mod runs on this Mac. The simulator shares the Mac's loopback
// interface, and the receiver has adb reverse its port on the Android emulator's, so no address
// has to be configured.
const BASE = 'http://127.0.0.1:4747'

/** The receiver's answer about a report: its run, its id, where the agent is with it and which agent it is. */
export type ReportStatus = { run: string; id: string | null; status: string | null; agent?: string }

/** The receiver's answer to a report; `agent` is absent from an older receiver. */
export type Receipt = { id: string; agent?: string }

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

/** Sends the report and returns its receipt. The receiver answers once it has read the screen. */
export async function sendReport(body: object) {
  const headers = { 'Content-Type': 'application/json' }
  return call<Receipt>('/report', { method: 'POST', headers, body: JSON.stringify(body) }, 20_000)
}

export const statusOf = (id: string) => call<ReportStatus>(`/status?id=${encodeURIComponent(id)}`, undefined, 3_000)

/**
 * Says the app is up with its latest code; answers the report the agent is working on, else the newest.
 * At launch it sends a stack from the bundle it runs, whose source map the receiver then keeps.
 */
export const launched = (stack: string | null) =>
  call<ReportStatus>('/launched', { method: 'POST', body: stack ? JSON.stringify({ stack }) : undefined }, 3_000)

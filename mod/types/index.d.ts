export type FixStatus = 'queued' | 'fixing' | 'rebuilding' | 'live' | 'stopped'

/** An accessibility element as the receiver summarises it. */
export type AxElement = {
  type: string
  label: string | null
  value: string | null
  identifier: string | null
}

/** What accessibility says the touch landed on. */
export type Accessibility = {
  element: AxElement
  /** The nearest named element around it: the button around an icon, say. */
  within: AxElement | null
  /** Labels of the elements beside it in the same row, nearest first. */
  nearby: string[]
}

/** A report as the receiver prints it, one JSON line each. */
export type Incoming = {
  id: string
  comment: string
  screen: string
  screenshot: string | null
  touch?: { x: number; y: number }
  /** The element marked with `.fixable` under the touch, when there is one. */
  element?: {
    name: string
    file: string
    line: number
  }
  accessibility?: Accessibility | null
}

export type FixReport = {
  id: string
  comment: string
  /** The `.fixable` name of what was pressed, when the app marks it. */
  element: string | null
  accessibility: Accessibility | null
  /** `path:line` of the element's declaration, relative to the project. */
  source: string | null
  screen: string
  screenshot: string | null
  status: FixStatus
  receivedAt: number
  finishedAt: number | null
  /** Names of the files Claude edited for this report. */
  edited: string[]
}

export type Receiver = {
  state: 'starting' | 'listening' | 'failed'
  detail: string
  /** Advice that stays in the pane: how to install AXe, say. */
  notice?: string
}

declare module 'claude-code' {
  interface PluginState {
    fixkit: { reports: FixReport[]; receiver: Receiver; now: number }
  }
}

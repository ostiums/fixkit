export type FixStatus = 'queued' | 'fixing' | 'rebuilding' | 'live' | 'stopped'

/** Where a report came from: a Swift app, or a React Native one through react-native-fixkit. */
export type Platform = 'ios' | 'react-native'

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
  /** Sent by a React Native app; a Swift app sends none. */
  platform?: 'react-native'
  screen: string
  screenshot: string | null
  touch?: { x: number; y: number }
  /**
   * The element under the touch: one marked with `.fixable`, with its source line, or in a UIKit
   * app a view named after the property that holds it (`ProfileViewController.nameLabel`), without one.
   */
  element?: {
    name: string
    file?: string
    line?: number
    /** React Native only: where the components around the element are used, nearest first. */
    usedAt?: { file: string; line: number }[]
  }
  /** UIKit only: the pressed view's class and text, as the app sees it. */
  viewDescription?: string
  accessibility?: Accessibility | null
}

export type FixReport = {
  id: string
  comment: string
  /** What was pressed: its `.fixable` name, or in a UIKit app the property that holds it (`Type.property`). */
  element: string | null
  accessibility: Accessibility | null
  /** UIKit only: the pressed view's class and text. */
  viewDescription: string | null
  /** `path:line` of the element's declaration, relative to the project. */
  source: string | null
  /** React Native only: `path:line` of each use of the components around the element. */
  usedAt: string[]
  platform: Platform
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

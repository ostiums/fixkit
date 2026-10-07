import { Keyboard, Platform } from 'react-native'

import { OFFLINE, SENT, bannerFor, type Banner } from './banners'
import { launched, sendReport, statusOf } from './client'
import { reportBody, type Target } from './report'

export type SessionState = {
  /** The press being reported while the composer is open. */
  target: Target | null
  /** The comment being typed. */
  draft: string
  banner: Banner | null
  /** The press outlined while the receiver takes its screenshot. */
  outline: Target | null
  /** A report is on its way: the receiver answers once it has read the screen. */
  sending: boolean
  /** How far the app is slid up so the composer does not cover the pressed element. */
  lift: number
}

let state: SessionState = { target: null, draft: '', banner: null, outline: null, sending: false, lift: 0 }
const listeners = new Set<() => void>()

function set(change: Partial<SessionState>) {
  state = { ...state, ...change }
  listeners.forEach(listener => listener())
}

export const store = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}

// Each follow holds a ticket; a newer follow or a new report retires the older one.
let ticket = 0
let hiding: ReturnType<typeof setTimeout> | null = null

export const isBusy = () => state.target !== null || state.sending

export function begin(target: Target) {
  if (!isBusy()) set({ target, draft: '' })
}

export const setDraft = (draft: string) => set({ draft })

export function setLift(lift: number) {
  if (lift !== state.lift) set({ lift })
}

export const cancel = () => set({ target: null, lift: 0 })

export async function send() {
  const { target } = state
  const comment = state.draft.trim()
  if (!target || !comment || state.sending) return

  ticket++
  hide()
  set({ target: null, lift: 0, sending: true })
  // The receiver takes the screenshot and reads the screen as the report arrives, so the report
  // leaves once the composer and the keyboard are gone and the outline is on screen.
  await keyboardGone()
  set({ outline: target })
  await frames(2)
  try {
    const id = await sendReport(reportBody(target, comment, String(Platform.Version)))
    set({ sending: false, outline: null })
    show(SENT)
    void follow(id)
  } catch {
    set({ sending: false, outline: null })
    show(OFFLINE, 4000)
  }
}

/**
 * At launch and after every Fast Refresh: tells the receiver the app runs its latest code, which is
 * how the mod learns a fix is on screen, then follows the report Claude is working on. A report
 * already over shows nothing, so a later reload never repeats its banner. `bundle` is given at
 * launch only: a Fast Refresh does not reload the bundle.
 */
export async function announceLaunch(bundle: string | null = null) {
  try {
    const { id, status } = await launched(bundle)
    if (id && status && status !== 'live' && status !== 'stopped') void follow(id)
  } catch {}
}

async function follow(id: string) {
  const mine = ++ticket
  while (mine === ticket) {
    await sleep(1000)
    let status: string | null = null
    try {
      status = (await statusOf(id)).status
    } catch {}
    if (mine !== ticket || status === null) continue
    if (status === 'live' || status === 'stopped') {
      ticket++
      show(bannerFor(status), 4000)
      return
    }
    show(bannerFor(status))
  }
}

function show(banner: Banner, hideAfter?: number) {
  hide()
  set({ banner })
  if (hideAfter !== undefined) hiding = setTimeout(() => set({ banner: null }), hideAfter)
}

function hide() {
  if (hiding !== null) clearTimeout(hiding)
  hiding = null
  if (state.banner !== null) set({ banner: null })
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const frames = (count: number) =>
  new Promise<void>(resolve => {
    const step = (left: number) => (left === 0 ? resolve() : requestAnimationFrame(() => step(left - 1)))
    step(count)
  })

/** Resolves once the keyboard has slid away, or after a second. */
function keyboardGone() {
  Keyboard.dismiss()
  if (!Keyboard.isVisible()) return Promise.resolve()
  return new Promise<void>(resolve => {
    const done = () => {
      subscription.remove()
      clearTimeout(timer)
      resolve()
    }
    const subscription = Keyboard.addListener('keyboardDidHide', done)
    const timer = setTimeout(done, 1000)
  })
}

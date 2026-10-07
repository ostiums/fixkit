import { Keyboard, Platform } from 'react-native'

import { OFFLINE, SENT, bannerFor, type Banner } from './banners'
import { launched, sendReport, statusOf } from './client'
import { reportBody, type Target } from './report'

export type SessionState = {
  /** The press being reported while the composer is open. */
  target: Target | null
  /** The comment typed so far has more than spaces. */
  canSend: boolean
  banner: Banner | null
  /** The press outlined while the receiver takes its screenshot. */
  outline: Target | null
  /** A report is on its way: the receiver answers once it has read the screen. */
  sending: boolean
  /** How far the app is slid up so the composer does not cover the pressed element. */
  lift: number
}

let state: SessionState = { target: null, canSend: false, banner: null, outline: null, sending: false, lift: 0 }
// The comment being typed, out of the state: a keystroke re-renders nothing unless `canSend` changes.
let draft = ''
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
// How long the host's spring takes to slide the app back down.
const LIFT_SETTLES = 400

/** A report Claude is done with: its fix is on screen, or the turn ended without it. */
const isOver = (status: string) => status === 'live' || status === 'stopped'

export const isBusy = () => state.target !== null || state.sending

export function begin(target: Target) {
  if (isBusy()) return
  draft = ''
  set({ target, canSend: false })
}

export function setDraft(text: string) {
  draft = text
  const canSend = text.trim().length > 0
  if (canSend !== state.canSend) set({ canSend })
}

export function setLift(lift: number) {
  if (lift !== state.lift) set({ lift })
}

export const cancel = () => set({ target: null, lift: 0 })

export async function send() {
  const { target, lift } = state
  const comment = draft.trim()
  if (!target || !comment || state.sending) return

  ticket++
  hide()
  set({ target: null, lift: 0, sending: true })
  // The receiver takes the screenshot and reads the screen as the report arrives, so the report
  // leaves once the composer and the keyboard are gone, the app has slid back down and the outline
  // is on screen.
  await Promise.all([keyboardGone(), lift > 0 ? sleep(LIFT_SETTLES) : null])
  set({ outline: target })
  await frames(2)
  let id: string | null = null
  try {
    id = await sendReport(reportBody(target, comment, String(Platform.Version)))
  } catch {}
  set({ sending: false, outline: null })
  if (id === null) {
    show(OFFLINE, 4000)
    return
  }
  show(SENT)
  void follow(id)
}

/**
 * At launch and after every Fast Refresh: tells the receiver the app runs its latest code, which is
 * how the mod learns a fix is on screen, then follows the report Claude is working on. A report
 * already over shows nothing, so a later reload never repeats its banner. `stack`, a stack from the
 * bundle that runs, is given at launch only: a Fast Refresh does not reload the bundle.
 */
export async function announceLaunch(stack: string | null = null) {
  try {
    const { id, status } = await launched(stack)
    if (id && status && !isOver(status)) void follow(id)
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
    if (isOver(status)) {
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

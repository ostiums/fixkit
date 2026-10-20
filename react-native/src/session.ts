import { Keyboard, PixelRatio, Platform } from 'react-native'

import { OFFLINE, agentOf, bannerFor, sentTo, type Banner } from './banners'
import { launched, sendReport, statusOf, type Receipt, type ReportStatus } from './client'
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
// How long Android's keyboard takes to slide away after it says it is hidden, as it starts to.
const KEYBOARD_SLIDES = 350

/** A report the agent is done with: its fix is on screen, or the turn ended without it. */
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
  const keyboard = keyboardGone().then(() => (Platform.OS === 'android' ? sleep(KEYBOARD_SLIDES) : undefined))
  await Promise.all([keyboard, lift > 0 ? sleep(LIFT_SETTLES) : null])
  set({ outline: target })
  await frames(2)
  let receipt: Receipt | null = null
  try {
    const platform = Platform.OS === 'android' ? 'android' : 'ios'
    receipt = await sendReport(reportBody(target, comment, { os: String(Platform.Version), platform, pixelRatio: PixelRatio.get() }))
  } catch {}
  set({ sending: false, outline: null })
  if (receipt === null) {
    show(OFFLINE, 4000)
    return
  }
  show(sentTo(agentOf(receipt)))
  void follow(receipt.id)
}

/**
 * At launch and after every Fast Refresh: tells the receiver the app runs its latest code, which is
 * how the mod learns a fix is on screen, then follows the report the agent is working on. A report
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
    let answer: ReportStatus | null = null
    try {
      answer = await statusOf(id)
    } catch {}
    if (mine !== ticket || !answer?.status) continue
    const status = answer.status
    const agent = agentOf(answer)
    if (isOver(status)) {
      ticket++
      show(bannerFor(status, agent), 4000)
      return
    }
    show(bannerFor(status, agent))
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

/** A status shown at the top of the screen: a spinner while work goes on, else a glyph. */
export type Banner = { text: string; glyph: string | null; working: boolean }

/** The agent an answer comes from; an older receiver names none and was always Claude Code. */
export const agentOf = (answer: { agent?: string }) => answer.agent ?? 'Claude Code'

export const sentTo = (agent: string): Banner => ({ text: `Sent to ${agent}`, glyph: null, working: true })

/** The receiver did not answer: the agent is the one last heard from, if any. */
export const offline = (agent: string | null): Banner => ({
  text: agent === null ? 'No agent is listening' : `${agent} is not listening`,
  glyph: '!',
  working: false,
})

/** The composer's placeholder: the agent last heard from, if any. */
export const composerHint = (agent: string | null) => (agent === null ? 'What needs fixing here?' : `What should ${agent} fix here?`)

/** The banner for a report's status as the receiver gives it. */
export function bannerFor(status: string, agent: string): Banner {
  switch (status) {
    case 'fixing':
      return { text: `${agent} is fixing it`, glyph: null, working: true }
    case 'rebuilding':
      return { text: 'Rebuilding the app', glyph: null, working: true }
    case 'live':
      return { text: `Fixed by ${agent}`, glyph: '✓', working: false }
    case 'stopped':
      return { text: `Not applied: see ${agent}`, glyph: '✕', working: false }
    default:
      return { text: `Queued in ${agent}`, glyph: null, working: true }
  }
}

// The status rules every harness follows, so a report reads the same in the app's banners
// whichever agent works on it: queued → fixing → rebuilding → live, or stopped.

/** @typedef {import('../types').FixStatus} FixStatus */

/** The report's own turn has started. @returns {FixStatus} */
export const started = () => 'fixing'

/** The app is being built and launched. @returns {FixStatus} */
export const building = () => 'rebuilding'

/** The app launched while the report was worked on: whatever built it, the fix is on screen. @returns {FixStatus} */
export const launched = () => 'live'

/**
 * A build call has returned. A launch during it has made the report live; otherwise the work goes on.
 * @param {FixStatus} status
 * @returns {FixStatus}
 */
export const buildEnded = status => (status === 'rebuilding' ? 'fixing' : status)

/**
 * The report's turn has ended. Live only when the app launched with the fix and the turn ended with an answer.
 * @param {FixStatus} status
 * @param {boolean} answered
 * @returns {FixStatus}
 */
export const finished = (status, answered) => (answered && status === 'live' ? 'live' : 'stopped')

/** @param {FixStatus} status */
export const isActive = status => status !== 'live' && status !== 'stopped'

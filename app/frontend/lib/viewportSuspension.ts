// Coordinator for pausing useViewport's debounced camera → H3-cells commits
// during flows where camera movement should NOT change the live-stream
// subscription area. Today that's satellite orbit inspection: entering
// selection freezes the subscription so the user can pan/zoom around the
// orbit without re-bootstrapping thousands of regional assets on deselect.
// Live deltas for non-selected assets pause while frozen — intentional, since
// the user is focused on the orbit — and catch up via the next WS ticks once
// the subscription resumes.

let suspendCount = 0
let committer: (() => void) | null = null

export function suspendViewportUpdates(): void {
  suspendCount++
}

export function resumeViewportUpdates(): void {
  if (suspendCount > 0) suspendCount--
}

export function isViewportSuspended(): boolean {
  return suspendCount > 0
}

// useViewport registers its raw commit function here so callers exiting a
// suspended flow can force a one-shot resync when the camera has drifted
// (e.g. the user panned around while a satellite was selected and deselected
// from a new location).
export function registerViewportCommitter(fn: (() => void) | null): void {
  committer = fn
}

export function commitViewportNow(): void {
  committer?.()
}

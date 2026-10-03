/** Format a whole number of seconds as `m:ss`, clamping bad input to `0:00`. */
export function formatClock(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00';
  const seconds = Math.floor(totalSeconds);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export interface RecordPlayerAdvance {
  step: number;
  elapsed: number;
  finished: boolean;
}

/** Advance one second; on the last step the player settles at `finished: true` instead of looping. */
export function advancePlayer(
  state: { step: number; elapsed: number },
  stepCount: number,
  stepDuration: number,
): RecordPlayerAdvance {
  const elapsed = state.elapsed + 1;
  if (elapsed < stepDuration) {
    return { step: state.step, elapsed, finished: false };
  }
  if (state.step < stepCount - 1) {
    return { step: state.step + 1, elapsed: 0, finished: false };
  }
  return { step: stepCount - 1, elapsed: stepDuration, finished: true };
}

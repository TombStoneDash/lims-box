export interface WalkthroughPlayerState {
  step: number;
  elapsed: number;
  paused: boolean;
  finished: boolean;
}

/** Advance one second; callers supply a positive step count and duration. */
export function tick(
  state: WalkthroughPlayerState,
  stepCount: number,
  stepDuration: number,
): WalkthroughPlayerState {
  if (state.paused || state.finished) return state;
  const elapsed = state.elapsed + 1;
  if (elapsed < stepDuration) return { ...state, elapsed };
  if (state.step < stepCount - 1) {
    return { ...state, step: state.step + 1, elapsed: 0 };
  }
  return { ...state, elapsed: stepDuration, paused: true, finished: true };
}

/** Select a valid step, retaining the visitor's playback preference. */
export function goTo(state: WalkthroughPlayerState, step: number): WalkthroughPlayerState {
  return { ...state, step, elapsed: 0, finished: false };
}

export function togglePause(state: WalkthroughPlayerState): WalkthroughPlayerState {
  if (state.finished) {
    return { step: 0, elapsed: 0, paused: false, finished: false };
  }
  return { ...state, paused: !state.paused };
}

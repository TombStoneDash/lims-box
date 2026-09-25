export const COLA_EVENT = { start: '2026-05-06', end: '2026-05-08' } as const;

export function colaEventPhase(now: Date): 'upcoming' | 'live' | 'past' {
  const utcDate = now.toISOString().slice(0, 10);
  if (utcDate < COLA_EVENT.start) return 'upcoming';
  if (utcDate > COLA_EVENT.end) return 'past';
  return 'live';
}

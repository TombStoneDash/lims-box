// Bounds the /api/demo ?limit= value. Kept outside the route file because a
// Next.js route module may only export HTTP handlers and route config.
export function resolveDemoLimit(rawLimit: string | null): number {
  const parsed = parseInt(rawLimit ?? '10', 10);
  const bounded = Number.isFinite(parsed) ? parsed : 10;
  return Math.min(Math.max(bounded, 1), 50);
}

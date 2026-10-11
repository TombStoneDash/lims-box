// Bounds the /api/demo ?limit= value. Kept outside the route file because a
// Next.js route module may only export HTTP handlers and route config.
const STRICT_INTEGER_OR_DECIMAL = /^[+-]?\d+(\.\d+)?$/;

export function resolveDemoLimit(rawLimit: string | null): number {
  const trimmed = (rawLimit ?? '10').trim();
  const parsed = STRICT_INTEGER_OR_DECIMAL.test(trimmed) ? parseInt(trimmed, 10) : NaN;
  const bounded = Number.isFinite(parsed) ? parsed : 10;
  return Math.min(Math.max(bounded, 1), 50);
}

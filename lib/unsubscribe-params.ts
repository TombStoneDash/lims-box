/** Next.js search parameters are already decoded. */
export function safeParam(value: string | string[] | undefined, fallback: string): string {
  if (Array.isArray(value)) {
    const distinct = new Set(
      value.map((entry) => entry.trim().slice(0, 320)).filter((entry) => entry.length > 0)
    );
    if (distinct.size === 1) {
      return [...distinct][0];
    }
    return fallback.trim().slice(0, 320);
  }
  return (value ?? fallback).trim().slice(0, 320);
}

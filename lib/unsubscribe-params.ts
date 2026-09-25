/** Next.js search parameters are already decoded. */
export function safeParam(value: string | undefined, fallback: string): string {
  return (value ?? fallback).trim().slice(0, 320);
}

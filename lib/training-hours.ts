export function parseTrainingHours(raw: string | null | undefined): number | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;

  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(s)) {
    throw new Error("hours must be a finite number");
  }

  const n = Number(s);
  if (!Number.isFinite(n)) {
    throw new Error("hours must be a finite number");
  }
  if (n < 0) {
    throw new Error("hours must not be negative");
  }
  return n === 0 ? 0 : n;
}

export function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const cls =
    s === "completed" || s === "active"
      ? "bg-green-100 text-green-800 border-green-200"
      : s === "due"
      ? "bg-amber-100 text-amber-800 border-amber-200"
      : s === "overdue"
      ? "bg-red-100 text-red-800 border-red-200"
      : "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

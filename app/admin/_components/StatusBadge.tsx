import {
  formatCalendarDate,
  formatTimestampDate as formatLocalTimestampDate,
} from "@/lib/admin-calendar-date";

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
  return formatCalendarDate(d);
}

export function formatTimestampDate(d: Date | string | null | undefined): string {
  return formatLocalTimestampDate(d);
}

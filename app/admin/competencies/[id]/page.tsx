import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { StatusBadge, formatDate } from "../../_components/StatusBadge";
import { createReviewEvent } from "../../pp-actions";
import { REVIEW_TYPES, REVIEW_OUTCOMES, REVIEW_TYPE_LABELS, REVIEW_OUTCOME_LABELS } from "@/lib/personnel-pack-utils";

export const dynamic = "force-dynamic";

function outcomeBadge(outcome: string) {
  const cls =
    outcome === "competent"
      ? "bg-green-100 text-green-800 border-green-200"
      : outcome === "requires_remediation"
      ? "bg-amber-100 text-amber-800 border-amber-200"
      : outcome === "restricted" || outcome === "suspended"
      ? "bg-red-100 text-red-800 border-red-200"
      : "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {REVIEW_OUTCOME_LABELS[outcome as keyof typeof REVIEW_OUTCOME_LABELS] ?? outcome}
    </span>
  );
}

export default async function CompetencyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const competency = await prisma.competency.findUnique({
    where: { id },
    include: {
      person: true,
      reviewEvents: { orderBy: { reviewedAt: "desc" } },
    },
  });
  if (!competency) return notFound();

  const latestReview = competency.reviewEvents[0];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{competency.type}</h1>
          <p className="text-sm text-slate-600 mt-1">
            {competency.person.name} · {competency.person.role}
            {" · "}
            <StatusBadge status={competency.status} />
          </p>
        </div>
        <Link
          href={`/admin/people/${competency.personId}`}
          className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          ← Back to {competency.person.name}
        </Link>
      </div>

      {/* Latest review callout */}
      {latestReview && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm flex items-start justify-between">
          <div>
            <span className="font-medium">Last review:</span>{" "}
            {formatDate(latestReview.reviewedAt)} by {latestReview.reviewerName}
            {" · "}
            {outcomeBadge(latestReview.reviewOutcome)}
          </div>
          {latestReview.nextReviewDue && (
            <div className="text-slate-600 text-xs">
              Next due: <span className="font-medium">{formatDate(latestReview.nextReviewDue)}</span>
            </div>
          )}
        </div>
      )}

      {/* Log review form */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Log review event</h2>
        <p className="text-xs text-slate-500 mb-3">ISO 15189 §6.2.2 — competency assessment audit trail</p>
        <form action={createReviewEvent} className="space-y-4 max-w-xl">
          <input type="hidden" name="competencyId" value={competency.id} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Reviewer name <span className="text-red-500">*</span>
              </label>
              <input
                name="reviewerName"
                type="text"
                required
                placeholder="Dr. Jane Smith"
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Reviewer role <span className="text-red-500">*</span>
              </label>
              <input
                name="reviewerRole"
                type="text"
                required
                placeholder="Lab Director"
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Review type <span className="text-red-500">*</span>
              </label>
              <select
                name="reviewType"
                required
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              >
                <option value="">Select…</option>
                {REVIEW_TYPES.map((t) => (
                  <option key={t} value={t}>{REVIEW_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Outcome <span className="text-red-500">*</span>
              </label>
              <select
                name="reviewOutcome"
                required
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              >
                <option value="">Select…</option>
                {REVIEW_OUTCOMES.map((o) => (
                  <option key={o} value={o}>{REVIEW_OUTCOME_LABELS[o]}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Next review due (leave blank to auto-calculate)
            </label>
            <input
              name="nextReviewDue"
              type="date"
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
            <p className="text-xs text-slate-500 mt-1">Auto-calculated from review type if left blank (initial/6-mo → +6mo, annual → +12mo, corrective → +3mo).</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes (optional)</label>
            <textarea
              name="notes"
              rows={2}
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              className="rounded-md bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800"
            >
              Log review
            </button>
            <a
              href={`/api/competencies/${competency.id}/reviews/export`}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
              download
            >
              Export PDF
            </a>
          </div>
        </form>
      </section>

      {/* Review history table */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Review history</h2>
        {competency.reviewEvents.length === 0 ? (
          <p className="text-sm text-slate-500">No reviews logged yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Date</th>
                  <th className="text-left px-4 py-2 font-medium">Type</th>
                  <th className="text-left px-4 py-2 font-medium">Outcome</th>
                  <th className="text-left px-4 py-2 font-medium">Reviewer</th>
                  <th className="text-left px-4 py-2 font-medium">Next due</th>
                  <th className="text-left px-4 py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {competency.reviewEvents.map((ev) => (
                  <tr key={ev.id}>
                    <td className="px-4 py-2 text-slate-600">{formatDate(ev.reviewedAt)}</td>
                    <td className="px-4 py-2 text-slate-600">
                      {REVIEW_TYPE_LABELS[ev.reviewType as keyof typeof REVIEW_TYPE_LABELS] ?? ev.reviewType}
                    </td>
                    <td className="px-4 py-2">{outcomeBadge(ev.reviewOutcome)}</td>
                    <td className="px-4 py-2 text-slate-600">
                      {ev.reviewerName}
                      <span className="text-slate-400 text-xs ml-1">({ev.reviewerRole})</span>
                    </td>
                    <td className="px-4 py-2 text-slate-600">{formatDate(ev.nextReviewDue)}</td>
                    <td className="px-4 py-2 text-slate-600 max-w-xs truncate">{ev.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

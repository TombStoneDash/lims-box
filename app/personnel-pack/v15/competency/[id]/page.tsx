import { PersonnelPackReviewOutcome, PersonnelPackReviewType } from "@prisma/client";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/app/admin/_components/StatusBadge";
import { logReviewEvent } from "../../actions";

const reviewTypes = Object.values(PersonnelPackReviewType);
const reviewOutcomes = Object.values(PersonnelPackReviewOutcome);

export default async function CompetencyReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const competency = await prisma.competency.findUnique({
    where: { id },
    include: {
      person: true,
      reviewEvents: {
        orderBy: [{ reviewedAt: "desc" }, { createdAt: "desc" }],
      },
    },
  });

  if (!competency) return notFound();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">{competency.person.name} · {competency.type}</h1>
        <p className="mt-1 text-sm text-slate-600">Append-only internal audit trail for competency review events.</p>
      </div>

      <section className="grid gap-6 lg:grid-cols-[1.15fr,0.85fr]">
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-semibold">Review history</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {competency.reviewEvents.length === 0 ? (
              <div className="px-5 py-4 text-sm text-slate-500">No review events logged.</div>
            ) : (
              competency.reviewEvents.map((review) => (
                <div key={review.id} className="px-5 py-4 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">
                      {review.reviewType.replaceAll("_", " ")} · {review.reviewOutcome.replaceAll("_", " ")}
                    </div>
                    <div className="text-slate-500">{formatDate(review.reviewedAt)}</div>
                  </div>
                  <div className="mt-2 text-slate-600">{review.notes || "No notes."}</div>
                  {review.correctiveActionRequired ? (
                    <div className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-amber-900">
                      Corrective action: {review.correctiveActionSummary || "Required"}
                    </div>
                  ) : null}
                  <div className="mt-2 text-xs text-slate-500">
                    Reviewer: {review.reviewerName} · {review.reviewerRole}
                    {review.nextReviewDue ? ` · Next due ${formatDate(review.nextReviewDue)}` : ""}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">Log review</h2>
          <form action={logReviewEvent} className="mt-4 space-y-3 text-sm">
            <input type="hidden" name="competencyRecordId" value={competency.id} />
            <label className="block">
              <span className="mb-1 block text-slate-600">Reviewed at</span>
              <input type="date" name="reviewedAt" className="w-full rounded-md border border-slate-300 px-3 py-2" required />
            </label>
            <label className="block">
              <span className="mb-1 block text-slate-600">Reviewer name</span>
              <input name="reviewerName" className="w-full rounded-md border border-slate-300 px-3 py-2" required />
            </label>
            <label className="block">
              <span className="mb-1 block text-slate-600">Reviewer role</span>
              <input name="reviewerRole" className="w-full rounded-md border border-slate-300 px-3 py-2" placeholder="QA officer / section supervisor" required />
            </label>
            <label className="block">
              <span className="mb-1 block text-slate-600">Review type</span>
              <select name="reviewType" className="w-full rounded-md border border-slate-300 px-3 py-2" required>
                {reviewTypes.map((reviewType) => (
                  <option key={reviewType} value={reviewType}>
                    {reviewType.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-slate-600">Outcome</span>
              <select name="reviewOutcome" className="w-full rounded-md border border-slate-300 px-3 py-2" required>
                {reviewOutcomes.map((reviewOutcome) => (
                  <option key={reviewOutcome} value={reviewOutcome}>
                    {reviewOutcome.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-slate-600">Next review due override</span>
              <input type="date" name="nextReviewDue" className="w-full rounded-md border border-slate-300 px-3 py-2" />
            </label>
            <label className="flex items-center gap-2 text-slate-700">
              <input type="checkbox" name="correctiveActionRequired" className="h-4 w-4 rounded border-slate-300" />
              Corrective action required
            </label>
            <label className="block">
              <span className="mb-1 block text-slate-600">Corrective action summary</span>
              <textarea name="correctiveActionSummary" className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2" />
            </label>
            <label className="block">
              <span className="mb-1 block text-slate-600">Notes</span>
              <textarea name="notes" className="min-h-24 w-full rounded-md border border-slate-300 px-3 py-2" />
            </label>
            <button className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-800">
              Save review event
            </button>
          </form>
        </section>
      </section>
    </div>
  );
}

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/app/admin/_components/StatusBadge";
import { isAuthorizationActive, isCurrentDocumentVersion, listUpcomingReviews } from "@/lib/personnel-pack-v15/service";

function StatCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold">{value}</div>
      <div className="mt-1 text-sm text-slate-500">{hint}</div>
    </div>
  );
}

export default async function PersonnelPackV15Dashboard() {
  const [documents, people, upcomingReviews, competencies] = await Promise.all([
    prisma.personnelPackDocument.findMany({
      include: {
        versions: {
          orderBy: { effectiveDate: "desc" },
        },
      },
      orderBy: [{ kind: "asc" }, { title: "asc" }],
    }),
    prisma.person.findMany({
      where: { active: true },
      include: {
        authorizations: true,
      },
      orderBy: { name: "asc" },
    }),
    listUpcomingReviews(prisma),
    prisma.competency.findMany({
      include: {
        person: true,
        reviewEvents: {
          orderBy: { reviewedAt: "desc" },
          take: 1,
        },
      },
      orderBy: [{ person: { name: "asc" } }, { type: "asc" }],
    }),
  ]);

  const documentsMissingCurrentVersion = documents.filter(
    (document) => !document.versions.some((version) => isCurrentDocumentVersion(version)),
  ).length;
  const activeAuthorizations = people.reduce(
    (count, person) => count + person.authorizations.filter((authorization) => isAuthorizationActive(authorization)).length,
    0,
  );

  return (
    <div className="space-y-8">
      <section className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-semibold">ISO 15189 dashboard</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Controlled documents, competency review audit trail, and procedure-specific authorization tracking layered
            onto the existing Personnel Pack records.
          </p>
        </div>
        <Link
          href="/admin/survey-ready/pdf"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Export audit PDF
        </Link>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard label="Controlled Documents" value={documents.length} hint="Procedures and forms in registry" />
        <StatCard label="Current Versions Missing" value={documentsMissingCurrentVersion} hint="Should be zero for audit readiness" />
        <StatCard label="Upcoming Reviews" value={upcomingReviews.length} hint="Due within the next 30 days" />
        <StatCard label="Active Authorizations" value={activeAuthorizations} hint="Current signed procedure permissions" />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="font-semibold">Reviews due in next 30 days</h2>
            <Link href="/personnel-pack/v15/personnel" className="text-sm text-slate-600 underline">
              Open personnel
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {upcomingReviews.length === 0 ? (
              <div className="px-5 py-4 text-sm text-slate-500">No upcoming reviews due.</div>
            ) : (
              upcomingReviews.map((review) => (
                <div key={review.id} className="flex items-center justify-between px-5 py-4 text-sm">
                  <div>
                    <div className="font-medium">
                      {review.competencyRecord.person.name} · {review.competencyRecord.type}
                    </div>
                    <div className="text-slate-500">
                      {review.reviewType.replaceAll("_", " ")} review due {formatDate(review.nextReviewDue)}
                    </div>
                  </div>
                  <Link href={`/personnel-pack/v15/competency/${review.competencyRecordId}`} className="underline">
                    Log review
                  </Link>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-semibold">Competency coverage</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {competencies.slice(0, 8).map((competency) => (
              <div key={competency.id} className="px-5 py-4 text-sm">
                <div className="font-medium">
                  {competency.person.name} · {competency.type}
                </div>
                <div className="text-slate-500">
                  Latest ISO review:{" "}
                  {competency.reviewEvents[0]
                    ? `${competency.reviewEvents[0].reviewOutcome.replaceAll("_", " ")} on ${formatDate(competency.reviewEvents[0].reviewedAt)}`
                    : "not logged"}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

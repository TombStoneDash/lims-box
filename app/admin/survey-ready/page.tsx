import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { StatusBadge, formatDate } from "../_components/StatusBadge";

export default async function SurveyReadyPage() {
  const people = await prisma.person.findMany({
    where: { active: true },
    include: {
      competencies: { orderBy: { expiresAt: "asc" } },
      trainings: { orderBy: { completedAt: "desc" } },
      signOffs: { orderBy: { signedAt: "desc" } },
      authorizations: {
        include: {
          document: true,
        },
        orderBy: [{ revokedAt: "asc" }, { authorizedAt: "desc" }],
      },
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
  const reviewEvents = await prisma.personnelPackReviewEvent.findMany({
    include: {
      competencyRecord: true,
    },
    orderBy: { reviewedAt: "desc" },
  });
  const documents = await prisma.personnelPackDocument.findMany({
    include: {
      versions: true,
    },
    orderBy: { code: "asc" },
  });
  const reviewCounts = new Map<string, number>();
  for (const event of reviewEvents) {
    const current = reviewCounts.get(event.competencyRecord.personId) || 0;
    reviewCounts.set(event.competencyRecord.personId, current + 1);
  }

  const byRole = new Map<string, typeof people>();
  for (const p of people) {
    const k = p.role;
    if (!byRole.has(k)) byRole.set(k, [] as typeof people);
    byRole.get(k)!.push(p);
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Survey-ready bundle</h1>
          <p className="text-sm text-slate-600 mt-1">
            Active personnel · competencies · sign-offs · ISO 15189 addenda grouped by role.
          </p>
        </div>
        <a
          href="/admin/survey-ready/pdf"
          className="inline-flex items-center rounded-md bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800"
        >
          Download PDF
        </a>
      </div>

      <p className="text-xs text-slate-500">
        Workflow documentation support. Human-reviewed drafting. This export reflects the records currently in the local
        database. Confirm completeness before any CMS or accreditation submission.
      </p>

      <section className="rounded-md border border-slate-200 bg-white p-4 text-sm">
        <div className="font-semibold">ISO 15189 controlled documents</div>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {documents.map((document) => {
            const currentVersion = document.versions.find((version) => version.supersededDate === null);
            return (
              <div key={document.id} className="rounded-md border border-slate-100 p-3">
                <div className="font-medium">{document.code} · {document.title}</div>
                <div className="text-slate-500">
                  {document.kind} · Current version {currentVersion?.versionNumber || "missing"}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {Array.from(byRole.entries()).map(([role, group]) => (
        <section key={role} className="space-y-3">
          <h2 className="text-lg font-semibold border-b border-slate-200 pb-1">{role}</h2>
          {group.map((p) => (
            <article key={p.id} className="rounded-md border border-slate-200 p-4 text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-xs text-slate-500">
                    {p.cliaCertNumber ? `${p.cliaCertNumber} · ` : ""}Hired {formatDate(p.hireDate)}
                  </div>
                </div>
                <Link href={`/admin/people/${p.id}`} className="text-xs text-slate-700 underline">
                  Open record
                </Link>
              </div>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Competencies</div>
                  <ul className="space-y-1">
                    {p.competencies.length === 0 ? (
                      <li className="text-slate-400">—</li>
                    ) : (
                      p.competencies.map((c) => (
                        <li key={c.id} className="flex items-center justify-between">
                          <span>{c.type}</span>
                          <StatusBadge status={c.status} />
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Trainings</div>
                  <ul className="space-y-1">
                    {p.trainings.length === 0 ? (
                      <li className="text-slate-400">—</li>
                    ) : (
                      p.trainings.slice(0, 5).map((t) => (
                        <li key={t.id}>
                          {t.course} <span className="text-slate-400">· {formatDate(t.completedAt)}</span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Sign-offs</div>
                  <ul className="space-y-1">
                    {p.signOffs.length === 0 ? (
                      <li className="text-slate-400">—</li>
                    ) : (
                      p.signOffs.map((s) => (
                        <li key={s.id}>
                          {s.scope} <span className="text-slate-400">· {formatDate(s.signedAt)}</span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">ISO review events</div>
                  <div className="text-slate-700">{reviewCounts.get(p.id) || 0} logged</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Procedure authorizations</div>
                  <ul className="space-y-1">
                    {p.authorizations.length === 0 ? (
                      <li className="text-slate-400">—</li>
                    ) : (
                      p.authorizations.map((authorization) => (
                        <li key={authorization.id}>
                          {authorization.document.code}
                          <span className="text-slate-400">
                            {" · "}
                            {authorization.revokedAt ? `revoked ${formatDate(authorization.revokedAt)}` : `active ${formatDate(authorization.authorizedAt)}`}
                          </span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}

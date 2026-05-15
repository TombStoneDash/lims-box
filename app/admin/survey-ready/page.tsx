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
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

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
            Active personnel · competencies · sign-offs · grouped by role.
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
              <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4">
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
              </div>
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}

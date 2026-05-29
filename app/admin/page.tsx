import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const now = new Date();
  const in30 = new Date(now);
  in30.setDate(in30.getDate() + 30);

  const [peopleCount, overdueCount, dueIn30, upcomingSignOffs, reviewsDue, activeAuthCount, docCount] =
    await Promise.all([
      prisma.person.count({ where: { active: true } }),
      prisma.competency.count({
        where: { OR: [{ status: "overdue" }, { expiresAt: { lt: now }, status: { not: "completed" } }] },
      }),
      prisma.competency.count({
        where: { expiresAt: { gte: now, lte: in30 }, status: { in: ["due", "overdue"] } },
      }),
      prisma.signOff.count({ where: { signedAt: { gte: now, lte: in30 } } }),
      // Reviews due in next 30 days (ISO 15189 §6.2.2)
      prisma.reviewEvent.findMany({
        where: { nextReviewDue: { gte: now, lte: in30 } },
        orderBy: { nextReviewDue: "asc" },
        include: {
          competency: { include: { person: true } },
        },
        take: 10,
      }),
      // Active procedure authorizations (ISO 15189 §6.2.4)
      prisma.authorization.count({ where: { isActive: true } }),
      // Controlled documents (ISO 15189 §4.3)
      prisma.document.count({ where: { archivedAt: null } }),
    ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-slate-600 mt-1">
          Personnel Pack v1.5 · CLIA §493.1407 + ISO 15189 §6.2
        </p>
      </div>

      {/* CLIA stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Stat label="Active people" value={peopleCount} accent="slate" />
        <Stat label="Overdue competencies" value={overdueCount} accent={overdueCount > 0 ? "red" : "slate"} />
        <Stat label="Due in next 30 days" value={dueIn30} accent={dueIn30 > 0 ? "amber" : "slate"} />
      </div>

      <div className="text-sm text-slate-500">
        Upcoming director sign-offs in next 30 days:{" "}
        <strong className="text-slate-900">{upcomingSignOffs}</strong>
      </div>

      {/* ISO 15189 stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Stat
          label="Active procedure authorizations"
          value={activeAuthCount}
          accent="slate"
          subtitle="ISO 15189 §6.2.4"
          href="/admin/procedures"
        />
        <Stat
          label="Controlled documents"
          value={docCount}
          accent="slate"
          subtitle="ISO 15189 §4.3 + §6.2.1"
          href="/admin/documents"
        />
      </div>

      {/* Reviews due widget */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold">Reviews due in next 30 days</h2>
            <p className="text-xs text-slate-500">ISO 15189 §6.2.2 — competency assessment schedule</p>
          </div>
          <span className={`text-sm font-medium ${reviewsDue.length > 0 ? "text-amber-700" : "text-green-700"}`}>
            {reviewsDue.length} upcoming
          </span>
        </div>

        {reviewsDue.length === 0 ? (
          <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            No reviews due in the next 30 days. ✓
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-amber-200">
            <table className="min-w-full text-sm">
              <thead className="bg-amber-50 border-b border-amber-200">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Personnel</th>
                  <th className="text-left px-4 py-2 font-medium">Competency</th>
                  <th className="text-left px-4 py-2 font-medium">Due date</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100">
                {reviewsDue.map((ev) => (
                  <tr key={ev.id}>
                    <td className="px-4 py-2 font-medium">{ev.competency.person.name}</td>
                    <td className="px-4 py-2 text-slate-600">{ev.competency.type}</td>
                    <td className="px-4 py-2 text-amber-700 font-medium">
                      {ev.nextReviewDue?.toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      }) ?? "—"}
                    </td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/admin/competencies/${ev.competencyId}`}
                        className="text-xs text-slate-600 underline hover:text-slate-900"
                      >
                        Log review →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="flex gap-3">
        <Link
          href="/admin/people"
          className="inline-flex items-center rounded-md bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800"
        >
          Open people list →
        </Link>
        <Link
          href="/admin/documents"
          className="inline-flex items-center rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
        >
          Documents
        </Link>
        <Link
          href="/admin/procedures"
          className="inline-flex items-center rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
        >
          Procedures
        </Link>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  subtitle,
  href,
}: {
  label: string;
  value: number;
  accent: "slate" | "amber" | "red";
  subtitle?: string;
  href?: string;
}) {
  const accentMap = {
    slate: "border-slate-200",
    amber: "border-amber-300 bg-amber-50",
    red: "border-red-300 bg-red-50",
  };
  const inner = (
    <div className={`rounded-md border ${accentMap[accent]} p-5 h-full`}>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      {subtitle && <div className="text-xs text-slate-400 mt-0.5">{subtitle}</div>}
      <div className="mt-2 text-3xl font-semibold">{value}</div>
    </div>
  );
  return href ? <Link href={href} className="hover:opacity-80 transition-opacity">{inner}</Link> : inner;
}

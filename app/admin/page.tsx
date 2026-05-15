import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function AdminDashboard() {
  const now = new Date();
  const in30 = new Date(now);
  in30.setDate(in30.getDate() + 30);

  const [peopleCount, overdueCount, dueIn30, upcomingSignOffs] = await Promise.all([
    prisma.person.count({ where: { active: true } }),
    prisma.competency.count({
      where: { OR: [{ status: "overdue" }, { expiresAt: { lt: now }, status: { not: "completed" } }] },
    }),
    prisma.competency.count({
      where: { expiresAt: { gte: now, lte: in30 }, status: { in: ["due", "overdue"] } },
    }),
    prisma.signOff.count({ where: { signedAt: { gte: now, lte: in30 } } }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-slate-600 mt-1">
          Survey-readiness organization for CLIA personnel records.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Stat label="Active people" value={peopleCount} accent="slate" />
        <Stat label="Overdue competencies" value={overdueCount} accent={overdueCount > 0 ? "red" : "slate"} />
        <Stat label="Due in next 30 days" value={dueIn30} accent={dueIn30 > 0 ? "amber" : "slate"} />
      </div>

      <div className="text-sm text-slate-500">
        Upcoming director sign-offs in next 30 days: <strong className="text-slate-900">{upcomingSignOffs}</strong>
      </div>

      <div>
        <Link
          href="/admin/people"
          className="inline-flex items-center rounded-md bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800"
        >
          Open people list →
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent: "slate" | "amber" | "red" }) {
  const accentMap = {
    slate: "border-slate-200",
    amber: "border-amber-300 bg-amber-50",
    red: "border-red-300 bg-red-50",
  };
  return (
    <div className={`rounded-md border ${accentMap[accent]} p-5`}>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold">{value}</div>
    </div>
  );
}

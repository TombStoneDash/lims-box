import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { StatusBadge, formatDate } from "../../_components/StatusBadge";

export default async function PersonDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const person = await prisma.person.findUnique({
    where: { id },
    include: {
      competencies: { orderBy: { expiresAt: "asc" } },
      trainings: { orderBy: { completedAt: "desc" } },
      signOffs: { orderBy: { signedAt: "desc" } },
    },
  });
  if (!person) return notFound();

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{person.name}</h1>
          <p className="text-sm text-slate-600 mt-1">
            {person.role}
            {person.cliaCertNumber ? ` · ${person.cliaCertNumber}` : ""}
            {" · Hired "}
            {formatDate(person.hireDate)}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/personnel-pack/v15/personnel/${person.id}`}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            ISO 15189
          </Link>
          <Link
            href={`/admin/people/${person.id}/edit`}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Edit
          </Link>
          <Link href="/admin/people" className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
            Back
          </Link>
        </div>
      </div>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Competency matrix</h2>
          <Link
            href={`/admin/competencies/new?personId=${person.id}`}
            className="text-sm text-slate-900 underline"
          >
            + Log competency
          </Link>
        </div>
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Type</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-left px-4 py-2 font-medium">Completed</th>
                <th className="text-left px-4 py-2 font-medium">Expires</th>
                <th className="text-left px-4 py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {person.competencies.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-sm text-slate-500">
                    No competencies on record.
                  </td>
                </tr>
              ) : (
                person.competencies.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2">{c.type}</td>
                    <td className="px-4 py-2"><StatusBadge status={c.status} /></td>
                    <td className="px-4 py-2 text-slate-600">{formatDate(c.completedAt)}</td>
                    <td className="px-4 py-2 text-slate-600">{formatDate(c.expiresAt)}</td>
                    <td className="px-4 py-2 text-slate-600">{c.notes || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Training log</h2>
          <Link
            href={`/admin/trainings/new?personId=${person.id}`}
            className="text-sm text-slate-900 underline"
          >
            + Log training
          </Link>
        </div>
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Course</th>
                <th className="text-left px-4 py-2 font-medium">Provider</th>
                <th className="text-left px-4 py-2 font-medium">Completed</th>
                <th className="text-left px-4 py-2 font-medium">Hours</th>
                <th className="text-left px-4 py-2 font-medium">Certificate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {person.trainings.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-sm text-slate-500">No trainings on record.</td>
                </tr>
              ) : (
                person.trainings.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-2">{t.course}</td>
                    <td className="px-4 py-2 text-slate-600">{t.provider || "—"}</td>
                    <td className="px-4 py-2 text-slate-600">{formatDate(t.completedAt)}</td>
                    <td className="px-4 py-2 text-slate-600">{t.hours ?? "—"}</td>
                    <td className="px-4 py-2 text-slate-600 font-mono text-xs">{t.certificate || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Director sign-offs</h2>
          <Link
            href={`/admin/signoffs/new?personId=${person.id}`}
            className="text-sm text-slate-900 underline"
          >
            + Add sign-off
          </Link>
        </div>
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Director</th>
                <th className="text-left px-4 py-2 font-medium">Scope</th>
                <th className="text-left px-4 py-2 font-medium">Signed</th>
                <th className="text-left px-4 py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {person.signOffs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-4 text-sm text-slate-500">No sign-offs on record.</td>
                </tr>
              ) : (
                person.signOffs.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-2">{s.directorName}</td>
                    <td className="px-4 py-2 text-slate-600">{s.scope}</td>
                    <td className="px-4 py-2 text-slate-600">{formatDate(s.signedAt)}</td>
                    <td className="px-4 py-2 text-slate-600">{s.notes || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

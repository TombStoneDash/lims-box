import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { StatusBadge, formatDate } from "../../_components/StatusBadge";
import { grantAuthorization, revokeAuthorization } from "../../pp-actions";

export default async function PersonDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const person = await prisma.person.findUnique({
    where: { id },
    include: {
      competencies: { orderBy: { expiresAt: "asc" } },
      trainings: { orderBy: { completedAt: "desc" } },
      signOffs: { orderBy: { signedAt: "desc" } },
      authorizations: {
        include: { procedure: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!person) return notFound();

  // Procedures available for new authorization (exclude already-active ones)
  const activeProcedureIds = person.authorizations
    .filter((a) => a.isActive)
    .map((a) => a.procedureId);

  const allProcedures = await prisma.procedure.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });

  const activeAuths = person.authorizations.filter((a) => a.isActive);
  const revokedAuths = person.authorizations.filter((a) => !a.isActive);

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

      {/* Competency matrix */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Competency matrix</h2>
          <Link href={`/admin/competencies/new?personId=${person.id}`} className="text-sm text-slate-900 underline">
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
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {person.competencies.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-4 text-sm text-slate-500">No competencies on record.</td>
                </tr>
              ) : (
                person.competencies.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2">{c.type}</td>
                    <td className="px-4 py-2"><StatusBadge status={c.status} /></td>
                    <td className="px-4 py-2 text-slate-600">{formatDate(c.completedAt)}</td>
                    <td className="px-4 py-2 text-slate-600">{formatDate(c.expiresAt)}</td>
                    <td className="px-4 py-2 text-slate-600">{c.notes || "—"}</td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/admin/competencies/${c.id}`}
                        className="text-xs text-slate-600 underline hover:text-slate-900"
                      >
                        Reviews
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Training log */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Training log</h2>
          <Link href={`/admin/trainings/new?personId=${person.id}`} className="text-sm text-slate-900 underline">
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

      {/* Director sign-offs */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Director sign-offs</h2>
          <Link href={`/admin/signoffs/new?personId=${person.id}`} className="text-sm text-slate-900 underline">
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

      {/* ─── Personnel Pack v1.5: Procedure Authorizations ─────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold">Procedure authorizations</h2>
            <p className="text-xs text-slate-500">ISO 15189 §6.2.4 — one active authorization per procedure</p>
          </div>
        </div>

        {/* Active authorizations */}
        <div className="overflow-x-auto rounded-md border border-slate-200 mb-4">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Procedure</th>
                <th className="text-left px-4 py-2 font-medium">Authorized date</th>
                <th className="text-left px-4 py-2 font-medium">Authorized by (typed attestation)</th>
                <th className="text-left px-4 py-2 font-medium">Scope</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeAuths.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-sm text-slate-500">No active authorizations.</td>
                </tr>
              ) : (
                activeAuths.map((auth) => (
                  <tr key={auth.id}>
                    <td className="px-4 py-2 font-medium">
                      {auth.procedure.name}
                      {auth.procedure.procedureCode && (
                        <span className="text-xs text-slate-400 ml-1 font-mono">({auth.procedure.procedureCode})</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{formatDate(auth.authorizedAt)}</td>
                    <td className="px-4 py-2 text-slate-600">{auth.authorizedBy}</td>
                    <td className="px-4 py-2 text-slate-600">{auth.scope ?? "—"}</td>
                    <td className="px-4 py-2">
                      <form action={revokeAuthorization}>
                        <input type="hidden" name="authId" value={auth.id} />
                        <input type="hidden" name="personId" value={person.id} />
                        <input type="hidden" name="revokedBy" value="Lab Director" />
                        <input type="hidden" name="revocationReason" value="" />
                        <button
                          type="submit"
                          className="text-xs text-red-600 underline hover:text-red-800"
                        >
                          Revoke
                        </button>
                      </form>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Grant authorization form */}
        {allProcedures.length > 0 && (
          <details className="border border-slate-200 rounded-md">
            <summary className="px-4 py-2 text-sm cursor-pointer hover:bg-slate-50 font-medium">
              + Grant authorization
            </summary>
            <form action={grantAuthorization} className="p-4 space-y-3 border-t border-slate-200">
              <input type="hidden" name="personId" value={person.id} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Procedure <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="procedureId"
                    required
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                  >
                    <option value="">Select procedure…</option>
                    {allProcedures
                      .filter((p) => !activeProcedureIds.includes(p.id))
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}{p.procedureCode ? ` (${p.procedureCode})` : ""}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Authorized date <span className="text-red-500">*</span>
                  </label>
                  <input
                    name="authorizedAt"
                    type="date"
                    required
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Lab director name (typed attestation) <span className="text-red-500">*</span>
                </label>
                <input
                  name="authorizedBy"
                  type="text"
                  required
                  placeholder="Dr. Jane Smith"
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
                <p className="text-xs text-slate-500 mt-1">Type the authorizing lab director&apos;s full name. This serves as the authorization record.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Scope (optional)</label>
                <input
                  name="scope"
                  type="text"
                  placeholder="e.g. All shifts, no restriction"
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>
              <button
                type="submit"
                className="rounded-md bg-slate-900 text-white px-4 py-1.5 text-sm font-medium hover:bg-slate-800"
              >
                Grant authorization
              </button>
            </form>
          </details>
        )}

        {/* Revoked authorizations (collapsed) */}
        {revokedAuths.length > 0 && (
          <details className="mt-4 border border-slate-200 rounded-md opacity-75">
            <summary className="px-4 py-2 text-sm cursor-pointer hover:bg-slate-50 text-slate-500">
              Revoked authorizations ({revokedAuths.length})
            </summary>
            <div className="overflow-x-auto border-t border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Procedure</th>
                    <th className="text-left px-4 py-2 font-medium">Authorized</th>
                    <th className="text-left px-4 py-2 font-medium">Revoked</th>
                    <th className="text-left px-4 py-2 font-medium">Revoked by</th>
                    <th className="text-left px-4 py-2 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {revokedAuths.map((auth) => (
                    <tr key={auth.id}>
                      <td className="px-4 py-2 text-slate-500">{auth.procedure.name}</td>
                      <td className="px-4 py-2 text-slate-500">{formatDate(auth.authorizedAt)}</td>
                      <td className="px-4 py-2 text-slate-500">{formatDate(auth.revokedAt)}</td>
                      <td className="px-4 py-2 text-slate-500">{auth.revokedBy ?? "—"}</td>
                      <td className="px-4 py-2 text-slate-500">{auth.revocationReason ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </section>
    </div>
  );
}

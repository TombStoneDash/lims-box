import { Activity, LockKeyhole } from 'lucide-react';
import { redirect } from 'next/navigation';
import { authenticationConfigured, getPrincipal } from '@/lib/ohworks-tenant/auth';
import { TestEnvironmentBadge } from '../_components/test-environment-badge';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getPrincipal()) redirect('/pilot/ohworks');
  const params = await searchParams;
  const ready = authenticationConfigured();
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#102b36] px-5 py-12 text-slate-900">
      <section className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="bg-[#173d49] px-7 py-7 text-white"><div className="flex items-start justify-between gap-4"><div className="flex items-center gap-3"><div className="rounded-xl bg-teal-300/10 p-2 ring-1 ring-teal-200/20"><Activity className="h-5 w-5 text-teal-200" /></div><div><p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal-200">LIMS BOX</p><h1 className="text-xl font-semibold">OHWorks Laboratory</h1></div></div><TestEnvironmentBadge /></div></div>
        <div className="p-7">
          <div className="mb-6 flex items-center gap-2"><LockKeyhole className="h-5 w-5 text-teal-700" /><h2 className="text-lg font-semibold">Sign in</h2></div>
          {params.error ? <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">The username or password was not accepted.</p> : null}
          {!ready ? <p role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Account access is temporarily unavailable.</p> : null}
          <form action="/pilot/ohworks/api/login" className="space-y-4" method="post">
            <label className="block text-sm font-medium">Username<input autoComplete="username" name="username" required className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" /></label>
            <label className="block text-sm font-medium">Password<input autoComplete="current-password" name="password" required type="password" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" /></label>
            <button disabled={!ready} className="w-full rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300" type="submit">Sign in to LIMS BOX</button>
          </form>
        </div>
      </section>
    </main>
  );
}

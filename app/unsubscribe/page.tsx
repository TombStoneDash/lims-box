import type { Metadata } from 'next';
import UnsubscribeClient from './UnsubscribeClient';

export const metadata: Metadata = {
  title: 'Unsubscribe — LIMS BOX',
  robots: 'noindex',
};

interface Props {
  searchParams: Promise<{ email?: string; list?: string }>;
}

export default async function UnsubscribePage({ searchParams }: Props) {
  const resolvedSearchParams = await searchParams;
  const email = resolvedSearchParams.email ? decodeURIComponent(resolvedSearchParams.email) : '';
  const list = resolvedSearchParams.list ? decodeURIComponent(resolvedSearchParams.list) : 'newsletter';

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-sm border border-gray-200 p-8">
        {/* Brand header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">LIMS BOX</h1>
          <p className="text-sm text-gray-500 mt-1">Email Preferences</p>
        </div>

        <UnsubscribeClient email={email} list={list} />

        {/* CAN-SPAM physical address */}
        <div className="mt-8 pt-6 border-t border-gray-100 text-center text-xs text-gray-400 space-y-1">
          <p>TombStone Dash LLC</p>
          <p>6821 Ridge Manor Ave. · San Diego, CA 92120</p>
          <p className="mt-2">
            <a href="https://lims.bot" className="underline hover:text-gray-600">
              lims.bot
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}

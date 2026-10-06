import React from 'react';
import { notFound } from 'next/navigation';
import { FOUNDER_CITATION_PREFIX, loadFounderCorpus, loadFounderIndex } from '../../../../lib/bot/founder-corpus';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Founder archive excerpts — LIMS BOT',
  robots: { index: false, follow: false },
};

export default async function FounderSourcePage({ params }: {
  params: Promise<{ path: string[] }>;
}) {
  const sourcePath = (await params).path.join('/');
  if (!/^founder-[a-z-]+$/.test(sourcePath)) notFound();
  const entries = (sourcePath.startsWith('founder-fact-') ? loadFounderIndex() : loadFounderCorpus()).filter((entry) =>
    entry.source.split('#')[0] === `${FOUNDER_CITATION_PREFIX}${sourcePath}`);
  if (!entries.length) notFound();

  // Deliberately render only admitted passages. This is not a file server:
  // the underlying resume, source metadata and unredacted files are private.
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-bold">Founder archive excerpts</h1>
      <p className="mt-4 text-sm">Historical experience from approved redacted founder material.</p>
      {entries.map((entry) => (
        <section key={entry.id} id={entry.source.split('#')[1]} className="mt-8">
          <h2 className="text-lg font-semibold">{entry.title}</h2>
          <p className="mt-2">{entry.text}</p>
        </section>
      ))}
    </main>
  );
}

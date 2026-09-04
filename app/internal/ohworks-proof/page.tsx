import { timingSafeEqual } from 'node:crypto';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

export default async function InternalOHWorksProofPage() {
  const supplied = (await headers()).get('x-ohworks-internal-proof-token') ?? '';
  const expected = process.env.OHWORKS_INTERNAL_PROOF_TOKEN ?? '';
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  const authorized = suppliedBytes.length === expectedBytes.length && suppliedBytes.length >= 32 && timingSafeEqual(suppliedBytes, expectedBytes);
  if (process.env.OHWORKS_INTERNAL_PROOF_ENABLED !== 'true' || !authorized) notFound();
  return <main><h1>OHWorks engineering safety harness</h1><p>The retained reducer, isolation, source-admission, and refusal checks run in the automated test suite.</p></main>;
}

import { createHash } from 'node:crypto';
import { generatePersonnelPackPdf, PDF_FILENAME, PDF_LABEL, PDF_VERSION } from './pdf';
import type { PersonnelPackDelivery } from '../personnelPackFulfillment';
import type { DownloadClaimService } from '../personnelPackDownloadClaims';

/** Shared blank templates only; applicant identities never enter the PDF or its storage key. */
export interface PersonnelPackStorage {
  read(key: string): Promise<Buffer | null>;
  /** Create-only; false means another request already stored the object. */
  putIfAbsent(key: string, bytes: Buffer): Promise<boolean>;
}

export const autoPdfEnabled = () => process.env.PERSONNEL_PACK_AUTO_PDF_ENABLED === 'true';
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const objectKey = (hash: string) => `generated/${PDF_VERSION}/iso15189/${hash}.pdf`;
const isPdf = (bytes: Buffer) => bytes.subarray(0, 5).toString() === '%PDF-'
  && /%%EOF\s*$/.test(bytes.subarray(-32).toString());

export function createAutomaticPersonnelPackFulfillment(
  storage: PersonnelPackStorage,
  claims: Pick<DownloadClaimService, 'issue'>,
  generate: () => Promise<Buffer> = generatePersonnelPackPdf,
) {
  return async (selection: string | null, origin: string): Promise<PersonnelPackDelivery | null> => {
    if (selection !== 'iso15189') return null;
    const bytes = await generate();
    if (!isPdf(bytes)) throw new Error('pdf_generation_failed');
    const hash = digest(bytes);
    const key = objectKey(hash);
    let stored = await storage.read(key);
    if (!stored) {
      await storage.putIfAbsent(key, bytes);
      // Verify durable storage, including a concurrent creator, before issuing a claim.
      stored = await storage.read(key);
    }
    if (!stored || digest(stored) !== hash) throw new Error('pdf_storage_verification_failed');
    const asset = `iso15189:${PDF_VERSION}:${hash}`;
    const url = new URL('/api/personnel-pack-download', origin);
    url.searchParams.set('asset', asset);
    url.searchParams.set('claim', claims.issue(asset));
    return { assetUrl: url.toString(), emailed: false, label: PDF_LABEL };
  };
}

export async function loadGeneratedPersonnelPack(storage: PersonnelPackStorage, asset: string) {
  const match = /^iso15189:v1:([a-f0-9]{64})$/.exec(asset);
  if (!match) return null;
  const bytes = await storage.read(objectKey(match[1]));
  if (!bytes) throw new Error('pdf_storage_unavailable');
  if (!isPdf(bytes) || digest(bytes) !== match[1]) throw new Error('pdf_storage_verification_failed');
  return { bytes, asset: { downloadFilename: PDF_FILENAME } };
}

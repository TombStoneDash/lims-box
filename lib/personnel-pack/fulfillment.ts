import type { DownloadClaimService } from '../personnelPackDownloadClaims';
import { resolveBundledAsset, type PersonnelPackDelivery } from '../personnelPackFulfillment';
import { GENERATED_PACK_FILENAME, GENERATED_PACK_KEY, GENERATED_PACK_LABEL } from './pdf';
import { ensurePersonnelPackPdf, verifyPersonnelPackPdf, type PersonnelPackPdfStore } from './storage';

export function automaticPdfEnabled(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env.PERSONNEL_PACK_AUTO_PDF_ENABLED === 'true';
}

export function personnelPackEmailEnabled(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env.PERSONNEL_PACK_EMAIL_ENABLED === 'true';
}

export function createAutomaticPersonnelPackResolver(input: {
  enabled: () => boolean;
  store: PersonnelPackPdfStore;
  resolveClaims: () => DownloadClaimService | null;
  generate?: () => Promise<Buffer>;
}) {
  return async (selection: string | null, origin: string): Promise<PersonnelPackDelivery | null> => {
    if (!input.enabled()) {
      const delivery = await resolveBundledAsset(selection, origin);
      if (!delivery) return null;
      const claims = input.resolveClaims();
      if (!claims) throw new Error('personnel_pack_claim_unavailable');
      const url = new URL(delivery.assetUrl);
      url.searchParams.set('claim', claims.issue(url.searchParams.get('asset')!));
      return { ...delivery, assetUrl: url.toString() };
    }
    if (selection !== 'iso15189') return null;
    const claims = input.resolveClaims();
    if (!claims) throw new Error('personnel_pack_claim_unavailable');
    await ensurePersonnelPackPdf(input.store, input.generate);
    const url = new URL('/api/personnel-pack-download', origin);
    url.searchParams.set('asset', GENERATED_PACK_KEY);
    url.searchParams.set('claim', claims.issue(GENERATED_PACK_KEY));
    return { assetUrl: url.toString(), emailed: false, label: GENERATED_PACK_LABEL };
  };
}

export async function loadGeneratedPersonnelPack(store: PersonnelPackPdfStore, key: string) {
  if (key !== GENERATED_PACK_KEY) return null;
  const stored = await store.read(key);
  if (!stored) throw new Error('personnel_pack_pdf_missing');
  return { asset: { downloadFilename: GENERATED_PACK_FILENAME }, bytes: verifyPersonnelPackPdf(stored) };
}

import { prisma } from '../prisma';
import { configuredDownloadClaimService } from '../personnelPackDownloadClaims';
import { loadDownloadableAsset } from '../personnelPackFulfillment';
import { automaticPdfEnabled, createAutomaticPersonnelPackResolver, loadGeneratedPersonnelPack } from './fulfillment';
import { GENERATED_PACK_KEY } from './pdf';
import { createPrismaPersonnelPackPdfStore } from './storage';

const store = createPrismaPersonnelPackPdfStore(prisma);

export const resolveAutomaticPersonnelPack = createAutomaticPersonnelPackResolver({
  enabled: automaticPdfEnabled,
  store,
  resolveClaims: configuredDownloadClaimService,
});

export async function loadPersonnelPackDownload(key: string) {
  if (key === GENERATED_PACK_KEY) {
    if (!automaticPdfEnabled()) throw new Error('personnel_pack_pdf_disabled');
    return loadGeneratedPersonnelPack(store, key);
  }
  return loadDownloadableAsset(key);
}

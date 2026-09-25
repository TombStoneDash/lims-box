import { createPersonnelPackClaimPostHandler } from '@/lib/personnelPackDownloadClaims';

export const runtime = 'nodejs';

/** Redeems a one-time download claim submitted by the confirm page's form. */
export const POST = createPersonnelPackClaimPostHandler();

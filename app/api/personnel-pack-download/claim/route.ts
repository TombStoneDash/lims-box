import { createPersonnelPackClaimPostHandler } from '@/lib/personnelPackDownloadClaims';

export const runtime = 'nodejs';

// #124: GET confirms; only this POST consumes a signed one-time download claim.
export const POST = createPersonnelPackClaimPostHandler();

import { createPersonnelPackClaimPostHandler, configuredDownloadClaimService } from '@/lib/personnelPackDownloadClaims';
import { loadPersonnelPackDownload } from '@/lib/personnel-pack/runtime';

export const runtime = 'nodejs';

export const POST = createPersonnelPackClaimPostHandler(configuredDownloadClaimService, loadPersonnelPackDownload);

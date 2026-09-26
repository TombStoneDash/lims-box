import { prisma } from '@/lib/prisma';
import { sendSubmissionNotice, sendApplicantConfirmation } from '@/lib/notify';
import { createEarlyAccessPostHandler } from '@/lib/earlyAccessHandler';
import { limsFirstContactDryRun } from '@/lib/first-contact-lims';
import { limsHistorySources } from '@/lib/first-contact-lims-sources';

export const runtime = 'nodejs';

export const POST = createEarlyAccessPostHandler({
  createProspect: (record) => prisma.prospect.create({ data: record }),
  sendSubmissionNotice,
  sendApplicantConfirmation,
  firstContactDryRun: (input) => limsFirstContactDryRun({ endpoint: 'early-access', sources: limsHistorySources, ...input }),
});

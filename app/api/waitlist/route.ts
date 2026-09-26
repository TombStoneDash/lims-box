import { prisma } from '@/lib/prisma';
import { sendSubmissionNotice, sendApplicantConfirmation } from '@/lib/notify';
import { createWaitlistPostHandler } from '@/lib/waitlistHandler';
import { limsFirstContactDryRun } from '@/lib/first-contact-lims';
import { limsHistorySources } from '@/lib/first-contact-lims-sources';

export const runtime = 'nodejs';

export const POST = createWaitlistPostHandler({
  hasExistingSignup: async (email) =>
    (await prisma.prospect.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    })) !== null,
  createProspect: (record) => prisma.prospect.create({ data: record }),
  sendSubmissionNotice,
  sendApplicantConfirmation,
  firstContactDryRun: (input) => limsFirstContactDryRun({ endpoint: 'waitlist', sources: limsHistorySources, ...input }),
});

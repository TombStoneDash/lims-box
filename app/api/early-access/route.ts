import { prisma } from '@/lib/prisma';
import { sendSubmissionNotice, sendApplicantConfirmation } from '@/lib/notify';
import { createEarlyAccessPostHandler } from '@/lib/earlyAccessHandler';

export const runtime = 'nodejs';

export const POST = createEarlyAccessPostHandler({
  createProspect: (record) => prisma.prospect.create({ data: record }),
  sendSubmissionNotice,
  sendApplicantConfirmation,
});

import { leadLogMeta, safeErrorMeta } from '@/lib/safeLog';
import type { DeliveryResult } from './notify';
import { NextRequest, NextResponse } from 'next/server';
import { normalizeContactSubmission, type ContactSubmission } from '@/lib/contact-submission';

interface SubmissionNotice {
  subject: string;
  lines: Array<[string, string | null | undefined]>;
}

type ContactLead = ContactSubmission & { timestamp: string };

export interface ContactDependencies {
  saveLead: (record: ContactLead) => Promise<unknown>;
  sendSubmissionNotice: (notice: SubmissionNotice) => Promise<void | DeliveryResult>;
  firstContactDryRun: (input: { email: string; requestStartedAt: Date; coveredByTransactional: boolean }) => Promise<void>;
  now?: () => string;
}

export function createContactPostHandler(dependencies: ContactDependencies) {
  return async function handleContactPost(request: NextRequest) {
    // Taken before this request writes anything (first-contact dry run).
    const requestStartedAt = new Date();
    try {
      const body = await request.json();

      const normalized = normalizeContactSubmission(body);
      if (normalized.ok === false) {
        return NextResponse.json({ error: normalized.error }, { status: 400 });
      }

      const submission: ContactLead = {
        ...normalized.record,
        timestamp: (dependencies.now ?? (() => new Date().toISOString()))(),
      };

      // Audit log (kept for Vercel runtime trace)
      console.log('[contact] submission received:', leadLogMeta(submission));

      let dbSaved = false;
      try {
        await dependencies.saveLead(submission);
        dbSaved = true;
        console.log('[contact] DB save succeeded');
      } catch (dbErr) {
        console.error('[contact] DB save failed (non-fatal):', safeErrorMeta(dbErr));
      }

      let emailSent = false;
      try {
        await dependencies.sendSubmissionNotice({
          subject: `New contact form submission — ${submission.labName}`,
          lines: [
            ['Name', submission.name],
            ['Lab name', submission.labName],
            ['Email', submission.email],
            ['Lab size', submission.labSize],
            ['Current system', submission.currentSystem],
            ['Message', submission.message],
            ['Received', submission.timestamp],
          ],
        });
        emailSent = true;
        console.log('[contact] email notification sent');
      } catch (emailErr) {
        console.error('[contact] email send failed (non-fatal):', safeErrorMeta(emailErr));
      }

      if (!dbSaved && !emailSent) {
        // Both durable sinks failed: retain only redacted, non-PII metadata as the recovery copy.
        console.error('[contact] LEAD-RECOVERY (both sinks failed):', leadLogMeta(submission));
        console.error('[contact] both DB save and email send failed — returning 500');
        return NextResponse.json({ error: 'Failed to process submission' }, { status: 500 });
      }

      // The contact form sends no email to the person today, only Hudson's notice.
      await dependencies.firstContactDryRun({
        email: submission.email,
        requestStartedAt,
        coveredByTransactional: false,
      });

      return NextResponse.json({ success: true });
    } catch (err) {
      console.error('[contact] handler threw', safeErrorMeta(err));
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
  };
}

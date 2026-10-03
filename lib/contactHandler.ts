import { leadLogMeta, safeErrorMeta } from '@/lib/safeLog';
import type { DeliveryResult } from './notify';
import { NextRequest, NextResponse } from 'next/server';
import { normalizeContactSubmission, type ContactSubmission } from '@/lib/contact-submission';

interface SubmissionNotice {
  subject: string;
  lines: Array<[string, string | null | undefined]>;
}

export type ContactLeadRecord = ContactSubmission & { timestamp: string };

export interface ContactDependencies {
  saveLead: (submission: ContactLeadRecord) => Promise<boolean>;
  sendSubmissionNotice: (notice: SubmissionNotice) => Promise<void | DeliveryResult>;
  /** First-contact dry run (read-only, logs a hashed decision); optional. */
  firstContactDryRun?: (input: { email: string; requestStartedAt: Date; coveredByTransactional: boolean }) => Promise<void>;
  /** Last-resort recovery log when both the DB save and the email both fail; the caller owns the one console call. */
  logRecovery: (record: Record<string, unknown>) => void;
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
        return NextResponse.json(
          { error: normalized.error },
          { status: 400 },
        );
      }

      const submission: ContactLeadRecord = {
        ...normalized.record,
        timestamp: (dependencies.now ?? (() => new Date().toISOString()))(),
      };

      // Audit log (kept for Vercel runtime trace)
      console.log('[contact] submission received:', leadLogMeta(submission));

      const dbSaved = await dependencies.saveLead(submission);

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

      // Respond — 200 if EITHER path succeeded; 500 only if both failed.
      if (!dbSaved && !emailSent) {
        const record = { ...leadLogMeta(submission), email: submission.email };
        dependencies.logRecovery(record);
        console.error('[contact] both DB save and email send failed — returning 500');
        return NextResponse.json(
          { error: 'Failed to process submission' },
          { status: 500 },
        );
      }

      // The contact form sends no email to the person today, only Hudson's notice.
      await dependencies.firstContactDryRun?.({
        email: submission.email,
        requestStartedAt,
        coveredByTransactional: false,
      });

      return NextResponse.json({ success: true });
    } catch (err) {
      console.error('[contact] handler threw', safeErrorMeta(err));
      return NextResponse.json(
        { error: 'Invalid request' },
        { status: 400 },
      );
    }
  };
}

import { safeErrorMeta } from '@/lib/safeLog';
import { NotificationDeliveryError, type DeliveryResult } from './notify';
import { NextRequest, NextResponse } from 'next/server';
import { normalizeEmail } from '@/lib/emailValidation';

interface SubmissionNotice {
  subject: string;
  lines: Array<[string, string | null | undefined]>;
}

export interface WaitlistRecord {
  track: string;
  name: string;
  email: string;
  labName: string;
  labSize: string;
  accreditations: string;
  painPoint: null;
  source: string;
  fieldBenchSplit: null;
}

export interface WaitlistDependencies {
  /** True when a prospect with this normalized email was already recorded. */
  hasExistingSignup: (email: string) => Promise<boolean>;
  createProspect: (record: WaitlistRecord) => Promise<unknown>;
  sendSubmissionNotice: (notice: SubmissionNotice) => Promise<void | DeliveryResult>;
  sendApplicantConfirmation: (email: string, name: string) => Promise<void | DeliveryResult>;
  now?: () => string;
}

// Hudson's approval (2026-09-24, 17A) covers new signups only. The applicant
// email is sent only when this request newly recorded the address: the lookup
// succeeded, found no earlier prospect, and the new record was saved. Anything
// else (repeat signup, lookup or save failure) sends nothing.
async function confirmNewSignup(
  dependencies: WaitlistDependencies,
  record: WaitlistRecord,
  isNewSignup: boolean | null,
  dbSaved: boolean,
): Promise<string> {
  if (isNewSignup === false) return 'skipped (already on the list)';
  if (isNewSignup === null) return 'skipped (could not check the list)';
  if (!dbSaved) return 'skipped (signup not saved)';
  try {
    await dependencies.sendApplicantConfirmation(record.email, record.name);
    return 'sent';
  } catch (err) {
    console.error('[waitlist] applicant confirmation failed (non-fatal):', safeErrorMeta(err));
    if (err instanceof NotificationDeliveryError) {
      if (err.reason === 'not_configured') return 'not configured';
      if (err.reason === 'domain_not_verified') return 'blocked (domain not verified)';
      return err.httpStatus === undefined ? 'failed' : `failed (${err.httpStatus})`;
    }
    return 'failed';
  }
}

export function createWaitlistPostHandler(dependencies: WaitlistDependencies) {
  return async function handleWaitlistPost(request: NextRequest) {
    try {
      const body = await request.json();
      const { email, labName, name, organization, source } = body ?? {};

      const normalizedEmail = normalizeEmail(email);
      if (!normalizedEmail) {
        return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
      }

      const record: WaitlistRecord = {
        track: 'clinical',
        name: (name && String(name).trim())
          || (labName && String(labName).trim())
          || normalizedEmail.split('@')[0],
        email: normalizedEmail,
        labName: (labName && String(labName).trim()) || (organization ? String(organization).trim() : 'Waitlist'),
        labSize: 'unknown',
        accreditations: JSON.stringify([]),
        painPoint: null,
        source: source ? String(source).trim() : 'lims.bot',
        fieldBenchSplit: null,
      };

      let isNewSignup: boolean | null = null;
      try {
        isNewSignup = !(await dependencies.hasExistingSignup(record.email));
      } catch (lookupErr) {
        console.error('[waitlist] existing-signup lookup failed (non-fatal):', safeErrorMeta(lookupErr));
      }

      let dbSaved = false;
      try {
        await dependencies.createProspect(record);
        dbSaved = true;
      } catch (dbErr) {
        console.error('[waitlist] DB save failed (non-fatal):', safeErrorMeta(dbErr));
      }

      const confirmation = await confirmNewSignup(dependencies, record, isNewSignup, dbSaved);

      let noticeSent = false;
      try {
        await dependencies.sendSubmissionNotice({
          subject: `New waitlist signup — ${record.email}`,
          lines: [
            ['Email', record.email],
            ['Name', record.name],
            ['Lab name', record.labName],
            ['Source', record.source],
            ['Applicant confirmation', confirmation],
            ['Received', (dependencies.now ?? (() => new Date().toISOString()))()],
          ],
        });
        noticeSent = true;
      } catch (notifyErr) {
        console.error('[waitlist] notification failed (non-fatal):', safeErrorMeta(notifyErr));
      }

      if (!dbSaved && !noticeSent) {
        // Both durable sinks failed: retain the full lead here as the last recovery copy.
        console.error('[waitlist] LEAD-RECOVERY (both sinks failed):', record);
        return NextResponse.json({ error: 'Failed to process signup' }, { status: 500 });
      }

      return NextResponse.json({ success: true, saved: dbSaved });
    } catch (err) {
      console.error('[waitlist] handler threw', safeErrorMeta(err));
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
  };
}

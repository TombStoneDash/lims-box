import { leadLogMeta, safeErrorMeta } from '@/lib/safeLog';
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
  /** First-contact dry run (read-only, logs a hashed decision); optional. */
  firstContactDryRun?: (input: { email: string; requestStartedAt: Date; coveredByTransactional: boolean }) => Promise<void>;
  recordAcceptedTransactional?: (email: string) => Promise<void>;
  now?: () => string;
}

// Unlike early-access's resolveEarlyAdopterSource, this `source` is raw,
// attacker-controlled free text (see WaitlistRecord.source below), so the
// last-resort recovery log below must never carry it verbatim.
const WAITLIST_RECOVERY_SOURCE_PLACEHOLDER = 'redacted';

// Takes the sanitized recovery record as a plain parameter (never `record`,
// the full-PII submission in scope above the caller) so this is the file's
// only console call that can ever log a lead's email.
function logWaitlistRecovery(record: Record<string, unknown>): void {
  console.error('[waitlist] LEAD-RECOVERY (both sinks failed):', record);
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
    const delivery = await dependencies.sendApplicantConfirmation(record.email, record.name);
        if (delivery && delivery.status === 'sent') {
          try { await dependencies.recordAcceptedTransactional?.(record.email); }
          catch { console.warn('[first-contact] transactional_receipt_unavailable'); }
        }
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

// Trims before falling back so whitespace-only values (e.g. source: '   ')
// don't get stored as '' and miscounted by lib/admin/conversionReport.ts.
const text = (value: unknown): string => (value == null ? '' : String(value).trim());

export function createWaitlistPostHandler(dependencies: WaitlistDependencies) {
  return async function handleWaitlistPost(request: NextRequest) {
    // Taken before this request writes anything (first-contact dry run).
    const requestStartedAt = new Date();
    try {
      const body = await request.json();
      const { email, labName, name, organization, source } = body ?? {};

      const normalizedEmail = normalizeEmail(email);
      if (!normalizedEmail) {
        return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
      }

      const record: WaitlistRecord = {
        track: 'clinical',
        name: text(name) || text(labName) || normalizedEmail.split('@')[0],
        email: normalizedEmail,
        labName: text(labName) || text(organization) || 'Waitlist',
        labSize: 'unknown',
        accreditations: JSON.stringify([]),
        painPoint: null,
        source: text(source) || 'lims.bot',
        fieldBenchSplit: null,
      };

      let isNewSignup: boolean | null = null;
      try {
        isNewSignup = !(await dependencies.hasExistingSignup(record.email));
      } catch (lookupErr) {
        console.error('[waitlist] existing-signup lookup failed (non-fatal):', safeErrorMeta(lookupErr));
      }

      let dbSaved = false;
      if (isNewSignup === false) {
        // Already recorded for this email: skip createProspect so a repeat
        // submission doesn't inflate the conversion report with another row.
        dbSaved = true;
      } else {
        try {
          await dependencies.createProspect(record);
          dbSaved = true;
        } catch (dbErr) {
          console.error('[waitlist] DB save failed (non-fatal):', safeErrorMeta(dbErr));
        }
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
        logWaitlistRecovery({
          ...leadLogMeta({ ...record, source: WAITLIST_RECOVERY_SOURCE_PLACEHOLDER }),
          email: record.email,
        });
        return NextResponse.json({ error: 'Failed to process signup' }, { status: 500 });
      }

      // confirmNewSignup attempts the applicant confirmation only for a new, saved signup.
      try {
        await dependencies.firstContactDryRun?.({
          email: record.email,
          requestStartedAt,
          coveredByTransactional: isNewSignup === true && dbSaved,
        });
      } catch {
        // The dry run must never affect the signup.
      }

      return NextResponse.json({ success: true, saved: dbSaved });
    } catch (err) {
      console.error('[waitlist] handler threw', safeErrorMeta(err));
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
  };
}

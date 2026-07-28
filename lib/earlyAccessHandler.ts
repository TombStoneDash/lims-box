import { NextRequest, NextResponse } from 'next/server';
import {
  validateEarlyAccessApplication,
  type EarlyAccessRecord,
} from '@/lib/earlyAccessApplication';
import { resolveEarlyAdopterSource } from '@/lib/leadAttribution';

interface SubmissionNotice {
  subject: string;
  lines: Array<[string, string | null | undefined]>;
}

export interface EarlyAccessDependencies {
  createProspect: (record: EarlyAccessRecord) => Promise<unknown>;
  sendSubmissionNotice: (notice: SubmissionNotice) => Promise<void>;
  sendApplicantConfirmation: (email: string, name: string) => Promise<void>;
  now?: () => string;
}

export function createEarlyAccessPostHandler(dependencies: EarlyAccessDependencies) {
  return async function handleEarlyAccessPost(request: NextRequest) {
    try {
      const body = await request.json();
      const source = resolveEarlyAdopterSource(
        (body as Record<string, unknown> | null)?.source,
        request.headers.get('referer'),
        request.nextUrl.origin,
      );
      const validation = validateEarlyAccessApplication(body, source);
      if (validation.ok === false) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }

      const { record, labType } = validation;
      let dbSaved = false;
      try {
        await dependencies.createProspect(record);
        dbSaved = true;
      } catch (dbErr) {
        console.error('[early-access] DB save failed (non-fatal):', dbErr);
      }

      let noticeSent = false;
      try {
        await dependencies.sendSubmissionNotice({
          subject: `New early-adopter application — ${record.labName}`,
          lines: [
            ['Lab name', record.labName],
            ['Lab type', labType],
            ['Track', record.track],
            ['Contact name', record.name],
            ['Email', record.email],
            ['Monthly volume', record.labSize],
            ['Pain point', record.painPoint],
            ['Source', record.source],
            ['Received', (dependencies.now ?? (() => new Date().toISOString()))()],
          ],
        });
        noticeSent = true;
      } catch (notifyErr) {
        console.error('[early-access] notification failed (non-fatal)', notifyErr);
      }

      if (!dbSaved && !noticeSent) {
        return NextResponse.json(
          { error: 'Failed to process application' },
          { status: 500 },
        );
      }

      try {
        await dependencies.sendApplicantConfirmation(record.email, record.name);
      } catch (err) {
        console.error('[early-access] Applicant confirmation failed (non-fatal)', err);
      }

      return NextResponse.json({ success: true, saved: dbSaved });
    } catch (err) {
      console.error('[early-access] handler threw', err);
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
  };
}

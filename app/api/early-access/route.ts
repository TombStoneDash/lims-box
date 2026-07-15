import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendSubmissionNotice, sendApplicantConfirmation } from '@/lib/notify';
import { normalizeEmail } from '@/lib/emailValidation';
import { resolveEarlyAdopterSource } from '@/lib/leadAttribution';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      labName,
      labType,
      contactName,
      email,
      testVolume,
      monthlyVolume,
      painPoint,
      source,
    } = body ?? {};

    const normalizedEmail = normalizeEmail(email);
    if (!labName || !contactName || !normalizedEmail) {
      return NextResponse.json(
        { error: 'labName, contactName, and valid email are required' },
        { status: 400 },
      );
    }

    const record = {
      track: 'clinical',
      name: String(contactName).trim(),
      email: normalizedEmail,
      labName: String(labName).trim(),
      labSize: monthlyVolume
        ? String(monthlyVolume).trim()
        : (testVolume ? String(testVolume).trim() : 'unknown'),
      accreditations: JSON.stringify(labType ? [String(labType).trim()] : []),
      painPoint: painPoint ? String(painPoint).trim() : null,
      source: resolveEarlyAdopterSource(source, request.headers.get('referer')),
      fieldBenchSplit: null,
    };

    let dbSaved = false;
    try {
      await prisma.prospect.create({ data: record });
      dbSaved = true;
    } catch (dbErr) {
      console.error('[early-access] DB save failed (non-fatal):', dbErr);
    }

    let noticeSent = false;
    try {
      await sendSubmissionNotice({
        // Notify HT
        subject: `New early-adopter application — ${record.labName}`,
        lines: [
          ['Lab name', record.labName],
          ['Lab type', labType ? String(labType).trim() : null],
          ['Contact name', record.name],
          ['Email', record.email],
          ['Monthly volume', record.labSize],
          ['Pain point', record.painPoint],
          ['Source', record.source],
          ['Received', new Date().toISOString()],
        ],
      });
      noticeSent = true;
    } catch (notifyErr) {
      console.error('[early-access] notification failed (non-fatal)', notifyErr);
    }

    // Applicant confirmation — non-blocking; failure does NOT affect form response
    try {
      await sendApplicantConfirmation(record.email, record.name);
    } catch (err) {
      console.error('[early-access] Applicant confirmation failed (non-fatal)', err);
    }

    if (!dbSaved && !noticeSent) {
      return NextResponse.json(
        { error: 'Failed to process application' },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, saved: dbSaved });
  } catch (err) {
    console.error('[early-access] handler threw', err);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}

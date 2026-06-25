import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendSubmissionNotice, sendApplicantConfirmation } from '@/lib/notify';
import { normalizeEmail } from '@/lib/emailValidation';

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
      source: source ? String(source).trim() : 'lims.bot/early-adopter',
      fieldBenchSplit: null,
    };

    await prisma.prospect.create({ data: record });

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

    // Applicant confirmation — non-blocking; failure does NOT affect form response
    try {
      await sendApplicantConfirmation(record.email, record.name);
    } catch (err) {
      console.error('[early-access] Applicant confirmation failed (non-fatal)', err);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[early-access] handler threw', err);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}

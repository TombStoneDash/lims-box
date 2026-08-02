import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendSubmissionNotice } from '@/lib/notify';
import { normalizeEmail } from '@/lib/emailValidation';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, labName, name, organization, role, source } = body ?? {};

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }
    const record = {
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

    await prisma.prospect.create({ data: record });

    await sendSubmissionNotice({
      subject: `New waitlist signup — ${record.email}`,
      lines: [
        ['Email', record.email],
        ['Name', record.name],
        ['Lab name', record.labName],
        ['Source', record.source],
        ['Received', new Date().toISOString()],
      ],
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[waitlist] handler threw', err);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { sendSubmissionNotice } from '@/lib/notify';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, labName, email, labSize, currentSystem, message } = body ?? {};

    if (!name || !email || !labName) {
      return NextResponse.json(
        { error: 'Name, email, and lab name are required' },
        { status: 400 },
      );
    }

    const record = {
      name: String(name).trim(),
      labName: String(labName).trim(),
      email: String(email).trim().toLowerCase(),
      labSize: labSize ? String(labSize).trim() : null,
      currentSystem: currentSystem ? String(currentSystem).trim() : null,
      message: message ? String(message).trim() : null,
      timestamp: new Date().toISOString(),
    };

    // Audit log (kept for Vercel runtime trace)
    console.log('[contact] submission received:', record);

    // Send email notification (Resend → NOTIFY_EMAIL, default hudtaylor@gmail.com)
    await sendSubmissionNotice({
      subject: `New contact form submission — ${record.labName}`,
      lines: [
        ['Name', record.name],
        ['Lab name', record.labName],
        ['Email', record.email],
        ['Lab size', record.labSize],
        ['Current system', record.currentSystem],
        ['Message', record.message],
        ['Received', record.timestamp],
      ],
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[contact] handler threw', err);
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 },
    );
  }
}

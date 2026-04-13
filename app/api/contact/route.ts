import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, labName, email, labSize, currentSystem, message } = body;

    if (!name || !email || !labName) {
      return NextResponse.json(
        { error: 'Name, email, and lab name are required' },
        { status: 400 },
      );
    }

    // Log the submission (replace with email service or database in production)
    console.log('Contact form submission:', {
      name,
      labName,
      email,
      labSize,
      currentSystem,
      message,
      timestamp: new Date().toISOString(),
    });

    // TODO: Integrate with email service (SendGrid, Resend, etc.) to send to info@lims.bot
    // TODO: Or store in Supabase/database

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 },
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, labName } = body;

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 },
      );
    }

    // Log the waitlist signup (replace with database in production)
    console.log('Waitlist signup:', {
      email,
      labName: labName || null,
      timestamp: new Date().toISOString(),
      source: 'footer_cta',
    });

    // TODO: Store in Supabase or other database
    // TODO: Send confirmation email via SendGrid/Resend

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 },
    );
  }
}

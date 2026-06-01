import { NextResponse } from 'next/server';

/**
 * GET /api/checkout/personnel-pack
 *
 * Personnel Pack is included in every LIMS BOX plan at no extra cost.
 * This route redirects lab directors from email CTAs to the early-adopter
 * conversion page. A full Stripe checkout session can be wired here once
 * a standalone SKU is introduced.
 */
export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.redirect(
    new URL(
      '/early-adopter?source=personnel-pack-checkout',
      process.env.NEXT_PUBLIC_SITE_URL ?? 'https://limsbox.com',
    ),
    { status: 302 },
  );
}

export async function POST() {
  // Future: create Stripe checkout session for standalone PP SKU.
  // For now, redirect to early-adopter flow.
  return NextResponse.json(
    {
      redirect: '/early-adopter?source=personnel-pack-checkout',
      message:
        'Personnel Pack is included in all LIMS BOX plans. Complete your early-adopter application to get started.',
    },
    { status: 200 },
  );
}

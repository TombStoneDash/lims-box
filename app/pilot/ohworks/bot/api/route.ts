import { NextResponse } from 'next/server';

export function POST() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const passcode = process.env.ACCESS_PASSCODE;
  if (!passcode) {
    // If no passcode configured, allow access (dev mode)
    return NextResponse.json({ success: true });
  }

  let body: { passcode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.passcode) {
    return NextResponse.json({ error: 'Passcode required' }, { status: 400 });
  }

  if (body.passcode === passcode) {
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Invalid passcode' }, { status: 401 });
}

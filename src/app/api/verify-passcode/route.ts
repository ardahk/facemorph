import { NextRequest, NextResponse } from 'next/server';
import {
  AUTH_COOKIE_NAME,
  createAuthCookieValue,
  getAuthCookieMaxAgeSeconds,
} from '@/lib/auth';
import { isKvConfigured, kvNumberCommand } from '@/lib/kv';

const PASSCODE_WINDOW_SECONDS = 15 * 60;
const PASSCODE_MAX_ATTEMPTS = 10;

export async function POST(request: NextRequest) {
  const passcode = process.env.ACCESS_PASSCODE;
  const isProd = process.env.NODE_ENV === 'production';

  if (!passcode) {
    if (isProd) {
      return NextResponse.json(
        { error: 'ACCESS_PASSCODE is not configured.' },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true });
  }

  const clientIp = getClientIp(request);
  const attempts = await checkPasscodeAttempts(clientIp);
  if (!attempts.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Please try again later.' },
      { status: 429 }
    );
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
    try {
      const res = NextResponse.json({ success: true });
      res.cookies.set(AUTH_COOKIE_NAME, createAuthCookieValue(), {
        httpOnly: true,
        secure: isProd,
        sameSite: 'strict',
        path: '/',
        maxAge: getAuthCookieMaxAgeSeconds(),
      });
      await resetPasscodeAttempts(clientIp);
      return res;
    } catch {
      return NextResponse.json(
        { error: 'Auth cookie configuration error.' },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ error: 'Invalid passcode' }, { status: 401 });
}

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  return request.ip ?? 'unknown';
}

async function checkPasscodeAttempts(
  ip: string
): Promise<{ allowed: boolean }> {
  if (!isKvConfigured()) {
    return { allowed: true };
  }

  const key = `passcode:attempts:${ip}`;
  const count = await kvNumberCommand('INCR', key);
  if (count === 1) {
    await kvNumberCommand('EXPIRE', key, String(PASSCODE_WINDOW_SECONDS));
  }
  return { allowed: count <= PASSCODE_MAX_ATTEMPTS };
}

async function resetPasscodeAttempts(ip: string): Promise<void> {
  if (!isKvConfigured()) return;
  const key = `passcode:attempts:${ip}`;
  try {
    await kvNumberCommand('DEL', key);
  } catch {
    // Best-effort cleanup.
  }
}

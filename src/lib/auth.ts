import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

export const AUTH_COOKIE_NAME = 'fm_auth';
const AUTH_COOKIE_TTL_SECONDS = 60 * 60 * 8; // 8 hours

interface AuthCookiePayload {
  exp: number;
  nonce: string;
}

export function createAuthCookieValue(): string {
  const payload: AuthCookiePayload = {
    exp: Date.now() + AUTH_COOKIE_TTL_SECONDS * 1000,
    nonce: randomBytes(12).toString('hex'),
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const sig = sign(encodedPayload);
  return `${encodedPayload}.${sig}`;
}

export function isAuthCookieValid(cookieValue: string | undefined): boolean {
  if (!cookieValue) return false;

  const [encodedPayload, providedSig] = cookieValue.split('.');
  if (!encodedPayload || !providedSig) return false;

  const expectedSig = sign(encodedPayload);
  if (!constantTimeEqual(providedSig, expectedSig)) return false;

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload)) as AuthCookiePayload;
    return typeof payload.exp === 'number' && payload.exp > Date.now();
  } catch {
    return false;
  }
}

export function getAuthCookieMaxAgeSeconds(): number {
  return AUTH_COOKIE_TTL_SECONDS;
}

function sign(input: string): string {
  const secret = getAuthSecret();
  return createHmac('sha256', secret).update(input).digest('hex');
}

function getAuthSecret(): string {
  const secret = process.env.AUTH_COOKIE_SECRET || process.env.ACCESS_PASSCODE;
  if (!secret || secret.length < 16) {
    throw new Error('AUTH_COOKIE_SECRET (or strong ACCESS_PASSCODE) is required');
  }
  return secret;
}

function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function fromBase64Url(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

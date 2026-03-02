import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const RATE_FILE = process.env.VERCEL
  ? '/tmp/rate-limit.json'
  : join(process.cwd(), 'rate-limit.json');
const KV_REST_URL =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_REST_TOKEN =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const HOURLY_LIMIT = 30;
const DAILY_LIMIT = 50;

interface RateData {
  calls: number[]; // timestamps in ms
}

function readRateData(): RateData {
  if (!existsSync(RATE_FILE)) return { calls: [] };
  try {
    return JSON.parse(readFileSync(RATE_FILE, 'utf-8'));
  } catch {
    return { calls: [] };
  }
}

function writeRateData(data: RateData): void {
  try {
    writeFileSync(RATE_FILE, JSON.stringify(data, null, 2));
  } catch {
    // Ignore persistence errors in restricted runtimes (e.g. serverless FS).
    // The API should still function even if rate-limit state cannot be saved.
  }
}

export interface RateLimitResult {
  allowed: boolean;
  hourlyRemaining: number;
  dailyRemaining: number;
  retryAfterSeconds?: number;
  message?: string;
}

export async function checkAndRecordCall(): Promise<RateLimitResult> {
  if (KV_REST_URL && KV_REST_TOKEN) {
    try {
      return await checkAndRecordGlobalCall();
    } catch {
      // Fall back to local file-based limiter in non-prod/dev failure cases.
    }
  }
  return checkAndRecordLocalCall();
}

function checkAndRecordLocalCall(): RateLimitResult {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const oneDayAgo = now - 24 * 60 * 60 * 1000;

  const data = readRateData();

  // Prune old entries (older than 24h)
  data.calls = data.calls.filter((ts) => ts > oneDayAgo);

  const hourCalls = data.calls.filter((ts) => ts > oneHourAgo);
  const dayCalls = data.calls;

  const hourlyRemaining = Math.max(0, HOURLY_LIMIT - hourCalls.length);
  const dailyRemaining = Math.max(0, DAILY_LIMIT - dayCalls.length);

  if (hourCalls.length >= HOURLY_LIMIT) {
    const oldestHour = hourCalls[0];
    const retryAfterSeconds = Math.ceil((oldestHour + 60 * 60 * 1000 - now) / 1000);
    writeRateData(data);
    return {
      allowed: false,
      hourlyRemaining: 0,
      dailyRemaining,
      retryAfterSeconds,
      message: `Hourly limit reached (${HOURLY_LIMIT}/hour). Try again in ${Math.ceil(retryAfterSeconds / 60)} minutes.`,
    };
  }

  if (dayCalls.length >= DAILY_LIMIT) {
    const oldestDay = dayCalls[0];
    const retryAfterSeconds = Math.ceil((oldestDay + 24 * 60 * 60 * 1000 - now) / 1000);
    writeRateData(data);
    return {
      allowed: false,
      hourlyRemaining,
      dailyRemaining: 0,
      retryAfterSeconds,
      message: `Daily limit reached (${DAILY_LIMIT}/day). Try again in ${Math.ceil(retryAfterSeconds / 3600)} hours.`,
    };
  }

  // Record this call
  data.calls.push(now);
  writeRateData(data);

  return {
    allowed: true,
    hourlyRemaining: hourlyRemaining - 1,
    dailyRemaining: dailyRemaining - 1,
  };
}

async function checkAndRecordGlobalCall(): Promise<RateLimitResult> {
  const now = new Date();
  const hourKey = `ratelimit:global:hour:${formatUtcHour(now)}`;
  const dayKey = `ratelimit:global:day:${formatUtcDay(now)}`;

  const hourCount = await redisNumberCommand('INCR', hourKey);
  await redisNumberCommand('EXPIRE', hourKey, String(60 * 60 * 2));
  if (hourCount > HOURLY_LIMIT) {
    await redisNumberCommand('DECR', hourKey);
    const retryAfterSeconds = secondsUntilNextUtcHour(now);
    return {
      allowed: false,
      hourlyRemaining: 0,
      dailyRemaining: Math.max(0, DAILY_LIMIT - 1),
      retryAfterSeconds,
      message: `Hourly limit reached (${HOURLY_LIMIT}/hour). Try again in ${Math.ceil(retryAfterSeconds / 60)} minutes.`,
    };
  }

  const dayCount = await redisNumberCommand('INCR', dayKey);
  await redisNumberCommand('EXPIRE', dayKey, String(60 * 60 * 24 * 2));
  if (dayCount > DAILY_LIMIT) {
    await redisNumberCommand('DECR', dayKey);
    await redisNumberCommand('DECR', hourKey);
    const retryAfterSeconds = secondsUntilNextUtcDay(now);
    return {
      allowed: false,
      hourlyRemaining: Math.max(0, HOURLY_LIMIT - hourCount + 1),
      dailyRemaining: 0,
      retryAfterSeconds,
      message: `Daily limit reached (${DAILY_LIMIT}/day). Try again in ${Math.ceil(retryAfterSeconds / 3600)} hours.`,
    };
  }

  return {
    allowed: true,
    hourlyRemaining: HOURLY_LIMIT - hourCount,
    dailyRemaining: DAILY_LIMIT - dayCount,
  };
}

async function redisNumberCommand(...parts: string[]): Promise<number> {
  if (!KV_REST_URL || !KV_REST_TOKEN) {
    throw new Error('KV REST environment variables are not configured');
  }

  const path = parts.map((part) => encodeURIComponent(part)).join('/');
  const res = await fetch(`${KV_REST_URL}/${path}`, {
    headers: {
      Authorization: `Bearer ${KV_REST_TOKEN}`,
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`KV command failed: ${res.status}`);
  }

  const data = (await res.json()) as { result?: number | string | null };
  const value = Number(data.result ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function formatUtcHour(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const h = String(date.getUTCHours()).padStart(2, '0');
  return `${y}${m}${d}${h}`;
}

function formatUtcDay(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function secondsUntilNextUtcHour(date: Date): number {
  const next = new Date(date);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(next.getUTCHours() + 1);
  return Math.max(1, Math.ceil((next.getTime() - date.getTime()) / 1000));
}

function secondsUntilNextUtcDay(date: Date): number {
  const next = new Date(date);
  next.setUTCHours(24, 0, 0, 0);
  return Math.max(1, Math.ceil((next.getTime() - date.getTime()) / 1000));
}

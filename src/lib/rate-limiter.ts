import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const RATE_FILE = process.env.VERCEL
  ? '/tmp/rate-limit.json'
  : join(process.cwd(), 'rate-limit.json');
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

export function checkAndRecordCall(): RateLimitResult {
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

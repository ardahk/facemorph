const KV_REST_URL =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_REST_TOKEN =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export function isKvConfigured(): boolean {
  return Boolean(KV_REST_URL && KV_REST_TOKEN);
}

export async function kvNumberCommand(...parts: string[]): Promise<number> {
  const value = await kvCommand(...parts);
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

async function kvCommand(...parts: string[]): Promise<number | string | null> {
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
  return data.result ?? null;
}

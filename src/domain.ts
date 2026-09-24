import type { Ctx } from "./bot.js";

export interface Watch { ticker: string; name: string; id: string; }
export interface Alert {
  id: string; ticker: string; type: "threshold" | "percent";
  target?: number; percent?: number; window: string; cooldown: number;
  enabled: boolean; lastFired?: number;
}
export interface UserData {
  timezone: string; watch: Watch[]; alerts: Alert[];
  quietStart?: string; quietEnd?: string; morning?: string;
  defaultCooldown: number; active: boolean; paused?: boolean;
  lastPrices?: Record<string, number>;
  queued?: Record<string, { old: number; latest: number; count: number }>;
  priceCache?: Record<string, CachedPrice>;
}

export interface CachedPrice {
  price: number;
  change: number;
  fetchedAt: number;
}

export const SEEDS: Watch[] = [
  { ticker: "BTC", name: "Bitcoin", id: "bitcoin" },
  { ticker: "ETH", name: "Ethereum", id: "ethereum" },
  { ticker: "TON", name: "Toncoin", id: "the-open-network" },
];

export function now(): number { return Date.now(); }

export function data(ctx: Ctx): UserData {
  const d = ctx.session.data;
  if (d) return d;
  const fresh: UserData = { timezone: "UTC", watch: [], alerts: [], defaultCooldown: 7200, active: true, lastPrices: {}, queued: {} };
  ctx.session.data = fresh;
  return fresh;
}

export function save(ctx: Ctx, d: UserData): void { ctx.session.data = d; }

export function seedFor(input: string): Watch | undefined {
  const value = input.trim().toUpperCase();
  return SEEDS.find((s) => s.ticker === value || s.name.toUpperCase() === value);
}

export function watchFor(d: UserData, ticker: string): Watch | undefined {
  return d.watch.find((w) => w.ticker === ticker.toUpperCase());
}

export function parseDuration(value: string): number | undefined {
  const m = value.trim().toLowerCase().match(/^(\d+)\s*(m|h|d)?$/);
  if (!m) return undefined;
  const n = Number(m[1]);
  return n > 0 ? n * (m[2] === "m" ? 60 : m[2] === "d" ? 86400 : 3600) : undefined;
}

export function priceText(value: number): string { return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`; }

const PRICE_FEED_URL = "https://api.coingecko.com/api/v3/simple/price";
const MAX_ATTEMPTS = 4; // initial request + up to three retries
const MAX_BACKOFF_MS = 2_000;

function retryAfterMs(response: Response): number | undefined {
  const value = response.headers.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.min(MAX_BACKOFF_MS, Math.max(0, seconds * 1_000));
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.min(MAX_BACKOFF_MS, Math.max(0, date - now())) : undefined;
}

function jitterMs(max: number): number {
  // WebCrypto is available in Workers and avoids Math.random() in bot logic.
  if (max <= 0 || typeof crypto === "undefined" || !crypto.getRandomValues) return 0;
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return bytes[0]! % (max + 1);
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function isTransient(status: number | undefined): boolean {
  return status === undefined || status === 429 || status >= 500;
}

/** Fetch only live data. Callers evaluating alerts must use this function so a
 * cached quote can never fire an alert. */
export async function fetchPrice(w: Watch): Promise<{ price: number; change: number }> {
  let last: unknown;
  let lastStatus: number | undefined;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetchWithTimeout(`${PRICE_FEED_URL}?ids=${encodeURIComponent(w.id)}&vs_currencies=usd&include_24hr_change=true`);
      lastStatus = response.status;
      if (!response.ok) {
        const retryable = isTransient(response.status);
        last = new Error(`price feed ${response.status}`);
        if (!retryable) throw last;
        if (attempt === MAX_ATTEMPTS - 1) throw last;
        const exponential = Math.min(MAX_BACKOFF_MS, 100 * 2 ** attempt);
        await waitMs(retryAfterMs(response) ?? exponential + jitterMs(Math.min(100, exponential)));
        continue;
      }
      const json = await response.json() as Record<string, { usd?: number; usd_24h_change?: number }>;
      const item = json[w.id];
      if (typeof item?.usd !== "number" || !Number.isFinite(item.usd) || typeof item.usd_24h_change !== "number" || !Number.isFinite(item.usd_24h_change)) {
        last = new Error("price feed returned incomplete data");
        if (attempt === MAX_ATTEMPTS - 1) throw last;
        await waitMs(Math.min(MAX_BACKOFF_MS, 100 * 2 ** attempt) + jitterMs(100));
        continue;
      }
      return { price: item.usd, change: item.usd_24h_change };
    } catch (err) {
      last = err;
      if (attempt === MAX_ATTEMPTS - 1 || (lastStatus !== undefined && !isTransient(lastStatus))) {
        console.warn("[CryptoPing] price feed request failed", {
          ticker: w.ticker,
          status: lastStatus,
          attempt: attempt + 1,
        });
        throw last;
      }
      const exponential = Math.min(MAX_BACKOFF_MS, 100 * 2 ** attempt);
      await waitMs(exponential + jitterMs(Math.min(100, exponential)));
    }
  }
  throw last instanceof Error ? last : new Error("price feed unavailable");
}

export function cachePrice(d: UserData, ticker: string, quote: { price: number; change: number }): CachedPrice {
  const cached = { ...quote, fetchedAt: now() };
  d.priceCache = { ...(d.priceCache ?? {}), [ticker]: cached };
  return cached;
}

export function menuBack() { return { inline_keyboard: [[{ text: "⬅️ Back to menu", callback_data: "menu:main" }]] }; }

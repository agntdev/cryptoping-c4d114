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

export async function fetchPrice(w: Watch): Promise<{ price: number; change: number }> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(w.id)}&vs_currencies=usd&include_24hr_change=true`);
      if (!response.ok) throw new Error(`price feed ${response.status}`);
      const json = await response.json() as Record<string, { usd?: number; usd_24h_change?: number }>;
      const item = json[w.id];
      if (!item?.usd || typeof item.usd_24h_change !== "number") throw new Error("missing price");
      return { price: item.usd, change: item.usd_24h_change };
    } catch (err) { last = err; if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt)); }
  }
  throw last instanceof Error ? last : new Error("price feed unavailable");
}

export function menuBack() { return { inline_keyboard: [[{ text: "⬅️ Back to menu", callback_data: "menu:main" }]] }; }

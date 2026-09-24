import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { cachePrice, data, fetchPrice, priceText, seedFor, watchFor } from "../domain.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
registerMainMenuItem({ label: "Watchlist", data: "watch:list", order: 25 });
const composer = new Composer<Ctx>();
async function show(ctx: Ctx, input?: string) {
  const d = data(ctx); const coins = input ? [watchFor(d, input) ?? seedFor(input)] : d.watch;
  if (!coins.length || !coins[0]) { await ctx.reply(input ? "I couldn't find that ticker. Check the spelling and try again." : "Your watchlist is empty — tap Add coin to create one.", { reply_markup: input ? undefined : inlineKeyboard([[inlineButton("Add coin", "watch:add")]]) }); return; }
  const lines: string[] = [];
  let usedCache = false;
  let cachedAt: number | undefined;
  for (const coin of coins) {
    if (!coin) continue;
    let p: { price: number; change: number };
    try {
      p = await fetchPrice(coin);
      cachePrice(d, coin.ticker, p);
    } catch {
      const cached = d.priceCache?.[coin.ticker];
      if (!cached) { await ctx.reply("The price feed is temporarily unavailable. Try again in a moment."); return; }
      p = cached;
      usedCache = true;
      cachedAt = cached.fetchedAt;
    }
    const marked = d.alerts.some((a) => a.ticker === coin.ticker && a.enabled && ((a.type === "threshold" && p.price >= (a.target ?? Infinity)) || (a.type === "percent" && Math.abs(p.change) >= (a.percent ?? Infinity))));
    lines.push(`${coin.ticker}: ${priceText(p.price)} (${p.change >= 0 ? "+" : ""}${p.change.toFixed(2)}% 24h)${marked ? " — an alert condition is met" : ""}`);
  }
  if (usedCache) lines.unshift(`Last known price (${new Date(cachedAt ?? 0).toISOString()}) — data may be stale due to feed outage.`);
  // Preserve the quote cache in the toolkit-backed session between updates.
  ctx.session.data = d;
  await ctx.reply(lines.join("\n"));
}
composer.command("price", async (ctx) => { const args = ctx.message?.text?.split(/\s+/).slice(1).filter(Boolean); await show(ctx, args?.[0]); });
composer.callbackQuery("watch:list", async (ctx) => { await ctx.answerCallbackQuery(); await show(ctx); });
export default composer;

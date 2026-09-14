import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { data, fetchPrice, now, priceText, save } from "../domain.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";

registerMainMenuItem({ label: "Check alerts", data: "alerts:check", order: 35 });
const composer = new Composer<Ctx>();

function quiet(d: ReturnType<typeof data>): boolean {
  if (!d.quietStart || !d.quietEnd) return false;
  const current = new Date(now());
  const minutes = current.getUTCHours() * 60 + current.getUTCMinutes();
  const parse = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
  const start = parse(d.quietStart); const end = parse(d.quietEnd);
  return start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

composer.callbackQuery("alerts:check", async (ctx) => {
  await ctx.answerCallbackQuery();
  const d = data(ctx);
  if (d.paused) { await ctx.reply("Notifications are paused in your settings."); return; }
  const fired: string[] = [];
  for (const coin of d.watch) {
    try {
      const quote = await fetchPrice(coin);
      const old = d.lastPrices?.[coin.ticker]; d.lastPrices = { ...(d.lastPrices ?? {}), [coin.ticker]: quote.price };
      if (old === undefined) continue;
      for (const alert of d.alerts.filter((a) => a.enabled && a.ticker === coin.ticker)) {
        const condition = alert.type === "threshold" ? quote.price >= (alert.target ?? Infinity) : Math.abs(quote.change) >= (alert.percent ?? Infinity);
        const cooldown = alert.lastFired !== undefined && now() - alert.lastFired < alert.cooldown * 1000;
        if (!condition || cooldown) continue;
        alert.lastFired = now();
        if (quiet(d)) {
          const q = d.queued?.[coin.ticker] ?? { old, latest: quote.price, count: 0 };
          d.queued = { ...(d.queued ?? {}), [coin.ticker]: { old: q.old, latest: quote.price, count: q.count + 1 } };
        } else fired.push(`${coin.ticker} moved: old ${priceText(old)} -> new ${priceText(quote.price)} (${((quote.price - old) / old * 100).toFixed(2)}% change)`);
      }
    } catch { /* scheduled checks retry on their next run; no unsolicited error */ }
  }
  save(ctx, d);
  if (fired.length) await ctx.reply(fired.join("\n"));
  else await ctx.reply("No alert conditions are met right now.");
});

composer.callbackQuery("alerts:deliver", async (ctx) => {
  await ctx.answerCallbackQuery(); const d = data(ctx); const q = d.queued ?? {};
  const lines = Object.entries(q).map(([ticker, e]) => `${ticker} moved while quiet: ${priceText(e.old)} -> ${priceText(e.latest)} (${e.count} event${e.count === 1 ? "" : "s"})`);
  if (!lines.length) { await ctx.reply("There are no queued alerts."); return; }
  d.queued = {}; save(ctx, d); await ctx.reply(lines.join("\n"));
});
export default composer;

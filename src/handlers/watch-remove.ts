import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { data, save } from "../domain.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
registerMainMenuItem({ label: "Remove coin", data: "watch:remove", order: 30 });
const composer = new Composer<Ctx>();
composer.callbackQuery("watch:remove", async (ctx) => {
  await ctx.answerCallbackQuery(); const d = data(ctx);
  if (!d.watch.length) { await ctx.reply("Your watchlist is empty — tap Add coin to create one."); return; }
  await ctx.reply("Choose a coin to remove.", { reply_markup: inlineKeyboard(d.watch.map((w) => [inlineButton(`${w.name} (${w.ticker})`, `watch:remove:${w.ticker}`)])) });
});
composer.callbackQuery(/^watch:remove:([A-Z]+)$/, async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.flow = `remove:${ctx.match[1]}`; await ctx.reply(`Remove ${ctx.match[1]} and its alerts?`, { reply_markup: inlineKeyboard([[inlineButton("Yes, remove", `watch:confirm:${ctx.match[1]}`), inlineButton("Keep it", "watch:remove:no")]]) }); });
composer.callbackQuery(/^watch:confirm:([A-Z]+)$/, async (ctx) => { await ctx.answerCallbackQuery(); const ticker = ctx.match[1]; const d = data(ctx); d.watch = d.watch.filter((w) => w.ticker !== ticker); d.alerts = d.alerts.filter((a) => a.ticker !== ticker); save(ctx, d); await ctx.reply(`${ticker} was removed from your watchlist and its alerts were deleted.`); });
composer.callbackQuery("watch:remove:no", async (ctx) => { await ctx.answerCallbackQuery(); await ctx.reply("Nothing was removed."); });
export default composer;

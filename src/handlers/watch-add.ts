import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { data, save, seedFor, SEEDS, watchFor } from "../domain.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
registerMainMenuItem({ label: "Add coin", data: "watch:add", order: 10 });
const composer = new Composer<Ctx>();
function picker() { return inlineKeyboard([[...SEEDS.map((s) => inlineButton(s.name, `watch:add:${s.ticker}`))], [inlineButton("Type ticker", "watch:add:type")]]); }
async function add(ctx: Ctx, input: string) {
  const coin = seedFor(input);
  if (!coin) { await ctx.reply("I couldn't find that coin. Try BTC, ETH, or TON, or type another ticker.", { reply_markup: picker() }); return; }
  const d = data(ctx);
  if (!watchFor(d, coin.ticker)) { d.watch.push(coin); save(ctx, d); }
  ctx.session.flow = undefined;
  await ctx.reply(`${coin.name} (${coin.ticker}) is on your watchlist.`, { reply_markup: inlineKeyboard([[inlineButton("Add another", "watch:add"), inlineButton("Back to menu", "menu:main")]]) });
}
composer.callbackQuery("watch:add", async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.flow = "add"; await ctx.reply("Choose a coin to watch, or type its ticker.", { reply_markup: picker() }); });
composer.callbackQuery(/^watch:add:([A-Z]+)$/, async (ctx) => { await ctx.answerCallbackQuery(); await add(ctx, ctx.match[1]); });
composer.callbackQuery("watch:add:type", async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.flow = "add"; await ctx.reply("Type a ticker, such as BTC."); });
composer.on("message:text", async (ctx, next) => { if (ctx.session.flow !== "add") return next(); await add(ctx, ctx.message.text); });
export default composer;

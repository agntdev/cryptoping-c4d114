import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
const composer = new Composer<Ctx>();
const HELP = "CryptoPing tracks your private watchlist and sends threshold or percent-change alerts. Tap /start for the menu, or use /price [ticker] for a live quote.";
const keys = inlineKeyboard([[inlineButton("Add coin", "watch:add"), inlineButton("Create alert", "alert:create:start")], [inlineButton("Check prices", "watch:list"), inlineButton("Back to menu", "menu:main")]]);
composer.command("help", async (ctx) => { await ctx.reply(HELP, { reply_markup: keys }); });
composer.callbackQuery("menu:help", async (ctx) => { await ctx.answerCallbackQuery(); await ctx.editMessageText(HELP, { reply_markup: keys }); });
export default composer;

import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { data, save } from "../domain.js";
import { inlineButton, inlineKeyboard, mainMenuKeyboard } from "../toolkit/index.js";

const composer = new Composer<Ctx>();
const WELCOME = "Welcome to CryptoPing. Track prices and receive focused alerts in a private chat.";
const TIMEZONES = inlineKeyboard([[inlineButton("UTC", "tz:UTC"), inlineButton("America/New_York", "tz:America/New_York")], [inlineButton("Europe/London", "tz:Europe/London"), inlineButton("Asia/Tokyo", "tz:Asia/Tokyo")], [inlineButton("Type timezone", "tz:type"), inlineButton("Skip (UTC)", "tz:skip")]]);

composer.command("start", async (ctx) => {
  data(ctx);
  ctx.session.flow = "timezone";
  await ctx.reply(`${WELCOME}\n\nChoose your timezone for quiet hours and summaries.`, { reply_markup: TIMEZONES });
});

async function finish(ctx: Ctx, timezone: string) {
  const d = data(ctx); d.timezone = timezone; save(ctx, d); ctx.session.flow = undefined;
  await ctx.reply(`Timezone set to ${timezone}.`, { reply_markup: mainMenuKeyboard() });
}
composer.callbackQuery(/^tz:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const tz = ctx.match[1];
  if (tz === "type") { ctx.session.flow = "timezone-text"; await ctx.reply("Type an IANA timezone, such as Europe/Paris."); return; }
  await finish(ctx, tz === "skip" ? "UTC" : tz);
});
composer.on("message:text", async (ctx, next) => {
  if (ctx.session.flow !== "timezone-text") return next();
  const value = ctx.message.text.trim();
  if (!/^[A-Za-z_]+(?:\/[A-Za-z_+.-]+)+$/.test(value) && value !== "UTC" && value !== "GMT") {
    await ctx.reply("That timezone format isn't recognised. Try Europe/Paris or tap Skip (UTC)."); return;
  }
  await finish(ctx, value);
});
composer.callbackQuery("menu:main", async (ctx) => { await ctx.answerCallbackQuery(); await ctx.editMessageText(WELCOME, { reply_markup: mainMenuKeyboard() }); });
export default composer;

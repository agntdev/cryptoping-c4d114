import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { adminChatId, requireOwner } from "../toolkit/index.js";
const composer = new Composer<Ctx>();

composer.command("stats-request", async (ctx) => {
  if (!(await requireOwner(ctx as never))) return;
  const owner = adminChatId(ctx as never);
  if (!owner) { await ctx.reply("Owner access isn't set up yet."); return; }
  await ctx.reply("Anonymized stats are not available until the first scheduled digest is recorded.");
});

composer.callbackQuery("owner:stats", async (ctx) => {
  if (!(await requireOwner(ctx as never))) return;
  await ctx.answerCallbackQuery();
  await ctx.reply("Anonymized stats are not available until the first scheduled digest is recorded.");
});
export default composer;

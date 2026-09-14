import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { adminChatId, requireOwner } from "../toolkit/index.js";
const composer = new Composer<Ctx>();

async function requestStats(ctx: Ctx) {
  if (!(await requireOwner(ctx as never))) return;
  const owner = adminChatId(ctx as never);
  if (!owner) { await ctx.reply("Owner access isn't set up yet."); return; }
  await ctx.reply("Anonymized stats are not available until the first scheduled digest is recorded.");
}

// Keep the blueprint's `/stats-request` spelling usable even though Telegram's
// command entity grammar normally accepts only letters, digits, and underscores.
composer.command("stats-request", requestStats);
composer.hears("/stats-request", requestStats);

composer.callbackQuery("owner:stats", async (ctx) => {
  if (!(await requireOwner(ctx as never))) return;
  await ctx.answerCallbackQuery();
  await ctx.reply("Anonymized stats are not available until the first scheduled digest is recorded.");
});
export default composer;

import type { Bot } from "grammy";
import { config } from "./config.ts";
import { fetchTonYields } from "./services/defillama.ts";
import { formatChannelMessage } from "./formatters/message.ts";
import { sendToChannel } from "./bot.ts";
import { markPosted, utcDate, wasPostedOn } from "./services/post_guard.ts";
import { pingHealthcheck } from "./services/healthcheck.ts";

export interface PostOptions {
  /** Post even if today's post already went out (a manual repost) */
  force?: boolean;
}

/** What a post run needs from the outside world; tests replace parts of it */
export interface PostDeps {
  fetchYields: typeof fetchTonYields;
  format: typeof formatChannelMessage;
  send: (message: string) => Promise<void>;
  wasPostedOn: typeof wasPostedOn;
  markPosted: typeof markPosted;
  ping: typeof pingHealthcheck;
  channel: string;
  /** UTC date of the run (YYYY-MM-DD) */
  today: string;
  /** Text that must never reach the watchdog (the bot token) */
  secret: string;
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Fetch yields and post them to the channel, at most once per UTC day.
 *
 * The watchdog hears "start" first, then "success" only after Telegram has
 * accepted the message (or when today's post already went out), or "fail"
 * with the reason. Returns "skipped" when nothing was sent because the day's
 * post was already out; throws when the post failed.
 */
export async function postDailyYields(
  bot: Bot,
  options: PostOptions = {},
  overrides: Partial<PostDeps> = {},
): Promise<"posted" | "skipped"> {
  const deps: PostDeps = {
    fetchYields: fetchTonYields,
    format: formatChannelMessage,
    send: (message) => sendToChannel(bot, message),
    wasPostedOn,
    markPosted,
    ping: pingHealthcheck,
    channel: config.telegramChannelId,
    today: utcDate(),
    secret: config.telegramBotToken,
    ...overrides,
  };
  console.log("Starting daily yields post...");
  await deps.ping("start");

  if (!options.force && await alreadyPosted(deps)) {
    console.log(`Today's post (${deps.today} UTC) already went out to this channel; nothing to do`);
    await deps.ping("success", "Already posted today; this run did nothing");
    return "skipped";
  }

  let total = 0;
  try {
    const yields = await deps.fetchYields();
    total = yields.TON.length + yields.STABLE.length + yields.BTC.length;
    if (total === 0) throw new Error("No yields found, nothing to post");
    const message = await deps.format(yields);
    await deps.send(message);
  } catch (error) {
    console.error("Failed to post daily yields:", error);
    let reason = errorText(error);
    if (deps.secret) reason = reason.replaceAll(deps.secret, "***");
    await deps.ping("fail", `The daily post failed: ${reason}`);
    throw error;
  }

  // The post is out. A marker that cannot be written only means a retry
  // later today may post again; it is not a failure of this run.
  try {
    await deps.markPosted(deps.channel, deps.today);
  } catch (error) {
    console.warn("Could not record today's post (a later run today may post again):", errorText(error));
  }
  console.log(`Daily yields posted successfully (${total} opportunities)`);
  await deps.ping("success", `Posted ${total} opportunities`);
  return "posted";
}

/** A guard that cannot be read lets the run post: a missed day is worse than a rare second post */
async function alreadyPosted(deps: PostDeps): Promise<boolean> {
  try {
    return await deps.wasPostedOn(deps.channel, deps.today);
  } catch (error) {
    console.warn("Could not check whether today's post already went out; posting:", errorText(error));
    return false;
  }
}

/**
 * Post now (GitHub Actions runs `deno task post`, which calls this)
 */
export async function triggerManualPost(bot: Bot, options: PostOptions = {}): Promise<void> {
  console.log(options.force ? "Post triggered (forced: today's earlier post is ignored)" : "Post triggered");
  await postDailyYields(bot, options);
}

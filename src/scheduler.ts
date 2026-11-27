import type { Bot } from "grammy";
import { config, type WeeklyCardMode } from "./config.ts";
import { fetchTonYields } from "./services/defillama.ts";
import { buildDigest, type Digest } from "./formatters/digest.ts";
import { describeSendError, sendCard, sendDigest } from "./bot.ts";
import { CARD_MIN_STAKING_ROWS, cardCaption, isCardDay, renderWeeklyCard, weeklyCardData } from "./card/weekly.ts";
import { markPosted, utcDate, wasPostedOn } from "./services/post_guard.ts";
import { loadPreviousSnapshot, savePostSnapshot } from "./services/post_snapshot.ts";
import { pingHealthcheck } from "./services/healthcheck.ts";

export interface PostOptions {
  /** Post even if today's post already went out (a manual repost) */
  force?: boolean;
}

/** What a post run needs from the outside world; tests replace parts of it */
export interface PostDeps {
  fetchYields: typeof fetchTonYields;
  /** The channel's previous post, for the "Since yesterday" block */
  loadPrevious: typeof loadPreviousSnapshot;
  format: typeof buildDigest;
  send: (digest: Digest) => Promise<void>;
  /** Remember what today's post showed (only after Telegram accepted it) */
  saveSnapshot: typeof savePostSnapshot;
  /** When the weekly card goes out */
  cardMode: WeeklyCardMode;
  /** Draw and send the weekly card; false when there was nothing to draw */
  sendCard: (digest: Digest, channel: string, today: string) => Promise<boolean>;
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
    loadPrevious: loadPreviousSnapshot,
    format: buildDigest,
    send: (digest) => sendDigest(bot, digest, config.postFormat),
    saveSnapshot: savePostSnapshot,
    cardMode: config.weeklyCard,
    sendCard: (digest, channel, today) => sendWeeklyCard(bot, digest, channel, today),
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
  let digest: Digest;
  try {
    const yields = await deps.fetchYields();
    total = yields.TON.length + yields.STABLE.length + yields.BTC.length;
    if (total === 0) throw new Error("No yields found, nothing to post");
    const previous = await previousPost(deps);
    digest = await deps.format(yields, { today: deps.today, previous });
    await deps.send(digest);
  } catch (error) {
    // The raw error can hold the request URL, and with it the bot token
    let reason = describeSendError(error, deps.secret);
    if (deps.secret) reason = reason.replaceAll(deps.secret, "***");
    console.error("Failed to post daily yields:", reason);
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
  try {
    await deps.saveSnapshot(deps.channel, digest.snapshot);
  } catch (error) {
    console.warn("Could not save what today's post showed (tomorrow's post will have no \"Since yesterday\" block):", errorText(error));
  }
  await weeklyCard(deps, digest);
  console.log(`Daily yields posted successfully (${total} opportunities)`);
  await deps.ping("success", `Posted ${total} opportunities`);
  return "posted";
}

/**
 * The weekly card, after the day's post: on Mondays (or after every post with
 * WEEKLY_CARD=always), at most once per day and channel. Nothing here can
 * fail the run: the daily post is already out.
 */
async function weeklyCard(deps: PostDeps, digest: Digest): Promise<void> {
  const due = deps.cardMode === "always" || (deps.cardMode === "monday" && isCardDay(deps.today));
  if (!due) return;
  try {
    if (await deps.wasPostedOn(deps.channel, deps.today, "card")) {
      console.log("Today's weekly card already went out to this channel");
      return;
    }
    if (await deps.sendCard(digest, deps.channel, deps.today)) {
      await deps.markPosted(deps.channel, deps.today, new Date(), "card");
    }
  } catch (error) {
    console.warn("The weekly card failed (the daily post is out):", describeSendError(error, deps.secret));
  }
}

/** Draw the weekly card from the day's data and send it; false when there is nothing to draw */
async function sendWeeklyCard(bot: Bot, digest: Digest, channel: string, today: string): Promise<boolean> {
  const card = weeklyCardData(digest.data, today, channel);
  if (!card) {
    console.warn(`No weekly card: fewer than ${CARD_MIN_STAKING_ROWS} liquid staking rows have a 7-day APY measured on-chain today`);
    return false;
  }
  await sendCard(bot, await renderWeeklyCard(card), cardCaption(card), channel);
  return true;
}

/** The previous post, or null when there is none or it cannot be read (no "Since yesterday" block then) */
async function previousPost(deps: PostDeps) {
  try {
    return await deps.loadPrevious(deps.channel, deps.today);
  } catch (error) {
    console.warn("Could not read the previous post; posting without \"Since yesterday\":", errorText(error));
    return null;
  }
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

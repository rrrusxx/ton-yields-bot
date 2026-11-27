import { Bot, GrammyError, HttpError, InputFile } from "grammy";
import { config, type PostFormat } from "./config.ts";
import { CARD_SHARE_TEXT, postButtons, publicPostUrl, SHARE_TEXT } from "./formatters/post_buttons.ts";

/**
 * An API error as one line without the bot token. A network failure (grammY's
 * HttpError) wraps the fetch error, whose text holds the request URL, and
 * that URL holds the token: https://api.telegram.org/bot<TOKEN>/sendMessage.
 */
export function describeSendError(error: unknown, token: string = config.telegramBotToken): string {
  let text = error instanceof Error ? error.message : String(error);
  if (error instanceof HttpError && error.error instanceof Error) text += ` (${error.error.message})`;
  if (token) text = text.replaceAll(token, "***");
  return text.replace(/\/bot[^/\s)]+\//g, "/bot***/");
}

/**
 * Create and configure the Telegram bot instance
 */
export function createBot(): Bot {
  const bot = new Bot(config.telegramBotToken);
  
  // Handle /start command
  bot.command("start", (ctx) => {
    ctx.reply(
      "👋 Welcome to TON Yields Bot!\n\n" +
      "I aggregate yield opportunities from TON blockchain protocols and post daily updates.\n\n" +
      "Commands:\n" +
      "/yields - Get current yields\n" +
      "/help - Show this message"
    );
  });
  
  // Handle /help command
  bot.command("help", (ctx) => {
    ctx.reply(
      "📊 <b>TON Yields Bot Help</b>\n\n" +
      "This bot tracks yield opportunities across TON blockchain:\n\n" +
      "• 💎 TON assets (stTON, tsTON, etc.)\n" +
      "• 💵 Stablecoins (USDT, USDC, etc.)\n" +
      "• ₿ Bitcoin (cbBTC)\n\n" +
      "Data is sourced from DefiLlama and updated daily.\n\n" +
      "Commands:\n" +
      "/yields - Get current yields snapshot\n" +
      "/help - Show this help message",
      { parse_mode: "HTML" }
    );
  });
  
  // Handle errors
  bot.catch((err) => {
    console.error("Bot error:", err);
  });
  
  return bot;
}

/**
 * Send a message to the configured channel. With `buttons` (the daily post),
 * it goes out with "How we calculate" (when the channel has a pinned post),
 * and "Share" is added right after, once the post's own link is known.
 *
 * Only a failed send throws. Everything after it (adding the Share button)
 * just logs a warning: the post is out, and an error there must not make the
 * run look failed, which would leave today's marker unwritten and let a retry
 * post a second time.
 */
export async function sendToChannel(bot: Bot, message: string, options: { buttons?: boolean } = {}): Promise<void> {
  const channel = config.telegramChannelId;
  const pinnedUrl = options.buttons ? await pinnedPostUrl(bot, channel) : null;
  const firstButtons = postButtons(null, pinnedUrl);
  let messageId: number;
  try {
    const sent = await bot.api.sendMessage(channel, message, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      ...(firstButtons.length > 0 && { reply_markup: { inline_keyboard: firstButtons } }),
    });
    messageId = sent.message_id;
    console.log("Message sent to channel successfully");
  } catch (error) {
    console.error("Failed to send message to channel:", describeSendError(error));
    throw error;
  }
  if (!options.buttons) return;
  await addShareButton(bot, channel, messageId, pinnedUrl);
}

/**
 * Send the daily post in the configured format, with the same buttons as
 * sendToChannel. A rich message that Telegram refuses outright (error 400,
 * so nothing was posted) is replaced by the classic post; any other error
 * (a timeout, a server error) is thrown, because the rich message may have
 * gone out and a second post must not follow it.
 */
export async function sendDigest(
  bot: Bot,
  digest: { html: string; richHtml: string },
  format: PostFormat,
  channel: string = config.telegramChannelId,
): Promise<void> {
  const pinnedUrl = await pinnedPostUrl(bot, channel);
  const firstButtons = postButtons(null, pinnedUrl);
  const extra = firstButtons.length > 0 ? { reply_markup: { inline_keyboard: firstButtons } } : {};
  const sendClassic = async () =>
    (await bot.api.sendMessage(channel, digest.html, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      ...extra,
    })).message_id;

  let messageId: number;
  try {
    if (format === "rich") {
      try {
        messageId = (await bot.api.sendRichMessage(channel, { html: digest.richHtml, skip_entity_detection: true }, extra)).message_id;
        console.log("Rich message sent to channel successfully");
      } catch (error) {
        if (!(error instanceof GrammyError && error.error_code === 400)) throw error;
        console.warn(`Telegram refused the rich message (${error.description}); sending the classic post instead`);
        messageId = await sendClassic();
        console.log("Message sent to channel successfully");
      }
    } else {
      messageId = await sendClassic();
      console.log("Message sent to channel successfully");
    }
  } catch (error) {
    console.error("Failed to send message to channel:", describeSendError(error));
    throw error;
  }
  await addShareButton(bot, channel, messageId, pinnedUrl);
}

/**
 * Send the weekly card: a photo post without a notification sound (it comes
 * seconds after the daily post), then its Share button. Only a failed send
 * throws.
 */
export async function sendCard(bot: Bot, png: Uint8Array, caption: string, channel: string = config.telegramChannelId): Promise<void> {
  const sent = await bot.api.sendPhoto(channel, new InputFile(png, "ton-yields-week.png"), { caption, disable_notification: true });
  const largest = sent.photo?.at(-1);
  console.log(`Weekly card sent to channel successfully${largest ? ` (${largest.width}x${largest.height})` : ""}`);
  await addShareButton(bot, channel, sent.message_id, null, CARD_SHARE_TEXT);
}

/**
 * Add "Share" next to "How we calculate" once the post's own link is known.
 * Never throws: the post is already out.
 */
async function addShareButton(
  bot: Bot,
  channel: string,
  messageId: number,
  pinnedUrl: string | null,
  shareText: string = SHARE_TEXT,
): Promise<void> {
  const postUrl = publicPostUrl(channel, messageId);
  if (!postUrl) {
    console.warn("No Share button: the channel id is not a public @username");
    return;
  }
  try {
    await bot.api.editMessageReplyMarkup(channel, messageId, {
      reply_markup: { inline_keyboard: postButtons(postUrl, pinnedUrl, shareText) },
    }, AbortSignal.timeout(15_000));
  } catch (error) {
    console.warn("Could not add the Share button (the post is out without it):", describeSendError(error));
  }
}

/**
 * Link of the channel's pinned post, or null when there is none or it cannot
 * be read (the post then goes out without "How we calculate").
 */
async function pinnedPostUrl(bot: Bot, channel: string): Promise<string | null> {
  try {
    const chat = await bot.api.getChat(channel, AbortSignal.timeout(15_000)) as { pinned_message?: { message_id?: number } };
    const id = chat.pinned_message?.message_id;
    return id ? publicPostUrl(channel, id) : null;
  } catch (error) {
    console.warn("Could not read the channel's pinned post:", error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Get the bot instance (singleton)
 */
let botInstance: Bot | null = null;

export function getBot(): Bot {
  if (!botInstance) {
    botInstance = createBot();
  }
  return botInstance;
}

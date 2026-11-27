import { Bot, GrammyError, HttpError, InputFile } from "grammy";
import { config, type PostFormat } from "./config.ts";
import { postButtons, publicPostUrl } from "./formatters/post_buttons.ts";

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
 * Send a plain message to the configured channel (the --test message). Only a
 * failed send throws.
 */
export async function sendToChannel(bot: Bot, message: string): Promise<void> {
  const channel = config.telegramChannelId;
  try {
    await bot.api.sendMessage(channel, message, { parse_mode: "HTML", link_preview_options: { is_disabled: true } });
    console.log("Message sent to channel successfully");
  } catch (error) {
    console.error("Failed to send message to channel:", describeSendError(error));
    throw error;
  }
}

/**
 * Send the daily post in the configured format, with "How we calculate" when
 * the channel has a pinned post. (The v1.7.0 "Share" button is gone since
 * v1.8.1, owner's choice: Forward does the same, and for a rich post it
 * carries the post itself, while a shared link previews as flattened text.)
 * A rich message that Telegram refuses outright (error 400, so nothing was
 * posted) is replaced by the classic post; any other error (a timeout, a
 * server error) is thrown, because the rich message may have gone out and a
 * second post must not follow it.
 */
export async function sendDigest(
  bot: Bot,
  digest: { html: string; richHtml: string },
  format: PostFormat,
  channel: string = config.telegramChannelId,
): Promise<void> {
  const buttons = postButtons(await pinnedPostUrl(bot, channel));
  const extra = buttons.length > 0 ? { reply_markup: { inline_keyboard: buttons } } : {};
  const sendClassic = () =>
    bot.api.sendMessage(channel, digest.html, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      ...extra,
    });

  try {
    if (format === "rich") {
      try {
        await bot.api.sendRichMessage(channel, { html: digest.richHtml, skip_entity_detection: true }, extra);
        console.log("Rich message sent to channel successfully");
      } catch (error) {
        if (!(error instanceof GrammyError && error.error_code === 400)) throw error;
        console.warn(`Telegram refused the rich message (${error.description}); sending the classic post instead`);
        await sendClassic();
        console.log("Message sent to channel successfully");
      }
    } else {
      await sendClassic();
      console.log("Message sent to channel successfully");
    }
  } catch (error) {
    console.error("Failed to send message to channel:", describeSendError(error));
    throw error;
  }
}

/**
 * Send the weekly card: a photo post without a notification sound (it comes
 * seconds after the daily post). Only a failed send throws.
 */
export async function sendCard(bot: Bot, png: Uint8Array, caption: string, channel: string = config.telegramChannelId): Promise<void> {
  const sent = await bot.api.sendPhoto(channel, new InputFile(png, "ton-yields-week.png"), { caption, disable_notification: true });
  const largest = sent.photo?.at(-1);
  console.log(`Weekly card sent to channel successfully${largest ? ` (${largest.width}x${largest.height})` : ""}`);
}

/**
 * Link of the channel's pinned post, or null when there is none or it cannot
 * be read (the post then goes out without "How we calculate").
 */
async function pinnedPostUrl(bot: Bot, channel: string): Promise<string | null> {
  try {
    const chat = await bot.api.getChat(channel, AbortSignal.timeout(15_000)) as { pinned_message?: { message_id?: number } };
    const id = chat.pinned_message?.message_id;
    if (!id) return null;
    const url = publicPostUrl(channel, id);
    if (!url) console.warn("No How-we-calculate button: the channel id is not a public @username");
    return url;
  } catch (error) {
    console.warn("Could not read the channel's pinned post:", describeSendError(error));
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

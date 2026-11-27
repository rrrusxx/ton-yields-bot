import { Bot } from "grammy";
import { config } from "./config.ts";
import { postButtons, publicPostUrl } from "./formatters/post_buttons.ts";

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
    console.error("Failed to send message to channel:", error);
    throw error;
  }
  if (!options.buttons) return;

  const postUrl = publicPostUrl(channel, messageId);
  if (!postUrl) {
    console.warn("No Share button: the channel id is not a public @username");
    return;
  }
  try {
    await bot.api.editMessageReplyMarkup(channel, messageId, {
      reply_markup: { inline_keyboard: postButtons(postUrl, pinnedUrl) },
    }, AbortSignal.timeout(15_000));
  } catch (error) {
    console.warn("Could not add the Share button (the post is out without it):", error instanceof Error ? error.message : error);
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

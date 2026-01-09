import { Bot } from "grammy";
import { config } from "./config.ts";

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
 * Send a message to the configured channel
 */
export async function sendToChannel(bot: Bot, message: string): Promise<void> {
  try {
    await bot.api.sendMessage(config.telegramChannelId, message, {
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
    console.log("Message sent to channel successfully");
  } catch (error) {
    console.error("Failed to send message to channel:", error);
    throw error;
  }
}

/**
 * Get the bot instance (singleton pattern for Deno Deploy)
 */
let botInstance: Bot | null = null;

export function getBot(): Bot {
  if (!botInstance) {
    botInstance = createBot();
  }
  return botInstance;
}

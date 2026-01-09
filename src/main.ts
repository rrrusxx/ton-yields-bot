import { config, validateConfig } from "./config.ts";
import { createBot, sendToChannel } from "./bot.ts";
import { setupDailyCron, triggerManualPost } from "./scheduler.ts";
import { fetchTonYields } from "./services/defillama.ts";
import { formatChannelMessage, formatTestMessage } from "./formatters/message.ts";

/**
 * Main entry point for the TON Yields Bot
 */
async function main(): Promise<void> {
  console.log("🚀 Starting TON Yields Bot...");
  
  // Check if we're in test mode (no env vars)
  const isTestMode = !Deno.env.get("TELEGRAM_BOT_TOKEN");
  
  if (isTestMode) {
    console.log("\n⚠️  Running in TEST MODE (no Telegram credentials)\n");
    await runTestMode();
    return;
  }
  
  // Validate configuration
  try {
    validateConfig();
  } catch (error) {
    console.error("Configuration error:", error);
    Deno.exit(1);
  }
  
  console.log(`Channel: ${config.telegramChannelId}`);
  
  // Create bot instance
  const bot = createBot();
  
  // Check for command line arguments
  const args = Deno.args;
  
  if (args.includes("--post-now")) {
    // Immediate post mode
    console.log("Posting yields now...");
    await triggerManualPost(bot);
    console.log("Done!");
    return;
  }
  
  if (args.includes("--test")) {
    // Send test message
    console.log("Sending test message...");
    await sendToChannel(bot, formatTestMessage());
    console.log("Test message sent!");
    return;
  }
  
  // Setup daily cron job
  setupDailyCron(bot);
  
  // Start the bot (for handling commands)
  console.log("Bot is running and listening for commands...");
  
  // Add /yields command handler
  bot.command("yields", async (ctx) => {
    try {
      ctx.reply("⏳ Fetching current yields...");
      const yields = await fetchTonYields();
      const message = formatChannelMessage(yields);
      await ctx.reply(message, { 
        parse_mode: "HTML",
        disable_web_page_preview: true 
      });
    } catch (error) {
      console.error("Error fetching yields:", error);
      ctx.reply("❌ Failed to fetch yields. Please try again later.");
    }
  });
  
  // Start bot with long polling
  bot.start();
}

/**
 * Test mode - fetch and display yields without Telegram
 */
async function runTestMode(): Promise<void> {
  console.log("Fetching TON yields from DefiLlama + Merkl (TAC)...\n");
  
  try {
    const yields = await fetchTonYields();
    
    console.log("=== RAW DATA ===\n");
    
    if (yields.TON.length > 0) {
      console.log("TON Assets:");
      yields.TON.slice(0, 5).forEach(y => {
        console.log(`  - ${y.source} ${y.asset}: ${y.apyTotal.toFixed(2)}% (TVL: $${(y.tvlUsd/1e6).toFixed(2)}M)`);
      });
      console.log();
    }
    
    if (yields.STABLE.length > 0) {
      console.log("Stablecoins:");
      yields.STABLE.slice(0, 5).forEach(y => {
        console.log(`  - ${y.source} ${y.asset}: ${y.apyTotal.toFixed(2)}% (TVL: $${(y.tvlUsd/1e6).toFixed(2)}M)`);
      });
      console.log();
    }
    
    if (yields.BTC.length > 0) {
      console.log("Bitcoin:");
      yields.BTC.slice(0, 5).forEach(y => {
        console.log(`  - ${y.source} ${y.asset}: ${y.apyTotal.toFixed(2)}% (TVL: $${(y.tvlUsd/1e6).toFixed(2)}M)`);
      });
      console.log();
    }
    
    console.log("\n=== FORMATTED MESSAGE ===\n");
    const message = formatChannelMessage(yields);
    // Strip HTML tags for console output
    const plainMessage = message
      .replace(/<[^>]*>/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
    console.log(plainMessage);
    
  } catch (error) {
    console.error("Error:", error);
  }
}

// Run the bot
main();

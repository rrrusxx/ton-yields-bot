import { config, validateConfig } from "./config.ts";
import { createBot, sendToChannel } from "./bot.ts";
import { postDailyYields, triggerManualPost } from "./scheduler.ts";
import { fetchTonYields } from "./services/defillama.ts";
import { formatChannelMessage, formatTestMessage } from "./formatters/message.ts";


// ---------------------------------------------------------------------------
// TOP-LEVEL cron registration — Deno Deploy requires Deno.cron at top level,
// not inside any function. The bot is created lazily inside the callback so
// env vars are guaranteed to be available at runtime.
// ---------------------------------------------------------------------------
Deno.cron("daily-yield-post", "0 9 * * *", async () => {
  console.log("Cron job triggered: daily-yield-post");
  try {
    validateConfig();
    const bot = createBot();
    await postDailyYields(bot);
  } catch (error) {
    console.error("Cron job failed:", error);
  }
});

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
  
  // This is a pure broadcast bot — it only sends to a channel via cron.
  // Long polling is incompatible with Deno Deploy (serverless, multiple isolates)
  // and would cause 409 Conflict errors from Telegram. Nothing to do here.
  console.log("Bot is ready. Waiting for cron trigger at 9:00 UTC...");
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
    const message = await formatChannelMessage(yields);
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

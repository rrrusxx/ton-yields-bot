import { config, validateConfig } from "./config.ts";
import { createBot, sendToChannel } from "./bot.ts";
import { triggerManualPost } from "./scheduler.ts";
import { fetchTonYields } from "./services/defillama.ts";
import { formatChannelMessage, formatTestMessage } from "./formatters/message.ts";

// Scheduling lives outside the code: the GitHub Actions workflow
// (.github/workflows/daily-post.yml) runs `deno task post` once a day.
// The top-level Deno.cron left over from Deno Deploy was removed on
// 2026-11-20; it had caused duplicate posts.

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
    // Exit explicitly so one-shot runs (GitHub Actions) never wait on
    // leftover handles after posting.
    Deno.exit(0);
  }
  
  if (args.includes("--test")) {
    // Send test message
    console.log("Sending test message...");
    await sendToChannel(bot, formatTestMessage());
    console.log("Test message sent!");
    Deno.exit(0);
  }
  
  // This is a pure broadcast bot: it only posts when asked to.
  console.log("Nothing to do. Use --post-now to publish the digest or --test to send a test message.");
}

/**
 * Test mode - fetch and display yields without Telegram
 */
async function runTestMode(): Promise<void> {
  console.log("Fetching TON yields (DefiLlama, Swap.coffee, Ethena, GTC, Palette)...\n");
  
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

import type { Bot } from "grammy";
import { fetchTonYields } from "./services/defillama.ts";
import { formatChannelMessage } from "./formatters/message.ts";
import { sendToChannel } from "./bot.ts";

/**
 * Fetch yields and post to channel
 */
export async function postDailyYields(bot: Bot): Promise<void> {
  console.log("Starting daily yields post...");
  
  try {
    // Fetch yields from DefiLlama
    const yields = await fetchTonYields();
    
    // Check if we have any data
    const totalYields = yields.TON.length + yields.STABLE.length + yields.BTC.length;
    if (totalYields === 0) {
      console.log("No yields found, skipping post");
      return;
    }
    
    // Format the message
    const message = await formatChannelMessage(yields);
    
    // Send to channel
    await sendToChannel(bot, message);
    
    console.log(`Daily yields posted successfully (${totalYields} opportunities)`);
  } catch (error) {
    console.error("Failed to post daily yields:", error);
    throw error;
  }
}

/**
 * Setup the daily cron job
 * Runs at 9:00 AM UTC every day
 */
export function setupDailyCron(bot: Bot): void {
  // Deno.cron syntax: "minute hour day month weekday"
  // "0 9 * * *" = At 09:00 UTC every day
  Deno.cron("daily-yield-post", "0 9 * * *", async () => {
    console.log("Cron job triggered: daily-yield-post");
    await postDailyYields(bot);
  });
  
  console.log("Daily cron job scheduled for 9:00 UTC");
}

/**
 * Manually trigger a yields post (for testing)
 */
export async function triggerManualPost(bot: Bot): Promise<void> {
  console.log("Manual post triggered");
  await postDailyYields(bot);
}

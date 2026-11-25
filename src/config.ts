/**
 * Application configuration
 * Loads environment variables from .env file and provides defaults
 */

import { load } from "std/dotenv/mod.ts";

// Load .env file (if it exists). .env.example is documentation only: with
// std's default it would be enforced as a list of required keys, and one
// optional key missing from .env (TONCENTER_API_KEY) silently dropped the
// whole file, including the bot token.
try {
  const envVars = await load({ allowEmptyValues: true, examplePath: null, defaultsPath: null });
  // Set loaded variables into Deno.env
  for (const [key, value] of Object.entries(envVars)) {
    if (!Deno.env.get(key)) {
      Deno.env.set(key, value);
    }
  }
} catch {
  // .env file doesn't exist or couldn't be loaded - that's okay
  // We'll use system environment variables instead
}

// Load from environment (now includes .env values)
const env = {
  TELEGRAM_BOT_TOKEN: Deno.env.get("TELEGRAM_BOT_TOKEN"),
  TELEGRAM_CHANNEL_ID: Deno.env.get("TELEGRAM_CHANNEL_ID"),
};

/**
 * Validates that all required environment variables are set
 */
export function validateConfig(): void {
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN environment variable is required");
  }
  if (!env.TELEGRAM_CHANNEL_ID) {
    throw new Error("TELEGRAM_CHANNEL_ID environment variable is required");
  }
}

/**
 * Application configuration object
 */
export const config = {
  /** Telegram bot token from BotFather */
  telegramBotToken: env.TELEGRAM_BOT_TOKEN ?? "",
  
  /** Telegram channel ID or username */
  telegramChannelId: env.TELEGRAM_CHANNEL_ID ?? "",
  
  /** DefiLlama API endpoint for yields */
  defiLlamaApiUrl: "https://yields.llama.fi/pools",

  /**
   * How long to wait for a DefiLlama response (yields, protocols, the
   * tsUSDe listing). Its cache is slow when cold: on 2026-11-24 the 10 MB
   * yields file took 56 s and the protocols list 14 s, against limits of
   * 20 s and 15 s, and the yields file is required for the post.
   */
  defiLlamaTimeoutMs: 90_000,

  /** Chain to filter (TON blockchain) */
  chain: "TON",
  
  /** Minimum TVL to include DefiLlama and DeDust pools in results (filter out dust) */
  minTvlUsd: 10000,

  /**
   * TOP-5 eligibility. Rows below this TVL stay in their section with the
   * ⚠️ low-TVL flag but never enter the TOP-5 (owner's choice, Nov 2026).
   */
  top5MinTvlUsd: 10_000,

  /** TOP-5 eligibility: an APY above this (in %) is treated as a data glitch */
  top5MaxApy: 100,
} as const;

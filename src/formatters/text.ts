/**
 * Small text helpers shared by the classic post (message.ts), the rich
 * message (rich_message.ts) and the "Since yesterday" block
 * (since_yesterday.ts).
 */

/**
 * Escape text for Telegram HTML (both the classic parse mode and Rich HTML).
 * Pool, vault and protocol names come from third-party APIs, so every dynamic
 * string goes through this: a single "<" or "&" would otherwise make Telegram
 * reject the whole post, and markup inside a name could inject a link. Also
 * safe for href values.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Longest third-party string shown in the post, in characters */
const MAX_DISPLAY_LENGTH = 64;

/**
 * Prepare a third-party string for one line of the post: replace C0 and C1
 * control characters (including NEL) and line or paragraph separators with
 * spaces (a line break in a name could fake extra rows), drop text-direction
 * controls and zero-width spaces (they could visually reorder the APY and TVL
 * of a row), collapse whitespace, repair lone surrogates and shorten very long
 * values with "…" (one huge name could push the post past Telegram's
 * 4,096-character limit). Escape the result with escapeHtml.
 */
export function displayText(text: string): string {
  const oneLine = String(text)
    .toWellFormed()
    .replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g, " ")
    .replace(/[\u061C\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const chars = Array.from(oneLine);
  return chars.length > MAX_DISPLAY_LENGTH
    ? `${chars.slice(0, MAX_DISPLAY_LENGTH - 1).join("")}…`
    : oneLine;
}

/** displayText, then escapeHtml: the way to put third-party text in the post */
export function safeText(text: string): string {
  return escapeHtml(displayText(text));
}

/** Rank emojis for the TOP-5 */
export function getRankEmoji(rank: number): string {
  return ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"][rank - 1] ?? `${rank}.`;
}

/**
 * APY direction indicator vs 7-day average.
 * Uses a threshold of 5% relative or 0.3% absolute (whichever is larger)
 * to avoid noise on very low or very high APY pools.
 */
export function getApyDirection(current: number, avg7d: number): string {
  const threshold = Math.max(0.3, avg7d * 0.05);
  if (current > avg7d + threshold) return " ↑";
  if (current < avg7d - threshold) return " ↓";
  return "";
}

/** Opportunities below this TVL get a low-liquidity warning marker */
export const LOW_TVL_THRESHOLD = 10_000;

/** Returns a warning marker for low-TVL (low-liquidity) opportunities */
export function lowTvlWarning(tvlUsd: number): string {
  return tvlUsd < LOW_TVL_THRESHOLD ? " ⚠️" : "";
}

/**
 * Format TVL in human-readable format
 * e.g., 1500000 -> "$1.5M"
 */
export function formatTvl(tvlUsd: number): string {
  if (tvlUsd >= 1_000_000_000) {
    return `$${(tvlUsd / 1_000_000_000).toFixed(1)}B`;
  }
  if (tvlUsd >= 1_000_000) {
    return `$${(tvlUsd / 1_000_000).toFixed(1)}M`;
  }
  if (tvlUsd >= 1_000) {
    return `$${(tvlUsd / 1_000).toFixed(1)}K`;
  }
  return `$${tvlUsd.toFixed(0)}`;
}

/** "Nov 27, 2026" for a UTC moment */
export function formatDateUTC(now: Date): string {
  return now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** "Nov 25" for a UTC date (YYYY-MM-DD) */
export function formatShortDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

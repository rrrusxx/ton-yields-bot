import type { GroupedYields, OrganizedYields, ProtocolGroup, YieldOpportunity } from "../types/yields.ts";
import { getTopYields } from "../services/defillama.ts";
import { displayTicker, isHackedProtocol } from "../services/protocols.ts";
import { fetchTonTVL, formatTVL } from "../services/tvl.ts";
import { saveTvlSnapshot, calculateTvlChange, formatTvlChange } from "../services/tvl_history.ts";
import { saveAllApySnapshots, calculateAll7DayAverages } from "../services/apy_history.ts";

const SEPARATOR = "──────────────────────";

/**
 * Escape text for Telegram HTML parse mode. Pool, vault and protocol names
 * come from third-party APIs, so every dynamic string goes through this:
 * a single "<" or "&" would otherwise make Telegram reject the whole post,
 * and markup inside a name could inject a link. Also safe for href values.
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
function safeText(text: string): string {
  return escapeHtml(displayText(text));
}

/**
 * Rank emojis for TOP 5
 */
function getRankEmoji(rank: number): string {
  return ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"][rank - 1] ?? `${rank}.`;
}

/**
 * APY direction indicator vs 7-day average.
 * Uses a threshold of 5% relative or 0.3% absolute (whichever is larger)
 * to avoid noise on very low or very high APY pools.
 */
function getApyDirection(current: number, avg7d: number): string {
  const threshold = Math.max(0.3, avg7d * 0.05);
  if (current > avg7d + threshold) return " ↑";
  if (current < avg7d - threshold) return " ↓";
  return "";
}

/**
 * Opportunities below this TVL get a low-liquidity warning marker.
 */
const LOW_TVL_THRESHOLD = 10_000;

/**
 * Returns a warning marker for low-TVL (low-liquidity) opportunities.
 */
function lowTvlWarning(tvlUsd: number): string {
  return tvlUsd < LOW_TVL_THRESHOLD ? " ⚠️" : "";
}

/**
 * The " | $1.2M" part of a row, or nothing when the TVL must not be shown:
 * unknown TVL (tvlHidden) or a hacked protocol, whose reported TVL is frozen.
 */
function formatTvlPart(yield_: YieldOpportunity): string {
  if (yield_.tvlHidden || isHackedProtocol(yield_.source)) {
    return "";
  }
  return ` | ${formatTvl(yield_.tvlUsd)}${lowTvlWarning(yield_.tvlUsd)}`;
}

function formatUtilization(utilizationPct?: number): string {
  if (utilizationPct === undefined) {
    return "";
  }
  const fire = utilizationPct > 95 ? " 🔥" : "";
  return ` | UR ${utilizationPct.toFixed(1)}%${fire}`;
}

/**
 * Format TVL in human-readable format
 * e.g., 1500000 -> "$1.5M"
 */
function formatTvl(tvlUsd: number): string {
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

/**
 * Format APY percentage with optional 7-day average and direction indicator.
 * e.g., 4.234 -> "4.2%"
 * e.g., 4.234 with avg 4.8 -> "4.2% ↓ (7d: 4.8%)"
 */
function formatApy(apy: number, avg7d?: number | null): string {
  const current = apy.toFixed(1);
  
  if (avg7d !== null && avg7d !== undefined) {
    const direction = getApyDirection(apy, avg7d);
    const average = avg7d.toFixed(1);
    return `${current}%${direction} (7d: ${average}%)`;
  }
  
  return `${current}%`;
}

/**
 * Format asset name with optional label, tickers in their usual spelling
 * ("TSUSDE" from DefiLlama reads "tsUSDe")
 */
function formatAssetWithLabel(asset: string, label: string | null): string {
  if (label && label.length > 0) {
    return `${safeText(displayTicker(asset))} (${safeText(displayTicker(label))})`;
  }
  return safeText(displayTicker(asset));
}

/**
 * The APY part of a row: an estimate is marked "est." and has no 7-day
 * value; a custom note replaces the 7-day value; base plus reward when the
 * reward matters; otherwise the APY with its 7-day value and direction.
 */
function formatRowApy(yield_: YieldOpportunity, avg7d?: number | null): string {
  if (yield_.apyEstimate) {
    return `${yield_.apyTotal.toFixed(1)}% est.`;
  }
  if (yield_.apyNote) {
    // Hardcoded/custom APY with a descriptive note instead of 7d average
    return `${yield_.apyTotal.toFixed(2)}% (${safeText(yield_.apyNote)})`;
  }
  if (yield_.apyReward && yield_.apyReward > 0.1) {
    // For pools with rewards, show base + reward, then direction + 7d average of total
    const baseReward = `${formatApy(yield_.apyBase)} (+${formatApy(yield_.apyReward)})`;
    if (avg7d !== null && avg7d !== undefined) {
      const direction = getApyDirection(yield_.apyTotal, avg7d);
      const average = avg7d.toFixed(1);
      return `${baseReward}${direction} 7d: ${average}%`;
    }
    return baseReward;
  }
  // Regular APY with 7-day average and direction indicator
  return formatApy(yield_.apyTotal, avg7d);
}

/**
 * Format a single yield opportunity line (within a protocol group)
 */
function formatYieldLine(
  yield_: YieldOpportunity,
  isLast: boolean,
  label?: string | null,
  avg7d?: number | null
): string {
  const prefix = isLast ? "└" : "├";

  // Format asset with label
  const assetText = formatAssetWithLabel(yield_.asset, label ?? yield_.poolMeta);

  // TVL (with low-liquidity warning), omitted when unknown or untrustworthy
  return `${prefix} ${assetText}: ${formatRowApy(yield_, avg7d)}${formatUtilization(yield_.utilizationPct)}${formatTvlPart(yield_)}`;
}

/**
 * Format protocol name with optional hyperlink
 */
function formatProtocolLink(name: string, url: string): string {
  if (url && url.length > 0) {
    return `<a href="${escapeHtml(url)}">${safeText(name)}</a>`;
  }
  return safeText(name);
}

/**
 * Add auto-generated labels for duplicate assets without poolMeta
 */
function addLabelsForDuplicates(yields: YieldOpportunity[]): Map<YieldOpportunity, string | null> {
  const labels = new Map<YieldOpportunity, string | null>();
  const assetCounts = new Map<string, number>();
  const assetIndices = new Map<string, number>();
  
  // First pass: count occurrences of each asset
  for (const y of yields) {
    const count = assetCounts.get(y.asset) || 0;
    assetCounts.set(y.asset, count + 1);
  }
  
  // Second pass: assign labels
  for (const y of yields) {
    const count = assetCounts.get(y.asset) || 0;
    
    if (count > 1) {
      // Multiple entries for this asset - need labels
      if (y.poolMeta) {
        // Use existing poolMeta
        labels.set(y, y.poolMeta);
      } else {
        // Generate numbered label
        const currentIndex = (assetIndices.get(y.asset) || 0) + 1;
        assetIndices.set(y.asset, currentIndex);
        labels.set(y, `#${currentIndex}`);
      }
    } else {
      // Single entry - use poolMeta if exists, otherwise null
      labels.set(y, y.poolMeta);
    }
  }
  
  return labels;
}

/**
 * Format a protocol group with all its yields
 * @param maxYields - Optional limit on how many yields to show (by TVL)
 */
function formatProtocolGroup(group: ProtocolGroup, averages: Map<YieldOpportunity, number>, maxYields?: number): string {
  const lines: string[] = [];
  
  // Protocol name as header with hyperlink; a hacked protocol gets a risk flag
  const protocolLink = formatProtocolLink(group.protocol, group.protocolUrl);
  const hackedFlag = isHackedProtocol(group.protocol) ? " 🚨 Hacked" : "";
  lines.push(`<b>${protocolLink}${hackedFlag}</b>`);
  
  // Apply optional limit (yields are already sorted by TVL)
  const yields = maxYields ? group.yields.slice(0, maxYields) : group.yields;
  
  // Generate labels for duplicates
  const labels = addLabelsForDuplicates(yields);
  
  // Add each yield line
  yields.forEach((y, index) => {
    const label = labels.get(y);
    const avg7d = y.onChain ? (y.apy7d ?? null) : (y.apy7d ?? (averages.get(y) || null));
    lines.push(formatYieldLine(y, index === yields.length - 1, label, avg7d));
  });
  
  return lines.join("\n");
}

/**
 * Format a category section (TON, STABLE, BTC, ETH, etc.)
 * @param protocolLimits - Optional map of protocol name -> max yields to show
 */
export function formatCategorySection(
  title: string,
  protocolGroups: ProtocolGroup[],
  averages: Map<YieldOpportunity, number>,
  protocolLimits?: Map<string, number>
): string {
  if (protocolGroups.length === 0) {
    return "";
  }
  
  const result: string[] = [];

  // Section header - always visible (outside blockquote)
  result.push(SEPARATOR);
  result.push(`<b>${title}</b>`);

  // Protocol content wrapped in expandable blockquote
  const contentLines: string[] = [];
  protocolGroups.forEach((group, index) => {
    const limit = protocolLimits?.get(group.protocol);
    contentLines.push(formatProtocolGroup(group, averages, limit));
    if (index < protocolGroups.length - 1) {
      contentLines.push(""); // Spacing between protocols
    }
  });

  result.push(`<blockquote expandable>${contentLines.join("\n")}</blockquote>`);

  return result.join("\n");
}

/**
 * Format Top 5 yields section
 */
export function formatTopYieldsSection(yields: YieldOpportunity[], averages: Map<YieldOpportunity, number>): string {
  if (yields.length === 0) {
    return "";
  }
  
  const result: string[] = [];

  // Section header - always visible
  result.push(SEPARATOR);
  result.push("<b>🏆 TOP 5 YIELD OPPORTUNITIES</b>");

  // Top 5 entries in an expandable blockquote
  const contentLines: string[] = [];

  yields.forEach((y) => {
    const rankEmoji = getRankEmoji(contentLines.length + 1);

    // Format asset with label if available
    const assetText = formatAssetWithLabel(y.asset, y.poolMeta);

    // Format APY with 7-day average and direction (a measured 7d value wins)
    const avg7d = y.onChain ? (y.apy7d ?? null) : (y.apy7d ?? (averages.get(y) || null));
    const apyText = formatRowApy(y, avg7d);

    const protocolLink = formatProtocolLink(y.source, y.sourceUrl);
    contentLines.push(`${rankEmoji} ${protocolLink} ${assetText}: ${apyText}${formatUtilization(y.utilizationPct)}${formatTvlPart(y)}`);
  });

  result.push(`<blockquote expandable>${contentLines.join("\n")}</blockquote>`);

  return result.join("\n");
}

/**
 * Get current UTC date formatted
 */
function getCurrentDateUTC(): string {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  };
  return now.toLocaleDateString("en-US", options);
}

/**
 * Get current UTC time formatted
 */
function getCurrentTimeUTC(now: Date = new Date()): string {
  const hours = now.getUTCHours().toString().padStart(2, "0");
  const minutes = now.getUTCMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes} UTC`;
}

/**
 * The post's time as a date-time entity (Bot API 9.5): Telegram shows it in
 * each reader's own time zone, and "08:01 UTC" where it cannot (older apps,
 * the web preview).
 */
export function formatPostTime(now: Date): string {
  const unix = Math.floor(now.getTime() / 1000);
  return `<tg-time unix="${unix}" format="t">${getCurrentTimeUTC(now)}</tg-time>`;
}

/**
 * Group yields by protocol within each category.
 * Groups are ordered by total TVL; hacked protocols always come last.
 */
export function organizeByProtocol(yields: YieldOpportunity[]): ProtocolGroup[] {
  const protocolMap = new Map<string, YieldOpportunity[]>();
  
  for (const yield_ of yields) {
    const existing = protocolMap.get(yield_.source) || [];
    existing.push(yield_);
    protocolMap.set(yield_.source, existing);
  }
  
  // Convert to array
  const groups: ProtocolGroup[] = [];
  for (const [protocol, protocolYields] of protocolMap) {
    groups.push({
      protocol,
      protocolUrl: protocolYields[0].sourceUrl,
      yields: protocolYields.sort((a, b) => b.tvlUsd - a.tvlUsd),
    });
  }
  
  // Sort by total TVL (rows with hidden TVL count as 0); hacked protocols last
  const visibleTvl = (group: ProtocolGroup) =>
    group.yields.reduce((sum, y) => sum + (y.tvlHidden ? 0 : y.tvlUsd), 0);
  groups.sort((a, b) => {
    const hackedA = isHackedProtocol(a.protocol) ? 1 : 0;
    const hackedB = isHackedProtocol(b.protocol) ? 1 : 0;
    if (hackedA !== hackedB) return hackedA - hackedB;
    return visibleTvl(b) - visibleTvl(a);
  });

  return groups;
}

/**
 * Format the complete message for Telegram channel
 * Uses HTML parse mode for formatting
 */
export async function formatChannelMessage(yields: GroupedYields): Promise<string> {
  const sections: string[] = [];
  
  // Collect all pools into a flat array for APY history tracking
  const allPools = [...yields.TON, ...yields.STABLE, ...yields.BTC, ...yields.ETH, ...yields.TON_USDT];

  // IMPORTANT: Save today's APY snapshots FIRST before calculating averages
  // This ensures today's data is included in the average calculation
  // Rows read on-chain carry their own measured 7d value; saving them would mix
  // their numbers into the history of the fallback rows that share their key.
  await saveAllApySnapshots(allPools.filter((y) => !y.onChain));
  
  // Calculate 7-day averages for all pools (includes today's data)
  const averages = await calculateAll7DayAverages(allPools);
  
  // Fetch TON TVL
  const tonTvl = await fetchTonTVL();
  
  // Count displayed opportunities (EVAA capped at 3 in stable section)
  const evaaDisplayed = Math.min(yields.STABLE.filter(y => y.source === "EVAA").length, 3);
  const nonEvaaStable = yields.STABLE.filter(y => y.source !== "EVAA").length;
  const displayedCount = yields.TON.length + evaaDisplayed + nonEvaaStable + yields.BTC.length + yields.ETH.length + yields.TON_USDT.length;
  const activeCategories = [yields.TON, yields.STABLE, yields.BTC, yields.ETH, yields.TON_USDT].filter(c => c.length > 0).length;

  // Header
  sections.push("<b>TON Yields Daily</b>");
  sections.push(`${getCurrentDateUTC()}`);
  
  // TON TVL (if available)
  if (tonTvl > 0) {
    // Calculate 24h change
    const change = await calculateTvlChange(tonTvl);
    
    // Save today's snapshot for future comparisons
    await saveTvlSnapshot(tonTvl);
    
    // Format TVL line with change
    let tvlLine = `<i>💎 TON DeFi TVL: ${formatTVL(tonTvl)}`;
    if (change) {
      const changeStr = formatTvlChange(change.change, change.changePercent);
      tvlLine += ` <b>${changeStr}</b> 24h`;
    }
    tvlLine += `</i>`;
    
    sections.push(tvlLine);
  }

  sections.push(`<i>${displayedCount} opportunities · ${activeCategories} categories</i>`);
  sections.push("");
  
  // Top 5 Yields section
  const top5 = getTopYields(yields, 5);
  const topSection = formatTopYieldsSection(top5, averages);
  if (topSection) {
    sections.push(topSection);
    sections.push("");
  }
  
  // TON and related assets section
  const tonGroups = organizeByProtocol(yields.TON);
  const tonSection = formatCategorySection("💎 GRAM AND RELATED ASSETS", tonGroups, averages);
  if (tonSection) {
    sections.push(tonSection);
    sections.push("");
  }
  
  // Stablecoins section (EVAA capped at 3 pools to avoid clutter)
  const stableGroups = organizeByProtocol(yields.STABLE);
  const stableLimits = new Map([["EVAA", 3]]);
  const stableSection = formatCategorySection("💵 STABLECOINS AND RELATED ASSETS", stableGroups, averages, stableLimits);
  if (stableSection) {
    sections.push(stableSection);
    sections.push("");
  }
  
  // TON-USDT pools section (impermanent loss risk)
  const tonUsdtGroups = organizeByProtocol(yields.TON_USDT);
  const tonUsdtSection = formatCategorySection("🔄 YIELDS FOR GRAM-USDT POOLS", tonUsdtGroups, averages);
  if (tonUsdtSection) {
    sections.push(tonUsdtSection);
    sections.push("");
  }
  
  // BTC section (if any)
  const btcGroups = organizeByProtocol(yields.BTC);
  const btcSection = formatCategorySection("₿ BTC AND RELATED ASSETS", btcGroups, averages);
  if (btcSection) {
    sections.push(btcSection);
    sections.push("");
  }

  // ETH section (if any)
  const ethGroups = organizeByProtocol(yields.ETH);
  const ethSection = formatCategorySection("⟠ ETH AND RELATED ASSETS", ethGroups, averages);
  if (ethSection) {
    sections.push(ethSection);
    sections.push("");
  }
  
  // Footer
  sections.push(SEPARATOR);
  sections.push("");
  // The legend explains only rows the post shows (not EVAA rows past the cap)
  const shownEvaaStable = new Set(stableGroups.find((g) => g.protocol === "EVAA")?.yields.slice(0, 3) ?? []);
  const shownRows = allPools.filter((y) => !(y.assetType === "STABLE" && !y.isTonUsdtPool && y.source === "EVAA") || shownEvaaStable.has(y));
  sections.push(...formatLegend(shownRows));
  sections.push(formatSourcesLine(allPools, new Date()));

  return sections.join("\n");
}

/** A Tonco-style concentrated-liquidity label: "CL" or "CL v1" (not DeDust's "Classic 0.10%") */
function isConcentratedLabel(label: string | null): boolean {
  return label !== null && /^CL( |$)/.test(label);
}

/**
 * The legend, one or two lines. The first explains the columns (the UR part
 * only when a row shows a utilisation rate, the hacked flag only when a row
 * carries it). The second, only when needed: "est." rows and concentrated-
 * liquidity pools. The post says nothing about referral links (owner's
 * choice of 2026-11-27).
 */
export function formatLegend(rows: YieldOpportunity[]): string[] {
  const columns = ["APY (7d avg) ↑↓"];
  if (rows.some((y) => y.utilizationPct !== undefined)) columns.push("UR = Utilisation Rate (🔥 if &gt;95%)");
  let tvl = "TVL · ⚠️ low TVL (&lt;$10K)";
  if (rows.some((y) => isHackedProtocol(y.source))) tvl += " · 🚨 hacked protocol";
  columns.push(tvl);

  const notes: string[] = [];
  if (rows.some((y) => y.apyEstimate)) notes.push("est. = the pool's own estimate");
  if (rows.some((y) => isConcentratedLabel(y.poolMeta))) {
    notes.push("CL = concentrated liquidity: an LP earns only while the price is in its range");
  }

  const lines = [`<i>${columns.join(" | ")}</i>`];
  if (notes.length > 0) lines.push(`<i>${notes.join(" · ")}</i>`);
  return lines;
}

/**
 * The footer's sources line. It credits DefiLlama, Swap.coffee and Palette;
 * DeDust and GTC are not credited there (owner's choices of 2026-11-20 and
 * 2026-11-24), although their rows stay in the post. "⛓️ on-chain" comes
 * first, only when the post really has rows read from contracts. Providers
 * that only some rows use (tonapi for TON Whales native staking) are added
 * when such a row is in the post. The time shows in each reader's time zone.
 */
export function formatSourcesLine(rows: YieldOpportunity[], now: Date): string {
  const onChain = rows.some((y) => y.onChain) ? "⛓️ on-chain · " : "";
  const credits = new Map<string, string>();
  for (const y of rows) {
    if (y.footerCredit && !credits.has(y.footerCredit.name)) credits.set(y.footerCredit.name, y.footerCredit.url);
  }
  const extra = [...credits].map(([name, url]) => ` · <a href="${escapeHtml(url)}">${safeText(name)}</a>`).join("");
  return `<i>📊 ${onChain}<a href="https://defillama.com/">DefiLlama</a> · <a href="https://swap.coffee/">Swap.coffee</a> · <a href="https://palette.finance/">Palette</a>${extra} · ${formatPostTime(now)}</i>`;
}

/**
 * Format a simple test message
 */
export function formatTestMessage(): string {
  return `<b>TON Yields Bot</b>\n\nBot is running!\n\n<i>Test message sent at ${getCurrentTimeUTC()}</i>`;
}

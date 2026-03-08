import type { GroupedYields, OrganizedYields, ProtocolGroup, YieldOpportunity } from "../types/yields.ts";
import { getTopYields } from "../services/defillama.ts";
import { fetchTonTVL, formatTVL } from "../services/tvl.ts";
import { saveTvlSnapshot, calculateTvlChange, formatTvlChange } from "../services/tvl_history.ts";
import { saveAllApySnapshots, calculateAll7DayAverages } from "../services/apy_history.ts";

const SEPARATOR = "──────────────────────";

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
 * Format asset name with optional label
 */
function formatAssetWithLabel(asset: string, label: string | null): string {
  if (label && label.length > 0) {
    return `${asset} (${label})`;
  }
  return asset;
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
  
  // Format APY with optional reward and 7-day average
  let apyText: string;
  if (yield_.apyReward && yield_.apyReward > 0.1) {
    // For pools with rewards, show base + reward, then direction + 7d average of total
    const baseReward = `${formatApy(yield_.apyBase)} (+${formatApy(yield_.apyReward)})`;
    if (avg7d !== null && avg7d !== undefined) {
      const direction = getApyDirection(yield_.apyTotal, avg7d);
      const average = avg7d.toFixed(1);
      apyText = `${baseReward}${direction} 7d: ${average}%`;
    } else {
      apyText = baseReward;
    }
  } else {
    // Regular APY with 7-day average and direction indicator
    apyText = formatApy(yield_.apyTotal, avg7d);
  }
  
  // Format TVL
  const tvlText = formatTvl(yield_.tvlUsd);
  
  return `${prefix} ${assetText}: ${apyText} | ${tvlText}`;
}

/**
 * Format protocol name with optional hyperlink
 */
function formatProtocolLink(name: string, url: string): string {
  if (url && url.length > 0) {
    return `<a href="${url}">${name}</a>`;
  }
  return name;
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
  
  // Protocol name as header with hyperlink
  const protocolLink = formatProtocolLink(group.protocol, group.protocolUrl);
  lines.push(`<b>${protocolLink}</b>`);
  
  // Apply optional limit (yields are already sorted by TVL)
  const yields = maxYields ? group.yields.slice(0, maxYields) : group.yields;
  
  // Generate labels for duplicates
  const labels = addLabelsForDuplicates(yields);
  
  // Add each yield line
  yields.forEach((y, index) => {
    const label = labels.get(y);
    const avg7d = averages.get(y) || null;
    lines.push(formatYieldLine(y, index === yields.length - 1, label, avg7d));
  });
  
  return lines.join("\n");
}

/**
 * Format a category section (TON, STABLE, BTC, ETH, etc.)
 * @param protocolLimits - Optional map of protocol name -> max yields to show
 */
function formatCategorySection(
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
function formatTopYieldsSection(yields: YieldOpportunity[], averages: Map<YieldOpportunity, number>): string {
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

    // Format APY with 7-day average and direction
    const avg7d = averages.get(y) || null;
    let apyText: string;
    if (y.apyReward && y.apyReward > 0.1) {
      const baseReward = `${formatApy(y.apyBase)} (+${formatApy(y.apyReward)})`;
      if (avg7d !== null && avg7d !== undefined) {
        const direction = getApyDirection(y.apyTotal, avg7d);
        const average = avg7d.toFixed(1);
        apyText = `${baseReward}${direction} 7d: ${average}%`;
      } else {
        apyText = baseReward;
      }
    } else {
      apyText = formatApy(y.apyTotal, avg7d);
    }

    const protocolLink = formatProtocolLink(y.source, y.sourceUrl);
    contentLines.push(`${rankEmoji} ${protocolLink} ${assetText}: ${apyText} | ${formatTvl(y.tvlUsd)}`);
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
  };
  return now.toLocaleDateString("en-US", options);
}

/**
 * Get current UTC time formatted
 */
function getCurrentTimeUTC(): string {
  const now = new Date();
  const hours = now.getUTCHours().toString().padStart(2, "0");
  const minutes = now.getUTCMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes} UTC`;
}

/**
 * Group yields by protocol within each category
 */
function organizeByProtocol(yields: YieldOpportunity[]): ProtocolGroup[] {
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
  
  // Sort by total TVL
  groups.sort((a, b) => {
    const tvlA = a.yields.reduce((sum, y) => sum + y.tvlUsd, 0);
    const tvlB = b.yields.reduce((sum, y) => sum + y.tvlUsd, 0);
    return tvlB - tvlA;
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
  await saveAllApySnapshots(allPools);
  
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
  const tonSection = formatCategorySection("💎 TON AND RELATED ASSETS", tonGroups, averages);
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
  const tonUsdtSection = formatCategorySection("🔄 YIELDS FOR TON-USDT POOLS", tonUsdtGroups, averages);
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
  sections.push("<i>APY (7d avg) ↑↓ | TVL</i>");
  sections.push(`<i>📊 <a href="https://defillama.com/">DefiLlama</a> · <a href="https://merkl.xyz/">Merkl</a> · <a href="https://goldsky.com/">Goldsky</a> · <a href="https://swap.coffee/">Swap.coffee</a> · ${getCurrentTimeUTC()}</i>`);
  
  return sections.join("\n");
}

/**
 * Format a simple test message
 */
export function formatTestMessage(): string {
  return `<b>TON Yields Bot</b>\n\nBot is running!\n\n<i>Test message sent at ${getCurrentTimeUTC()}</i>`;
}

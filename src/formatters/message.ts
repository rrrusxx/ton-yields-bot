import type { GroupedYields, OrganizedYields, ProtocolGroup, YieldOpportunity } from "../types/yields.ts";
import { getTopYields } from "../services/defillama.ts";
import { fetchTonTVL, formatTVL } from "../services/tvl.ts";
import { saveTvlSnapshot, calculateTvlChange, formatTvlChange } from "../services/tvl_history.ts";
import { saveAllApySnapshots, calculateAll7DayAverages } from "../services/apy_history.ts";

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
 * Format APY percentage with optional 7-day average
 * e.g., 4.234 -> "4.2%"
 * e.g., 4.234 with avg 4.8 -> "4.2% (7d: 4.8%)"
 */
function formatApy(apy: number, avg7d?: number | null): string {
  const current = apy.toFixed(1);
  
  if (avg7d !== null && avg7d !== undefined) {
    const average = avg7d.toFixed(1);
    return `${current}% (7d: ${average}%)`;
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
    // For pools with rewards, show base + reward, then 7d average of total
    const baseReward = `${formatApy(yield_.apyBase)} (+${formatApy(yield_.apyReward)})`;
    if (avg7d !== null && avg7d !== undefined) {
      const average = avg7d.toFixed(1);
      apyText = `${baseReward}, 7d: ${average}%`;
    } else {
      apyText = baseReward;
    }
  } else {
    // Regular APY with 7-day average
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
 */
function formatProtocolGroup(group: ProtocolGroup, averages: Map<YieldOpportunity, number>): string {
  const lines: string[] = [];
  
  // Protocol name as header with hyperlink (if URL available)
  const protocolLink = formatProtocolLink(group.protocol, group.protocolUrl);
  lines.push(`<b>${protocolLink}</b>`);
  
  // Show all yields (no limit)
  const yields = group.yields;
  
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
 * Format a category section (TON, STABLE, or BTC)
 */
function formatCategorySection(
  title: string,
  protocolGroups: ProtocolGroup[],
  averages: Map<YieldOpportunity, number>
): string {
  if (protocolGroups.length === 0) {
    return "";
  }
  
  const lines: string[] = [];
  
  // Section header
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push(`<b>${title}</b>`);
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push("");
  
  // Show all protocols (no limit)
  protocolGroups.forEach((group, index) => {
    lines.push(formatProtocolGroup(group, averages));
    if (index < protocolGroups.length - 1) {
      lines.push(""); // Spacing between protocols
    }
  });
  
  return lines.join("\n");
}

/**
 * Format Top 5 yields section
 */
function formatTopYieldsSection(yields: YieldOpportunity[], averages: Map<YieldOpportunity, number>): string {
  if (yields.length === 0) {
    return "";
  }
  
  const lines: string[] = [];
  
  // Section header
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push("<b>TOP 5 YIELD OPPORTUNITIES</b>");
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push("");
  
  // Add each yield
  yields.forEach((y, index) => {
    const rank = index + 1;
    
    // Format asset with label if available
    const assetText = formatAssetWithLabel(y.asset, y.poolMeta);
    
    // Format APY with 7-day average
    const avg7d = averages.get(y) || null;
    let apyText: string;
    if (y.apyReward && y.apyReward > 0.1) {
      // For pools with rewards, show base + reward, then 7d average of total
      const baseReward = `${formatApy(y.apyBase)} (+${formatApy(y.apyReward)})`;
      if (avg7d !== null && avg7d !== undefined) {
        const average = avg7d.toFixed(1);
        apyText = `${baseReward}, 7d: ${average}%`;
      } else {
        apyText = baseReward;
      }
    } else {
      apyText = formatApy(y.apyTotal, avg7d);
    }
    
    // Protocol link (with URL if available)
    const protocolLink = formatProtocolLink(y.source, y.sourceUrl);
    
    lines.push(`${rank}. ${protocolLink} ${assetText}: ${apyText} | ${formatTvl(y.tvlUsd)}`);
  });
  
  return lines.join("\n");
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
  const allPools = [...yields.TON, ...yields.STABLE, ...yields.BTC, ...yields.TON_USDT];
  
  // Calculate 7-day averages for all pools (before formatting)
  const averages = await calculateAll7DayAverages(allPools);
  
  // Save today's APY snapshots for future calculations
  await saveAllApySnapshots(allPools);
  
  // Fetch TON TVL
  const tonTvl = await fetchTonTVL();
  
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
  const tonSection = formatCategorySection("TON AND RELATED ASSETS", tonGroups, averages);
  if (tonSection) {
    sections.push(tonSection);
    sections.push("");
  }
  
  // Stablecoins section
  const stableGroups = organizeByProtocol(yields.STABLE);
  const stableSection = formatCategorySection("STABLECOINS AND RELATED ASSETS", stableGroups, averages);
  if (stableSection) {
    sections.push(stableSection);
    sections.push("");
  }
  
  // TON-USDT pools section (impermanent loss risk) - shown before BTC
  const tonUsdtGroups = organizeByProtocol(yields.TON_USDT);
  const tonUsdtSection = formatCategorySection("YIELDS FOR TON-USDT POOLS", tonUsdtGroups, averages);
  if (tonUsdtSection) {
    sections.push(tonUsdtSection);
    sections.push("");
  }
  
  // BTC section (if any)
  const btcGroups = organizeByProtocol(yields.BTC);
  const btcSection = formatCategorySection("BTC AND RELATED ASSETS", btcGroups, averages);
  if (btcSection) {
    sections.push(btcSection);
    sections.push("");
  }
  
  // Footer
  sections.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  sections.push("");
  sections.push("<i>Legend: APY (+reward) | TVL</i>");
  sections.push(`<i>Data: <a href="https://defillama.com/">DefiLlama</a> | <a href="https://merkl.xyz/">Merkl</a> | <a href="https://goldsky.com/">Goldsky</a> | <a href="https://swap.coffee/">Swap.coffee</a> • ${getCurrentTimeUTC()}</i>`);
  
  return sections.join("\n");
}

/**
 * Format a simple test message
 */
export function formatTestMessage(): string {
  return `<b>TON Yields Bot</b>\n\nBot is running!\n\n<i>Test message sent at ${getCurrentTimeUTC()}</i>`;
}

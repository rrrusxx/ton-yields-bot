import type { GroupedYields, OrganizedYields, ProtocolGroup, YieldOpportunity } from "../types/yields.ts";
import { getTopYields } from "../services/defillama.ts";

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
 * Format APY percentage
 * e.g., 4.234 -> "4.2%"
 */
function formatApy(apy: number): string {
  return `${apy.toFixed(1)}%`;
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
  label?: string | null
): string {
  const prefix = isLast ? "└" : "├";
  
  // Format asset with label
  const assetText = formatAssetWithLabel(yield_.asset, label ?? yield_.poolMeta);
  
  // Format APY with optional reward
  let apyText = formatApy(yield_.apyTotal);
  if (yield_.apyReward && yield_.apyReward > 0.1) {
    apyText = `${formatApy(yield_.apyBase)} (+${formatApy(yield_.apyReward)})`;
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
function formatProtocolGroup(group: ProtocolGroup, maxItems: number = 5): string {
  const lines: string[] = [];
  
  // Protocol name as header with hyperlink (if URL available)
  const protocolLink = formatProtocolLink(group.protocol, group.protocolUrl);
  lines.push(`<b>${protocolLink}</b>`);
  
  // Limit yields per protocol
  const yields = group.yields.slice(0, maxItems);
  
  // Generate labels for duplicates
  const labels = addLabelsForDuplicates(yields);
  
  // Add each yield line
  yields.forEach((y, index) => {
    const label = labels.get(y);
    lines.push(formatYieldLine(y, index === yields.length - 1, label));
  });
  
  return lines.join("\n");
}

/**
 * Format a category section (TON, STABLE, or BTC)
 */
function formatCategorySection(
  title: string,
  protocolGroups: ProtocolGroup[],
  maxProtocols: number = 10
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
  
  // Limit protocols shown
  const groups = protocolGroups.slice(0, maxProtocols);
  
  // Add each protocol group
  groups.forEach((group, index) => {
    lines.push(formatProtocolGroup(group));
    if (index < groups.length - 1) {
      lines.push(""); // Spacing between protocols
    }
  });
  
  return lines.join("\n");
}

/**
 * Format Top 5 yields section
 */
function formatTopYieldsSection(yields: YieldOpportunity[]): string {
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
    
    // Format APY
    let apyText = formatApy(y.apyTotal);
    if (y.apyReward && y.apyReward > 0.1) {
      apyText = `${formatApy(y.apyBase)} (+${formatApy(y.apyReward)})`;
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
export function formatChannelMessage(yields: GroupedYields): string {
  const sections: string[] = [];
  
  // Header
  sections.push("<b>TON Yields Daily</b>");
  sections.push(`${getCurrentDateUTC()}`);
  sections.push("");
  
  // Top 5 Yields section
  const top5 = getTopYields(yields, 5);
  const topSection = formatTopYieldsSection(top5);
  if (topSection) {
    sections.push(topSection);
    sections.push("");
  }
  
  // TON and related assets section
  const tonGroups = organizeByProtocol(yields.TON);
  const tonSection = formatCategorySection("TON AND RELATED ASSETS", tonGroups);
  if (tonSection) {
    sections.push(tonSection);
    sections.push("");
  }
  
  // Stablecoins section
  const stableGroups = organizeByProtocol(yields.STABLE);
  const stableSection = formatCategorySection("STABLECOINS AND RELATED ASSETS", stableGroups);
  if (stableSection) {
    sections.push(stableSection);
    sections.push("");
  }
  
  // BTC section (if any)
  const btcGroups = organizeByProtocol(yields.BTC);
  const btcSection = formatCategorySection("BTC AND RELATED ASSETS", btcGroups);
  if (btcSection) {
    sections.push(btcSection);
    sections.push("");
  }
  
  // Footer
  sections.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  sections.push("");
  sections.push("<i>Legend: APY (+reward) | TVL</i>");
  sections.push(`<i>Data: <a href="https://defillama.com/">DefiLlama</a> | <a href="https://merkl.xyz/">Merkl</a> | <a href="https://goldsky.com/">Goldsky</a> • ${getCurrentTimeUTC()}</i>`);
  
  return sections.join("\n");
}

/**
 * Format a simple test message
 */
export function formatTestMessage(): string {
  return `<b>TON Yields Bot</b>\n\nBot is running!\n\n<i>Test message sent at ${getCurrentTimeUTC()}</i>`;
}

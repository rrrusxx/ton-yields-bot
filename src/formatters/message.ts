import type { GroupedYields, ProtocolGroup, YieldOpportunity } from "../types/yields.ts";
import type { SectionKey } from "../services/post_snapshot.ts";
import { getTopYields } from "../services/defillama.ts";
import { displayTicker, isHackedProtocol } from "../services/protocols.ts";
import { fetchTonTVL, formatTVL } from "../services/tvl.ts";
import { saveTvlSnapshot, calculateTvlChange, formatTvlChange } from "../services/tvl_history.ts";
import { saveAllApySnapshots, calculateAll7DayAverages } from "../services/apy_history.ts";
import {
  displayText,
  escapeHtml,
  formatDateUTC,
  formatTvl,
  getApyDirection,
  getRankEmoji,
  lowTvlWarning,
  safeText,
} from "./text.ts";

export { displayText, escapeHtml };

export const SEPARATOR = "──────────────────────";

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
export function formatAssetWithLabel(asset: string, label: string | null): string {
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
export function formatProtocolLink(name: string, url: string): string {
  if (url && url.length > 0) {
    return `<a href="${escapeHtml(url)}">${safeText(name)}</a>`;
  }
  return safeText(name);
}

/**
 * Add auto-generated labels for duplicate assets without poolMeta
 */
export function addLabelsForDuplicates(yields: YieldOpportunity[]): Map<YieldOpportunity, string | null> {
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
    const avg7d = shownAverage(y, averages);
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
    const avg7d = shownAverage(y, averages);
    const apyText = formatRowApy(y, avg7d);

    const protocolLink = formatProtocolLink(y.source, y.sourceUrl);
    contentLines.push(`${rankEmoji} ${protocolLink} ${assetText}: ${apyText}${formatUtilization(y.utilizationPct)}${formatTvlPart(y)}`);
  });

  result.push(`<blockquote expandable>${contentLines.join("\n")}</blockquote>`);

  return result.join("\n");
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

/** A section of the post, in the order shown */
export interface DigestSection {
  key: SectionKey;
  title: string;
  groups: ProtocolGroup[];
  /** Per-protocol caps on shown rows (EVAA shows its 3 largest stablecoin pools) */
  limits?: Map<string, number>;
}

/** A row as the post shows it, with the section and the label it is shown under */
export interface ShownRow {
  row: YieldOpportunity;
  section: SectionKey;
  label: string | null;
}

/** Everything both versions of the post (classic and rich) are built from */
export interface DigestData {
  now: Date;
  /** TON DeFi TVL for the header; 0 when it could not be fetched */
  tonTvl: number;
  tvlChange: { change: number; changePercent: number } | null;
  displayedCount: number;
  activeCategories: number;
  top5: YieldOpportunity[];
  sections: DigestSection[];
  averages: Map<YieldOpportunity, number>;
  allPools: YieldOpportunity[];
  /** Rows the post shows, section by section (EVAA rows past the cap left out) */
  shown: ShownRow[];
}

/** The 7-day value a row shows: its own measured one, else the average of saved snapshots */
export function shownAverage(y: YieldOpportunity, averages: Map<YieldOpportunity, number>): number | null {
  return y.onChain ? (y.apy7d ?? null) : (y.apy7d ?? (averages.get(y) || null));
}

/**
 * Collect what the post shows. Saves today's APY snapshots before the 7-day
 * averages are computed (so today counts) and today's header TVL after its
 * 24h change is computed.
 */
export async function prepareDigest(yields: GroupedYields, now: Date = new Date()): Promise<DigestData> {
  // Collect all pools into a flat array for APY history tracking
  const allPools = [...yields.TON, ...yields.STABLE, ...yields.BTC, ...yields.ETH, ...yields.TON_USDT];

  // IMPORTANT: Save today's APY snapshots FIRST before calculating averages
  // This ensures today's data is included in the average calculation
  // Rows read on-chain carry their own measured 7d value; saving them would mix
  // their numbers into the history of the fallback rows that share their key.
  await saveAllApySnapshots(allPools.filter((y) => !y.onChain));
  const averages = await calculateAll7DayAverages(allPools);

  // Header TVL and its change since the last saved snapshot
  const tonTvl = await fetchTonTVL();
  let tvlChange: DigestData["tvlChange"] = null;
  if (tonTvl > 0) {
    tvlChange = await calculateTvlChange(tonTvl);
    await saveTvlSnapshot(tonTvl);
  }

  const sections: DigestSection[] = [
    { key: "TON", title: "💎 GRAM YIELDS", groups: organizeByProtocol(yields.TON) },
    // EVAA capped at 3 pools to avoid clutter
    { key: "STABLE", title: "💵 USDT YIELDS", groups: organizeByProtocol(yields.STABLE), limits: new Map([["EVAA", 3]]) },
    // GRAM-USDT pools (impermanent loss risk) have their own section
    { key: "TON_USDT", title: "🔄 YIELDS FOR GRAM-USDT POOLS", groups: organizeByProtocol(yields.TON_USDT) },
    { key: "BTC", title: "₿ BTC AND RELATED ASSETS", groups: organizeByProtocol(yields.BTC) },
    { key: "ETH", title: "⟠ ETH AND RELATED ASSETS", groups: organizeByProtocol(yields.ETH) },
  ];
  const shown: ShownRow[] = sections.flatMap((section) =>
    section.groups.flatMap((group) => {
      const limit = section.limits?.get(group.protocol);
      const rows = limit ? group.yields.slice(0, limit) : group.yields;
      const labels = addLabelsForDuplicates(rows);
      return rows.map((row) => ({ row, section: section.key, label: labels.get(row) ?? row.poolMeta }));
    })
  );

  return {
    now,
    tonTvl,
    tvlChange,
    displayedCount: shown.length,
    activeCategories: sections.filter((s) => s.groups.length > 0).length,
    top5: getTopYields(yields, 5),
    sections,
    averages,
    allPools,
    shown,
  };
}

/**
 * The classic post (Telegram HTML for sendMessage). `sinceBlock` is the
 * "Since yesterday" block, placed between the header and the TOP-5.
 */
export function renderClassic(data: DigestData, sinceBlock = ""): string {
  const sections: string[] = [];

  // Header
  sections.push("<b>TON Yields Daily</b>");
  sections.push(formatDateUTC(data.now));

  // TON TVL (if available) with its 24h change
  if (data.tonTvl > 0) {
    let tvlLine = `<i>💎 TON DeFi TVL: ${formatTVL(data.tonTvl)}`;
    if (data.tvlChange) {
      const changeStr = formatTvlChange(data.tvlChange.change, data.tvlChange.changePercent);
      tvlLine += ` <b>${changeStr}</b> 24h`;
    }
    tvlLine += `</i>`;
    sections.push(tvlLine);
  }

  sections.push(`<i>${data.displayedCount} opportunities · ${data.activeCategories} categories</i>`);
  sections.push("");

  if (sinceBlock) {
    sections.push(sinceBlock);
    sections.push("");
  }

  // Top 5 Yields section
  const topSection = formatTopYieldsSection(data.top5, data.averages);
  if (topSection) {
    sections.push(topSection);
    sections.push("");
  }

  // Asset sections: GRAM, stablecoins, GRAM-USDT pools, BTC, ETH
  for (const section of data.sections) {
    const text = formatCategorySection(section.title, section.groups, data.averages, section.limits);
    if (text) {
      sections.push(text);
      sections.push("");
    }
  }

  // Footer: the legend explains only rows the post shows (not EVAA rows past the cap)
  sections.push(SEPARATOR);
  sections.push("");
  sections.push(...formatLegend(data.shown.map((s) => s.row)));
  sections.push(formatSourcesLine(data.allPools, data.now));

  return sections.join("\n");
}

/**
 * Format the complete message for Telegram channel
 * Uses HTML parse mode for formatting
 */
export async function formatChannelMessage(yields: GroupedYields): Promise<string> {
  return renderClassic(await prepareDigest(yields));
}

/** A Tonco-style concentrated-liquidity label: "CL" or "CL v1" (not DeDust's "Classic 0.10%") */
export function isConcentratedLabel(label: string | null): boolean {
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

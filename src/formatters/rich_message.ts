/**
 * The daily post as a rich message (Bot API 10.1, sendRichMessage, Rich HTML
 * style): real tables with aligned columns, one collapsible block per asset
 * section, the legend under the tables and the sources in a footer. Built
 * from the same DigestData as the classic post (message.ts), so both always
 * show the same rows and numbers. Rules kept from the classic post: grouped
 * by asset, then protocol; links only to protocols; APY, never APR; "est."
 * for estimates; ⚠️ for low TVL; no TVL for hacked protocols; the legend
 * names only markers the post shows.
 *
 * Limits (https://core.telegram.org/bots/api#rich-message-formatting-options):
 * 32,768 characters, 500 blocks (every table row counts), 20 table columns;
 * table cells take inline formatting only.
 */

import type { YieldOpportunity } from "../types/yields.ts";
import type { DigestData, DigestSection } from "./message.ts";
import { addLabelsForDuplicates, formatAssetWithLabel, formatProtocolLink, formatSourcesLine, isConcentratedLabel, shownAverage } from "./message.ts";
import { isHackedProtocol } from "../services/protocols.ts";
import { formatTVL } from "../services/tvl.ts";
import { formatTvlChange } from "../services/tvl_history.ts";
import { formatDateUTC, formatTvl, getApyDirection, getRankEmoji, lowTvlWarning, safeText } from "./text.ts";

/** Section headings of the rich post (the classic post writes them in capitals) */
const RICH_TITLES: Record<DigestSection["key"], string> = {
  TON: "💎 GRAM Yields",
  STABLE: "💵 USDT Yields",
  TON_USDT: "🔄 GRAM-USDT pools (impermanent loss risk)",
  BTC: "₿ BTC and related assets",
  ETH: "⟠ ETH and related assets",
};

/** Markers the post shows, so the legend explains exactly those */
interface Seen {
  arrow: boolean;
  lowTvl: boolean;
  ur: boolean;
  fire: boolean;
  estimate: boolean;
  concentrated: boolean;
  hacked: boolean;
}

const R = ` align="right"`;

/**
 * The APY cell and the 7d cell of a row. The APY cell holds the number only,
 * so the right-aligned column lines up; the markers go in front of the 7d
 * value ("↑ 27.1%": today's APY is above it) or in its place ("est.": the
 * pool's own estimate, which has no 7-day value).
 */
function apyCells(y: YieldOpportunity, averages: Map<YieldOpportunity, number>, seen: Seen): [string, string] {
  if (y.apyEstimate) {
    seen.estimate = true;
    return [`${y.apyTotal.toFixed(1)}%`, "est."];
  }
  if (y.apyNote) {
    return [`${y.apyTotal.toFixed(2)}%`, safeText(y.apyNote)];
  }
  const avg7d = shownAverage(y, averages);
  const arrow = avg7d !== null ? getApyDirection(y.apyTotal, avg7d).trim() : "";
  if (arrow) seen.arrow = true;
  const average = avg7d !== null ? `${arrow ? `${arrow} ` : ""}${avg7d.toFixed(1)}%` : "";
  if (y.apyReward && y.apyReward > 0.1) {
    return [`${y.apyBase.toFixed(1)}% + ${y.apyReward.toFixed(1)}%`, average];
  }
  return [`${y.apyTotal.toFixed(1)}%`, average];
}

/** The UR cell: utilisation rate, 🔥 above 95% */
function urCell(y: YieldOpportunity, seen: Seen): string {
  if (y.utilizationPct === undefined) return "";
  seen.ur = true;
  const fire = y.utilizationPct > 95;
  if (fire) seen.fire = true;
  return `${y.utilizationPct.toFixed(1)}%${fire ? " 🔥" : ""}`;
}

/** The TVL cell: empty when unknown or when the protocol is hacked (its TVL is frozen) */
function tvlCell(y: YieldOpportunity, seen: Seen): string {
  if (y.tvlHidden || isHackedProtocol(y.source)) return "";
  const warning = lowTvlWarning(y.tvlUsd);
  if (warning) seen.lowTvl = true;
  return `${formatTvl(y.tvlUsd)}${warning}`;
}

/** Header row: Pool or Protocol + Asset, APY, 7d, UR (when used), TVL */
function headerRow(lead: string[], withUr: boolean): string {
  const cells = [...lead.map((h) => `<th>${h}</th>`), `<th${R}>APY</th>`, `<th${R}>7d</th>`];
  if (withUr) cells.push(`<th${R}>UR</th>`);
  cells.push(`<th${R}>TVL</th>`);
  return `<tr>${cells.join("")}</tr>`;
}

function valueCells(y: YieldOpportunity, data: DigestData, withUr: boolean, seen: Seen): string {
  const [apy, avg] = apyCells(y, data.averages, seen);
  const cells = [`<td${R}><b>${apy}</b></td>`, `<td${R}>${avg}</td>`];
  if (withUr) cells.push(`<td${R}>${urCell(y, seen)}</td>`);
  cells.push(`<td${R}>${tvlCell(y, seen)}</td>`);
  return cells.join("");
}

function protocolCell(name: string, url: string, seen: Seen): string {
  const hacked = isHackedProtocol(name);
  if (hacked) seen.hacked = true;
  return `${formatProtocolLink(name, url)}${hacked ? " 🚨" : ""}`;
}

function topTable(data: DigestData, seen: Seen): string {
  if (data.top5.length === 0) return "";
  const withUr = data.top5.some((y) => y.utilizationPct !== undefined);
  const rows = data.top5.map((y, i) => {
    if (isConcentratedLabel(y.poolMeta)) seen.concentrated = true;
    const pool = `${protocolCell(y.source, y.sourceUrl, seen)} ${formatAssetWithLabel(y.asset, y.poolMeta)}`;
    return `<tr><td>${getRankEmoji(i + 1)}</td><td>${pool}</td>${valueCells(y, data, withUr, seen)}</tr>`;
  });
  return `<h4>🏆 Top 5 yield opportunities</h4>\n<table striped compact>${headerRow(["#", "Pool"], withUr)}${rows.join("")}</table>`;
}

function sectionBlock(section: DigestSection, data: DigestData, seen: Seen): string {
  if (section.groups.length === 0) return "";
  const shownGroups = section.groups.map((group) => {
    const limit = section.limits?.get(group.protocol);
    return { group, rows: limit ? group.yields.slice(0, limit) : group.yields };
  });
  const withUr = shownGroups.some(({ rows }) => rows.some((y) => y.utilizationPct !== undefined));
  const count = shownGroups.reduce((sum, g) => sum + g.rows.length, 0);
  const lines: string[] = [headerRow(["Protocol", "Asset"], withUr)];
  for (const { group, rows } of shownGroups) {
    const labels = addLabelsForDuplicates(rows);
    rows.forEach((y, i) => {
      const label = labels.get(y) ?? y.poolMeta;
      if (isConcentratedLabel(label)) seen.concentrated = true;
      const lead = i === 0
        ? `<td${rows.length > 1 ? ` rowspan="${rows.length}"` : ""} valign="top"><b>${protocolCell(group.protocol, group.protocolUrl, seen)}</b></td>`
        : "";
      lines.push(`<tr>${lead}<td>${formatAssetWithLabel(y.asset, label)}</td>${valueCells(y, data, withUr, seen)}</tr>`);
    });
  }
  return `<details><summary><b>${RICH_TITLES[section.key]}</b> · ${count}</summary>\n<table striped compact>${lines.join("")}</table>\n</details>`;
}

/** The legend: only the markers the post shows, one line */
export function richLegend(seen: Seen): string {
  const parts: string[] = [];
  if (seen.arrow) parts.push("↑↓ in 7d: today's APY is above or below its 7-day value");
  if (seen.estimate) parts.push("est. the pool's own estimate, no 7-day value");
  if (seen.ur) parts.push(`UR utilisation rate${seen.fire ? " (🔥 above 95%)" : ""}`);
  if (seen.lowTvl) parts.push("⚠️ TVL below $10K");
  if (seen.concentrated) parts.push("CL concentrated liquidity: an LP earns only while the price is in its range");
  if (seen.hacked) parts.push("🚨 hacked protocol");
  return parts.length > 0 ? `<p><i>${parts.join(" · ")}</i></p>` : "";
}

/**
 * The whole post as Rich HTML. `sinceBlock` is the "Since yesterday" block
 * (formatSinceRich), placed between the header and the TOP-5.
 */
export function renderRich(data: DigestData, sinceBlock = ""): string {
  const seen: Seen = { arrow: false, lowTvl: false, ur: false, fire: false, estimate: false, concentrated: false, hacked: false };
  const parts: string[] = ["<h3>TON Yields Daily</h3>"];

  let header = `<b>${formatDateUTC(data.now)}</b>`;
  if (data.tonTvl > 0) {
    header += ` · 💎 TON DeFi TVL ${formatTVL(data.tonTvl)}`;
    if (data.tvlChange) header += ` <b>${formatTvlChange(data.tvlChange.change, data.tvlChange.changePercent)}</b> 24h`;
  }
  parts.push(`<p>${header}</p>`);
  parts.push(`<p><i>${data.displayedCount} opportunities · ${data.activeCategories} categories</i></p>`);

  if (sinceBlock) parts.push(sinceBlock);
  const top = topTable(data, seen);
  if (top) parts.push(top);
  for (const section of data.sections) {
    const block = sectionBlock(section, data, seen);
    if (block) parts.push(block);
  }

  const legend = richLegend(seen);
  if (legend) parts.push(legend);
  parts.push(`<footer>${formatSourcesLine(data.allPools, data.now)}</footer>`);
  return parts.join("\n");
}

/**
 * The weekly card: on Mondays (UTC), right after the daily post, a picture
 * of the week for the channel and for reposts (protocols, X). Every number on
 * it is a 7-day APY, so the bars share one scale honestly:
 * - liquid staking: each token's 7-day APY measured on-chain (5 cycles);
 * - stablecoins: the best pools with at least $100K TVL that pass the TOP-5
 *   rules, by their 7-day value (the Storm vault's own 7-day APY, or the
 *   average of the last 7 daily snapshots); pools without one are left out.
 * Hacked protocols never appear on it (the card cannot carry the 🚨 flag).
 * Built from the same data as the day's post.
 */

import type { DigestData } from "../formatters/message.ts";
import type { YieldOpportunity } from "../types/yields.ts";
import { isTopYieldEligible } from "../services/defillama.ts";
import { displayTicker, isHackedProtocol } from "../services/protocols.ts";
import { daysBefore } from "../services/post_snapshot.ts";
import { shownAssetText } from "../formatters/since_yesterday.ts";
import { buildWeeklyCardSvg, type CardRow, type WeeklyCardData } from "./weekly_card.ts";
import { loadFonts } from "./fonts.ts";
import { renderPng } from "./render_png.ts";

/** Stablecoin pools below this TVL stay off the card (they stay in the post) */
export const CARD_STABLE_MIN_TVL = 100_000;
/** Stablecoin rows on the card */
const CARD_STABLE_ROWS = 3;
/** Fewer liquid staking rows than this (most on-chain reads failed): no card that week */
export const CARD_MIN_STAKING_ROWS = 3;

/** True on the day the card goes out: Monday, UTC */
export function isCardDay(today: string): boolean {
  return new Date(`${today}T00:00:00Z`).getUTCDay() === 1;
}

/**
 * The 7 days before the post day, which the 7-day values cover (they end at
 * the run, about 08:00 UTC): "Nov 23-29, 2026" for Monday Nov 30,
 * "Nov 30 - Dec 6, 2026", "Dec 28, 2026 - Jan 3, 2027".
 */
export function weekLabel(today: string): string {
  const end = new Date(`${daysBefore(today, 1)}T00:00:00Z`);
  const start = new Date(`${daysBefore(today, 7)}T00:00:00Z`);
  const month = (d: Date) => d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const [sd, ed] = [start.getUTCDate(), end.getUTCDate()];
  const [sy, ey] = [start.getUTCFullYear(), end.getUTCFullYear()];
  if (sy !== ey) return `${month(start)} ${sd}, ${sy} - ${month(end)} ${ed}, ${ey}`;
  if (start.getUTCMonth() !== end.getUTCMonth()) return `${month(start)} ${sd} - ${month(end)} ${ed}, ${ey}`;
  return `${month(start)} ${sd}-${ed}, ${ey}`;
}

/**
 * A row's 7-day APY: measured on-chain over 5 cycles (liquid staking), the
 * row's own APY when it already is a 7-day value (the Storm vaults, read
 * on-chain over 7 days), else the average of the last 7 daily snapshots
 * (3 or more); null when there is none.
 */
export function sevenDayApy(row: YieldOpportunity, averages: Map<YieldOpportunity, number>): number | null {
  if (row.apyEstimate) return null;
  if (row.apy7d !== undefined) return Number.isFinite(row.apy7d) ? row.apy7d : null;
  if (row.onChain) return Number.isFinite(row.apyTotal) ? row.apyTotal : null;
  const average = averages.get(row);
  return average !== undefined && Number.isFinite(average) ? average : null;
}

/**
 * What the card shows, or null when there is not enough to draw (fewer than
 * CARD_MIN_STAKING_ROWS liquid staking rows with a measured 7-day APY).
 */
export function weeklyCardData(data: DigestData, today: string, channel: string): WeeklyCardData | null {
  const staking: CardRow[] = data.shown
    .filter(({ row, section }) =>
      section === "TON" && row.onChain && row.apy7d !== undefined && Number.isFinite(row.apy7d) && row.poolMeta &&
      !isHackedProtocol(row.source)
    )
    .map(({ row }) => {
      const token = displayTicker(row.poolMeta ?? "");
      return token === row.source ? { name: row.source, apy: row.apy7d! } : { name: row.source, detail: token, apy: row.apy7d! };
    });
  if (staking.length < CARD_MIN_STAKING_ROWS) return null;

  const stables: CardRow[] = data.shown
    .filter(({ row, section }) => section === "STABLE" && isTopYieldEligible(row) && row.tvlUsd >= CARD_STABLE_MIN_TVL)
    .flatMap(({ row, label }): CardRow[] => {
      const apy = sevenDayApy(row, data.averages);
      return apy === null ? [] : [{ name: row.source, detail: shownAssetText(row.asset, label), apy }];
    })
    .sort((a, b) => b.apy - a.apy)
    .slice(0, CARD_STABLE_ROWS);

  const handle = /^@[A-Za-z][A-Za-z0-9_]{3,31}$/.test(channel.trim()) ? channel.trim() : "@ton_yields_daily";
  return {
    title: "GRAM (TON) yields",
    subtitle: `Week of ${weekLabel(today)}`,
    sections: [
      { title: "Liquid staking", note: "7-day APY measured on-chain", rows: staking },
      ...(stables.length > 0 ? [{ title: "Stablecoins", note: "7-day APY, pools with $100K+ TVL", rows: stables }] : []),
    ],
    footer: { handle, sources: "data: on-chain, DefiLlama, Swap.coffee, Palette" },
  };
}

/** The caption under the card: plain text, well under Telegram's 1,024 characters */
export function cardCaption(card: WeeklyCardData): string {
  const staking = card.sections[0].rows;
  const best = [...staking].sort((a, b) => b.apy - a.apy)[0];
  const lines = [
    `📊 GRAM (TON) yields, week of ${card.subtitle.replace(/^Week of /, "")}`,
    `Liquid staking, 7-day APY measured on-chain: ${staking.length} token${staking.length === 1 ? "" : "s"}, the highest ${best.name}${best.detail ? ` ${best.detail}` : ""} at ${best.apy.toFixed(1)}%.`,
  ];
  if (card.sections.length > 1) lines.push("Stablecoins, 7-day APY: the best pools with $100K+ TVL.");
  lines.push("Every pool, with TVL and links, is in the daily post.");
  return lines.join("\n");
}

/** Draw the card as a 1600x900 PNG. Logs, but never throws on, layout warnings. */
export async function renderWeeklyCard(card: WeeklyCardData): Promise<Uint8Array> {
  const fonts = await loadFonts();
  const { svg, warnings } = buildWeeklyCardSvg(card, fonts.metrics);
  for (const w of warnings) console.warn(`Weekly card: ${w}`);
  return (await renderPng(svg, fonts.buffers)).png;
}

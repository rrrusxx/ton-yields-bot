/**
 * The "Since yesterday" block: what changed between the previous post and
 * today's, so the daily post carries news and not only a table. It compares
 * what readers saw (src/services/post_snapshot.ts), pool by pool:
 * - protocols newly flagged as hacked;
 * - rows that entered or left the TOP-5;
 * - notable APY moves (at least 1 point and 10% of the old value), biggest
 *   first, for rows with a known TVL of at least $10K on both days whose APY
 *   was measured the same way both days (on-chain both days, or from a data
 *   provider both days): a switch between the contract reading and the
 *   provider's figure is a change of source, not news;
 * - rows that joined or left the post (TVL of at least $10K), with "no data
 *   today" when the protocol has no row at all today.
 * A pool is the same pool on both days when its contract address matches
 * (so the on-chain row and the provider's fallback row for one contract are
 * one pool, though labelled differently), otherwise when its section,
 * protocol and shown asset text match.
 * GRAM-USDT pools are left out: their fee APY swings every day and they carry
 * impermanent loss, so their moves are noise rather than news.
 */

import type { DigestData } from "./message.ts";
import { displayTicker, isHackedProtocol } from "../services/protocols.ts";
import type { PostSnapshot, SectionKey, SnapshotRow } from "../services/post_snapshot.ts";
import { daysBefore } from "../services/post_snapshot.ts";
import type { YieldOpportunity } from "../types/yields.ts";
import { displayText, formatShortDate, LOW_TVL_THRESHOLD, safeText } from "./text.ts";

/** A move must be at least this many APY points... */
const MIN_MOVE_POINTS = 1;
/** ...and at least this share of the old APY */
const MIN_MOVE_SHARE = 0.1;
/** Moves listed by name; the rest are counted */
const MAX_MOVES = 3;
/** Rows listed by name in "Joined" and "Left"; the rest are counted */
const MAX_NAMES = 3;

export interface ApyMove {
  /** Today's row */
  row: SnapshotRow;
  /** The APY the previous post showed */
  from: number;
}

export interface SinceYesterday {
  /** Date of the post compared with (YYYY-MM-DD) */
  since: string;
  /** Date of today's post (YYYY-MM-DD) */
  today: string;
  newlyHacked: SnapshotRow[];
  topEntered: SnapshotRow[];
  topLeft: SnapshotRow[];
  moves: ApyMove[];
  moreMoves: number;
  joined: SnapshotRow[];
  moreJoined: number;
  left: Array<{ row: SnapshotRow; noData: boolean }>;
  moreLeft: number;
}

/** The asset text a row is shown under: "GRAM (tsTON)", "USDT (Main)" */
export function shownAssetText(asset: string, label: string | null): string {
  const base = displayText(displayTicker(asset));
  return label ? `${base} (${displayText(displayTicker(label))})` : base;
}

/** The rows of today's post, as tomorrow's post will compare them */
export function snapshotOf(data: DigestData, date: string): PostSnapshot {
  const rank = new Map(data.top5.map((y, i) => [y, i + 1] as const));
  const rows: SnapshotRow[] = [];
  const done = new Set<YieldOpportunity>();
  const ids = new Set<string>();

  const add = (row: YieldOpportunity, section: SectionKey, label: string | null) => {
    if (done.has(row)) return;
    done.add(row);
    const text = shownAssetText(row.asset, label);
    let id = `${section}|${row.source}|${text}`;
    // Two pools shown under the same text (rare) keep apart by address or position
    if (ids.has(id)) id = `${id}|${row.poolAddress ?? rows.length}`;
    ids.add(id);
    const hacked = isHackedProtocol(row.source);
    rows.push({
      id,
      ...(row.poolAddress && { address: row.poolAddress }),
      section,
      protocol: row.source,
      label: text,
      apy: row.apyTotal,
      tvlUsd: row.tvlHidden || hacked || !Number.isFinite(row.tvlUsd) ? null : row.tvlUsd,
      ...(row.apyEstimate && { estimate: true }),
      ...(row.onChain && { onChain: true }),
      ...(hacked && { hacked: true }),
      ...(rank.has(row) && { top5: rank.get(row) }),
    });
  };

  for (const { row, section, label } of data.shown) add(row, section, label);
  // A TOP-5 row can sit past a section's cap (EVAA shows 3 stablecoin pools):
  // it is still part of what readers saw, in the TOP-5
  for (const row of data.top5) add(row, row.assetType, row.poolMeta);
  return { date, rows };
}

/**
 * Finds a row's counterpart among `rows`: the same section and contract
 * address when the row has one, otherwise the same id (section, protocol and
 * shown text), unless both rows carry different addresses.
 */
function matcher(rows: SnapshotRow[]): (r: SnapshotRow) => SnapshotRow | undefined {
  const byAddress = new Map<string, SnapshotRow>();
  for (const r of rows) if (r.address) byAddress.set(`${r.section}|${r.address}`, r);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return (r) => {
    if (r.address) {
      const hit = byAddress.get(`${r.section}|${r.address}`);
      if (hit) return hit;
    }
    const same = byId.get(r.id);
    if (same && r.address && same.address && same.address !== r.address) return undefined;
    return same;
  };
}

/** Large enough to report: TVL known and at least $10K, not hacked */
function sizable(r: SnapshotRow): boolean {
  return r.tvlUsd !== null && r.tvlUsd >= LOW_TVL_THRESHOLD && !r.hacked;
}

const tracked = (r: SnapshotRow) => r.section !== "TON_USDT";

/** Compare the previous post with today's */
export function compareSnapshots(previous: PostSnapshot, today: PostSnapshot): SinceYesterday {
  const inPrevious = matcher(previous.rows);
  const inToday = matcher(today.rows);

  // Protocols flagged as hacked today that the previous post showed unflagged
  const wasClean = new Set(previous.rows.filter((r) => !r.hacked).map((r) => r.protocol));
  const flagged = new Set<string>();
  const newlyHacked = today.rows.filter((r) => {
    if (!r.hacked || !wasClean.has(r.protocol) || flagged.has(r.protocol)) return false;
    flagged.add(r.protocol);
    return true;
  });

  // TOP-5 changes, only when the previous post recorded its TOP-5
  const prevTop = previous.rows.filter((r) => r.top5 !== undefined);
  const todayTop = today.rows.filter((r) => r.top5 !== undefined);
  const byRank = (a: SnapshotRow, b: SnapshotRow) => (a.top5 ?? 0) - (b.top5 ?? 0);
  const topEntered = prevTop.length > 0 ? todayTop.filter((r) => inPrevious(r)?.top5 === undefined).sort(byRank) : [];
  const topLeft = prevTop.length > 0 ? prevTop.filter((r) => inToday(r)?.top5 === undefined).sort(byRank) : [];

  // APY moves of rows shown both days, measured the same way both days
  const allMoves: ApyMove[] = [];
  for (const row of today.rows) {
    const old = inPrevious(row);
    if (!old || !tracked(row) || row.estimate || old.estimate) continue;
    if (Boolean(row.onChain) !== Boolean(old.onChain)) continue;
    if (!sizable(row) || !sizable(old)) continue;
    if (!Number.isFinite(row.apy) || !Number.isFinite(old.apy)) continue;
    const delta = Math.abs(row.apy - old.apy);
    if (delta >= MIN_MOVE_POINTS && delta >= MIN_MOVE_SHARE * Math.abs(old.apy)) {
      allMoves.push({ row, from: old.apy });
    }
  }
  allMoves.sort((a, b) => Math.abs(b.row.apy - b.from) - Math.abs(a.row.apy - a.from));

  // Rows that joined or left the post
  const byTvl = (a: SnapshotRow, b: SnapshotRow) => (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0);
  const allJoined = today.rows.filter((r) => !inPrevious(r) && tracked(r) && sizable(r)).sort(byTvl);
  const protocolsToday = new Set(today.rows.map((r) => r.protocol));
  const allLeft = previous.rows.filter((r) => !inToday(r) && tracked(r) && sizable(r)).sort(byTvl);

  return {
    since: previous.date,
    today: today.date,
    newlyHacked,
    topEntered,
    topLeft,
    moves: allMoves.slice(0, MAX_MOVES),
    moreMoves: Math.max(0, allMoves.length - MAX_MOVES),
    joined: allJoined.slice(0, MAX_NAMES),
    moreJoined: Math.max(0, allJoined.length - MAX_NAMES),
    left: allLeft.slice(0, MAX_NAMES).map((row) => ({ row, noData: !protocolsToday.has(row.protocol) })),
    moreLeft: Math.max(0, allLeft.length - MAX_NAMES),
  };
}

/** True when nothing worth a line changed */
export function isQuiet(s: SinceYesterday): boolean {
  return s.newlyHacked.length === 0 && s.topEntered.length === 0 && s.topLeft.length === 0 &&
    s.moves.length === 0 && s.joined.length === 0 && s.left.length === 0;
}

/** "Since yesterday" when the previous post was yesterday's, else "Since Nov 25" */
export function sinceTitle(s: SinceYesterday): string {
  return s.since === daysBefore(s.today, 1) ? "Since yesterday" : `Since ${formatShortDate(s.since)}`;
}

const pct = (apy: number) => `${apy.toFixed(1)}%`;
const name = (r: SnapshotRow) => `<b>${safeText(r.protocol)}</b> ${safeText(r.label)}`;
const more = (n: number) => (n > 0 ? ` (+${n} more)` : "");

/** The block's lines as Telegram HTML (shared by the classic and rich posts) */
export function sinceLines(s: SinceYesterday): string[] {
  const lines: string[] = [];
  for (const r of s.newlyHacked) {
    lines.push(`🚨 <b>${safeText(r.protocol)}</b> is now flagged as hacked and kept out of the TOP-5`);
  }
  const top: string[] = [];
  if (s.topEntered.length > 0) top.push(`${s.topEntered.map((r) => `${name(r)} at #${r.top5}`).join(", ")} in`);
  if (s.topLeft.length > 0) top.push(`${s.topLeft.map(name).join(", ")} out`);
  if (top.length > 0) lines.push(`🏆 TOP-5: ${top.join(" · ")}`);
  s.moves.forEach((m, i) => {
    const arrow = m.row.apy > m.from ? "📈" : "📉";
    const tail = i === s.moves.length - 1 ? more(s.moreMoves) : "";
    lines.push(`${arrow} ${name(m.row)}: ${pct(m.from)} → ${pct(m.row.apy)}${tail}`);
  });
  if (s.joined.length > 0) {
    lines.push(`➕ Joined the post: ${s.joined.map((r) => `${name(r)} ${pct(r.apy)}${r.estimate ? " est." : ""}`).join(", ")}${more(s.moreJoined)}`);
  }
  if (s.left.length > 0) {
    lines.push(`➖ Left the post: ${s.left.map(({ row, noData }) => `${name(row)}${noData ? " (no data today)" : ""}`).join(", ")}${more(s.moreLeft)}`);
  }
  if (lines.length === 0) {
    lines.push("Quiet day: no notable changes since the last post.");
  }
  return lines;
}

/** The block for the classic post: a heading and a plain (always open) quote */
export function formatSinceClassic(s: SinceYesterday, separator: string): string {
  return `${separator}\n<b>🔁 ${sinceTitle(s).toUpperCase()}</b>\n<blockquote>${sinceLines(s).join("\n")}</blockquote>`;
}

/** The block for the rich post: a heading and a list */
export function formatSinceRich(s: SinceYesterday): string {
  return `<h4>🔁 ${sinceTitle(s)}</h4>\n<ul>${sinceLines(s).map((l) => `<li>${l}</li>`).join("")}</ul>`;
}

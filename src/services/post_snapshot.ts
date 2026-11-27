/**
 * What each day's post showed, kept per channel so the next post can say
 * what changed "since yesterday" (src/formatters/since_yesterday.ts). One
 * entry per channel and UTC date, written only after Telegram accepted the
 * post, so a failed run never becomes the comparison point. Test posts use
 * their own channel key and never touch the real channel's entries.
 */

import { openKv } from "./kv.ts";

/** The post section a row was shown in */
export type SectionKey = "TON" | "STABLE" | "TON_USDT" | "BTC" | "ETH";

/** One row as readers saw it */
export interface SnapshotRow {
  /**
   * Section, protocol and the asset text as shown: "TON|Tonstakers|GRAM (tsTON)".
   * Unique within one snapshot (a second row with the same text gets a suffix).
   */
  id: string;
  /**
   * The pool's contract address, when the source gives one. Rows with an
   * address are matched across days by it, so an on-chain row and the
   * provider's fallback row for the same contract count as one pool even
   * though they are labelled differently.
   */
  address?: string;
  section: SectionKey;
  protocol: string;
  /** The asset text as shown, e.g. "GRAM (tsTON)" or "USDT vault" */
  label: string;
  apy: number;
  /** null when the post showed no TVL (unknown, or a hacked protocol) */
  tvlUsd: number | null;
  /** The APY was the pool's own estimate ("est.") */
  estimate?: boolean;
  /** The APY was measured from the contract (onchain.ts), not taken from a data provider */
  onChain?: boolean;
  hacked?: boolean;
  /** Place in the TOP-5 (1-5), when the row was there */
  top5?: number;
}

export interface PostSnapshot {
  /** UTC date of the post (YYYY-MM-DD) */
  date: string;
  rows: SnapshotRow[];
}

const PREFIX = ["post_snapshot"];
/** Entries older than this are dropped by Deno KV */
const KEEP_MS = 30 * 86_400_000;
/** A post older than this is too old to compare with */
const MAX_AGE_DAYS = 7;

/** The UTC date `days` days before `date` (both YYYY-MM-DD) */
export function daysBefore(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * The newest saved post of `channel` dated before `today` and at most
 * MAX_AGE_DAYS old, or null when there is none.
 */
export async function loadPreviousSnapshot(channel: string, today: string): Promise<PostSnapshot | null> {
  const kv = await openKv();
  try {
    const oldest = daysBefore(today, MAX_AGE_DAYS);
    let best: PostSnapshot | null = null;
    for await (const entry of kv.list<PostSnapshot>({ prefix: [...PREFIX, channel] })) {
      const value = entry.value;
      if (!value || typeof value.date !== "string" || !Array.isArray(value.rows)) continue;
      if (value.date >= today || value.date < oldest) continue;
      if (!best || value.date > best.date) best = value;
    }
    return best;
  } finally {
    kv.close();
  }
}

/** Save what today's post of `channel` showed (a second post the same day replaces it) */
export async function savePostSnapshot(channel: string, snapshot: PostSnapshot): Promise<void> {
  const kv = await openKv();
  try {
    await kv.set([...PREFIX, channel, snapshot.date], snapshot, { expireIn: KEEP_MS });
  } finally {
    kv.close();
  }
}

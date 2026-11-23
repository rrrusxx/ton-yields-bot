/**
 * Once-per-day guard. Several runs can start on the same day: the outside
 * scheduler at 08:00 UTC and its 08:30 retry, GitHub's late fallback
 * schedule, a manual run. Only the first run that gets its post out marks
 * the day, and later runs stop before building a post. Days are UTC dates,
 * kept per channel, so test posts never block the real one.
 */

import { openKv } from "./kv.ts";

const PREFIX = ["posted"];
/** Markers older than this are dropped by Deno KV */
const KEEP_MS = 30 * 86_400_000;

/** The UTC date (YYYY-MM-DD) a run belongs to */
export function utcDate(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** True when a post to `channel` already went out on `date` */
export async function wasPostedOn(channel: string, date: string): Promise<boolean> {
  const kv = await openKv();
  try {
    return (await kv.get([...PREFIX, channel, date])).value !== null;
  } finally {
    kv.close();
  }
}

/** Mark that a post to `channel` went out on `date` */
export async function markPosted(channel: string, date: string, at = new Date()): Promise<void> {
  const kv = await openKv();
  try {
    await kv.set([...PREFIX, channel, date], at.toISOString(), { expireIn: KEEP_MS });
  } finally {
    kv.close();
  }
}

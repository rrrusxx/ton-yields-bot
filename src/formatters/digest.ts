/**
 * Builds the day's post in both formats from one set of data: the classic
 * post (sendMessage, Telegram HTML, 4,096 characters) and the rich message
 * (sendRichMessage, Rich HTML, 32,768 characters), plus the snapshot of what
 * the post shows, which tomorrow's "Since yesterday" block compares with.
 */

import type { GroupedYields } from "../types/yields.ts";
import type { PostSnapshot } from "../services/post_snapshot.ts";
import { type DigestData, prepareDigest, renderClassic, SEPARATOR } from "./message.ts";
import { renderRich } from "./rich_message.ts";
import { compareSnapshots, formatSinceClassic, formatSinceRich, type SinceYesterday, snapshotOf } from "./since_yesterday.ts";

/** Telegram's limit for a text message, counted after the HTML is parsed */
export const CLASSIC_LIMIT = 4096;

export interface Digest {
  /** The classic post: Telegram HTML for sendMessage */
  html: string;
  /** The same post as Rich HTML for sendRichMessage */
  richHtml: string;
  /** What the post shows, saved after a successful send */
  snapshot: PostSnapshot;
  /** The "Since yesterday" comparison, when there was a previous post */
  since: SinceYesterday | null;
  /** The data both formats were built from */
  data: DigestData;
}

export interface DigestOptions {
  /** UTC date of the post (YYYY-MM-DD) */
  today: string;
  /** The channel's previous post, or null (no "Since yesterday" block then) */
  previous: PostSnapshot | null;
  now?: Date;
}

/**
 * Length of a Telegram HTML message as Telegram counts it: tags removed and
 * entities decoded, in UTF-16 code units (an emoji counts as 2, which errs on
 * the safe side).
 */
export function visibleLength(html: string): number {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&(lt|gt|amp|quot|#\d+);/g, "x")
    .length;
}

/**
 * The classic post with the "Since yesterday" block, or without it when the
 * block would push the post past Telegram's limit: the block is news, not
 * data, so it goes first rather than letting Telegram refuse the whole post.
 */
export function classicPost(data: DigestData, since: SinceYesterday | null): string {
  const html = renderClassic(data, since ? formatSinceClassic(since, SEPARATOR) : "");
  if (since && visibleLength(html) > CLASSIC_LIMIT) {
    console.warn(`The classic post would be ${visibleLength(html)} characters; sending it without "Since yesterday"`);
    return renderClassic(data);
  }
  return html;
}

export async function buildDigest(yields: GroupedYields, options: DigestOptions): Promise<Digest> {
  const data = await prepareDigest(yields, options.now);
  const snapshot = snapshotOf(data, options.today);
  const since = options.previous ? compareSnapshots(options.previous, snapshot) : null;
  const html = classicPost(data, since);
  const richHtml = renderRich(data, since ? formatSinceRich(since) : "");
  return { html, richHtml, snapshot, since, data };
}

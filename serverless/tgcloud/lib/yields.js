// Pure helpers for the handlers. They turn the main bot's post snapshot
// (src/services/post_snapshot.ts: what the daily post showed, row by row)
// into the compact rows the widget draws and the text of per-user answers.
// Nothing here imports 'sdk', so the repository's Deno tests can load it.

/** The sections the widget and the channel buttons offer (GRAM-USDT pools carry impermanent loss and stay in the post) */
export const SECTIONS = {
  TON: '💎 GRAM Yields',
  STABLE: '💵 USDT Yields',
};

export const CHANNEL_URL = 'https://t.me/ton_yields_daily';

/** A widget's state and a widget answer are each at most this many UTF-8 bytes */
export const MAX_DATA_BYTES = 1024;

/**
 * Rows a tab shows at most: nothing scrolls inside a widget and its height
 * stops at 600 px, so the rest are counted ("+N more in the post")
 */
export const MAX_ROWS = 12;

/** Rows under this TVL are flagged, as in the post */
const LOW_TVL = 10_000;

const utf8Length = (s) => new TextEncoder().encode(s).length;

/** "Nov 27, 2026" for a YYYY-MM-DD date */
export function dateLabel(date) {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return String(date);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/** "$1.6M", "$36.5K"; empty when the TVL is unknown */
export function tvlLabel(tvl) {
  if (tvl === null || tvl === undefined || !Number.isFinite(tvl)) return '';
  if (tvl >= 1e9) return `$${(tvl / 1e9).toFixed(1)}B`;
  if (tvl >= 1e6) return `$${(tvl / 1e6).toFixed(1)}M`;
  if (tvl >= 1e3) return `$${(tvl / 1e3).toFixed(1)}K`;
  return `$${tvl.toFixed(0)}`;
}

/**
 * One row as the widget draws it: [protocol, asset, APY, TVL, flags].
 * Flags: "e" the APY is the pool's own estimate, "w" TVL under $10K,
 * "h" a hacked protocol (no TVL shown).
 */
export function compactRow(r) {
  let flags = '';
  if (r.estimate) flags += 'e';
  if (r.hacked) flags += 'h';
  else if (r.tvlUsd !== null && r.tvlUsd !== undefined && r.tvlUsd < LOW_TVL) flags += 'w';
  return [r.protocol, r.label, Math.round(r.apy * 10) / 10, r.hacked ? '' : tvlLabel(r.tvlUsd), flags];
}

/** The post's TOP-5, in its order */
export function topRows(snapshot) {
  return snapshot.rows.filter((r) => r.top5).sort((a, b) => a.top5 - b.top5);
}

/** One section's rows, highest APY first */
export function sectionRows(snapshot, section) {
  return snapshot.rows
    .filter((r) => r.section === section && Number.isFinite(r.apy))
    .sort((a, b) => b.apy - a.apy);
}

/**
 * Rows packed as the widget's JSON: {"d": date, "r": rows, "m": rows left
 * out}. Keeps at most MAX_ROWS rows, and only as many as fit in 1,024 bytes.
 */
export function pack(snapshot, rows) {
  const d = dateLabel(snapshot.date);
  const all = rows.map(compactRow);
  for (let n = Math.min(all.length, MAX_ROWS); n > 0; n--) {
    const json = JSON.stringify({ d, r: all.slice(0, n), m: all.length - n });
    if (utf8Length(json) <= MAX_DATA_BYTES) return json;
  }
  return JSON.stringify({ d, r: [], m: all.length });
}

/** The widget's shared state when it is sent: the TOP-5 and the date */
export function topData(snapshot) {
  return pack(snapshot, topRows(snapshot));
}

/** The answer to a widget request ("s:top", "s:TON", "s:STABLE"), or null for anything else */
export function answerFor(snapshot, data) {
  if (data === 's:top') return topData(snapshot);
  const m = /^s:(TON|STABLE)$/.exec(String(data ?? ''));
  return m ? pack(snapshot, sectionRows(snapshot, m[1])) : null;
}

const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The per-user answer to a channel button: one section as Telegram HTML */
export function sectionMessage(snapshot, section) {
  const lines = [`<b>${SECTIONS[section]}</b> · ${dateLabel(snapshot.date)}`, ''];
  for (const r of sectionRows(snapshot, section)) {
    const [protocol, label, apy, tvl, flags] = compactRow(r);
    const tvlPart = flags.includes('h') ? ' 🚨' : tvl ? ` | ${tvl}${flags.includes('w') ? ' ⚠️' : ''}` : '';
    lines.push(`<b>${escapeHtml(protocol)}</b> ${escapeHtml(label)}: ${apy.toFixed(1)}%${flags.includes('e') ? ' est.' : ''}${tvlPart}`);
  }
  lines.push('', `Every pool with its 7-day value and link: ${CHANNEL_URL}`);
  return lines.join('\n');
}

/** The caption under the widget: what the chat list and apps without widgets show */
export function widgetCaption(snapshot) {
  const top = topRows(snapshot)[0];
  const lead = top ? ` Top today: ${top.protocol} ${top.label}, ${top.apy.toFixed(1)}% APY.` : '';
  return `GRAM (TON) yields, ${dateLabel(snapshot.date)}.${lead} Every pool: ${CHANNEL_URL}`;
}

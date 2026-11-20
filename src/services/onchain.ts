/**
 * Own on-chain engine for liquid staking tokens (LSTs).
 *
 * For every LST the contract holds GRAM and has issued tokens; their ratio
 * (rate = GRAM / tokens) only grows when stakers are paid, after the
 * protocol's commission. The realized APY over a window is therefore
 *
 *   APY = (rate_now / rate_then) ^ (one year / window) - 1
 *
 * which is net of all protocol fees by construction. rate_then is read from
 * the same contract at an older masterchain block (toncenter v2 runGetMethod
 * with `seqno`, served by archival liteservers), so no history of our own is
 * needed.
 *
 * Two windows, both whole cycles of 2 validation rounds (pools pay every
 * round or every other round, so a window of whole cycles normally holds the
 * same number of payouts):
 * - the post's APY: the last cycle (131072 s, about 1.5 days);
 * - the post's "7d" value: the last 5 cycles (about 7.6 days).
 * Payouts of KTON and Bemo drift up to about 13 minutes around the cycle, so
 * now and then a window catches one payout too many or too few. reconcile()
 * compares the two windows; it catches a miscount at the start of the
 * one-cycle window, but not one at "now", which both windows share (about
 * 0.1% of runs per KTON or Bemo token, value off by about 20%). Aligning the
 * windows to the validation round would remove it; see ROADMAP.
 *
 * Fail closed: an unknown get-method layout, a rate that did not grow or an
 * APY outside 0-40% rejects that window; an LST with no usable window keeps
 * the Swap.coffee row (with its Palette override). The whole engine stops
 * after ENGINE_TIME_LIMIT_MS, so a slow toncenter day never delays the post.
 */

import type { YieldOpportunity } from "../types/yields.ts";
import { getProtocolUrl } from "./protocols.ts";
import { fetchGramPriceUsd } from "./prices.ts";

const TONCENTER_V2 = "https://toncenter.com/api/v2";

/** validators_elected_for (config param 15): one validation round */
export const ROUND_SECONDS = 65_536;
/** Pools lend through two interleaved chains of rounds */
export const CYCLE_SECONDS = 2 * ROUND_SECONDS;
/** Window of the post's "7d" value: 5 cycles, about 7.6 days */
export const WINDOW_SECONDS = 5 * CYCLE_SECONDS;
const YEAR_SECONDS = 365 * 24 * 3600;

/** Plausible LST APY range; anything outside is treated as a bad read */
const MAX_LST_APY = 40;

/** The engine gives up after this and leaves every LST to the fallback */
export const ENGINE_TIME_LIMIT_MS = 120_000;

/**
 * Relative gap between the one-cycle and the 5-cycle APY above which the
 * one-cycle value counted a payout too many or too few (it then doubles,
 * halves or moves by half; normal gaps are a few percent).
 */
export const CYCLE_MISCOUNT_GAP = 0.35;
/**
 * Relative gap above which the 5-cycle value is not shown as "7d": one payout
 * more or less moves it by 10-20%, and real weekly changes are smaller.
 */
export const WEEK_MISCOUNT_GAP = 0.08;

/** Archival reads that fail step this many blocks forward, one try each */
const ARCHIVE_STEPS = [0, 3, 50, 250];

type StackEntry = [string, unknown];

interface RateSnapshot {
  /** GRAM (nano) backing the issued tokens */
  coins: bigint;
  /** LST tokens (nano) issued */
  tokens: bigint;
}

export interface LstSpec {
  /** Display name, the same as the Swap.coffee rows it replaces */
  source: string;
  /** Asset and label, the same as the Swap.coffee rows */
  asset: string;
  poolMeta: string;
  /** URL key for getProtocolUrl */
  urlKey: string;
  /** Contract read by the engine; Swap.coffee reports the same address */
  address: string;
  method: string;
  extract(stack: StackEntry[]): RateSnapshot;
}

function num(entry: StackEntry | undefined, label: string): bigint {
  if (!entry || entry[0] !== "num") {
    throw new Error(`expected a number for ${label}, got ${entry?.[0] ?? "nothing"}`);
  }
  const text = String(entry[1]);
  return text.startsWith("-") ? -BigInt(text.slice(1)) : BigInt(text);
}

/**
 * get_pool_full_data of the ton-blockchain liquid staking contract
 * (Tonstakers, Stakee) and its KTON fork. The layout is told apart by the
 * number of values; anything else fails closed.
 */
function liquidStakingPool(stack: StackEntry[]): RateSnapshot {
  const supplyIndex: Record<number, number> = { 30: 13, 34: 17 };
  const index = supplyIndex[stack.length];
  if (index === undefined) {
    throw new Error(`unknown get_pool_full_data layout: ${stack.length} values`);
  }
  return { coins: num(stack[2], "total_balance"), tokens: num(stack[index], "supply") };
}

/** Bemo get_full_data (v1 and v2 return 15 values): [0] jetton_total_supply, [1] ton_total_supply */
function bemoFinancial(stack: StackEntry[]): RateSnapshot {
  if (stack.length !== 15) throw new Error(`unknown get_full_data layout: ${stack.length} values`);
  return { tokens: num(stack[0], "jetton_total_supply"), coins: num(stack[1], "ton_total_supply") };
}

/** Hipo get_treasury_state (append-only tuple, 31 values in Nov 2026): [0] total_coins, [1] total_tokens */
function hipoTreasury(stack: StackEntry[]): RateSnapshot {
  if (stack.length < 31) throw new Error(`unknown get_treasury_state layout: ${stack.length} values`);
  return { coins: num(stack[0], "total_coins"), tokens: num(stack[1], "total_tokens") };
}

export const LSTS: LstSpec[] = [
  {
    source: "Tonstakers", asset: "GRAM-tsTON", poolMeta: "tsTON", urlKey: "tonstakers",
    address: "EQCkWxfyhAkim3g2DjKQQg8T5P4g-Q1-K_jErGcDJZ4i-vqR", method: "get_pool_full_data",
    extract: liquidStakingPool,
  },
  {
    source: "Stakee", asset: "GRAM", poolMeta: "STAKED", urlKey: "stakee",
    address: "EQD2_4d91M4TVbEBVyBF8J1UwpMJc361LKVCz6bBlffMW05o", method: "get_pool_full_data",
    extract: liquidStakingPool,
  },
  {
    source: "Hipo", asset: "GRAM-hGRAM", poolMeta: "hGRAM", urlKey: "hipo",
    address: "EQCLyZHP4Xe8fpchQz76O-_RmUhaVc_9BAoGyJrwJrcbz2eZ", method: "get_treasury_state",
    extract: hipoTreasury,
  },
  {
    source: "KTON", asset: "GRAM", poolMeta: "KTON", urlKey: "kton",
    address: "EQA9HwEZD_tONfVz6lJS0PVKR5viEiEGyj9AuQewGQVnXPg0", method: "get_pool_full_data",
    extract: liquidStakingPool,
  },
  {
    source: "Bemo", asset: "GRAM-stTON", poolMeta: "stTON", urlKey: "bemo",
    address: "EQDNhy-nxYFgUqzfUzImBEP67JqsyMIcyk2S5_RwNNEYku0k", method: "get_full_data",
    extract: bemoFinancial,
  },
  {
    source: "Bemo", asset: "GRAM-bmTON", poolMeta: "bmTON", urlKey: "bemo",
    address: "EQCSxGZPHqa3TtnODgMan8CEM0jf6HpY-uon_NMeFgjKqkEY", method: "get_full_data",
    extract: bemoFinancial,
  },
];

// ------------------------------------------------------------------ toncenter

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function apiKey(): string | undefined {
  return Deno.env.get("TONCENTER_API_KEY") || undefined;
}

/** Wall-clock deadline of the current engine run (ms); none outside a run */
let deadlineMs = Number.POSITIVE_INFINITY;

function checkDeadline(): void {
  if (Date.now() > deadlineMs) throw new Error("on-chain engine time limit reached");
}

let lastCall = 0;

/** toncenter allows about 1 request per second without a key, 10 with one */
async function throttle(): Promise<void> {
  const interval = apiKey() ? 120 : 1100;
  const wait = lastCall + interval - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
}

async function toncenter<T>(path: string, init: RequestInit = {}, attempt = 0): Promise<T> {
  await throttle();
  checkDeadline();
  const key = apiKey();
  const name = `toncenter ${path.split("?")[0]}`;
  let response: Response;
  try {
    response = await fetch(`${TONCENTER_V2}/${path}`, {
      ...init,
      headers: { ...(init.headers as Record<string, string> ?? {}), ...(key ? { "X-API-Key": key } : {}) },
      redirect: "error", // never send the key to another host
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    if (attempt < 2) {
      await sleep(1000 * (attempt + 1));
      return toncenter(path, init, attempt + 1);
    }
    throw error;
  }
  const text = await response.text();
  let body: { ok?: boolean; result?: T; error?: unknown } | null = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  if (response.ok && body?.ok) return body.result as T;
  const message = String(body?.error ?? text.slice(0, 200));
  // Archival "cannot load state" answers come as HTTP 500 with a LITE_SERVER
  // error. Asking the same block again does not help: the caller steps on.
  if (message.includes("LITE_SERVER")) throw new Error(`${name}: ${message}`);
  if ((response.status === 429 || response.status >= 500) && attempt < 2) {
    await sleep(1500 * (attempt + 1));
    return toncenter(path, init, attempt + 1);
  }
  throw new Error(`${name}: HTTP ${response.status} ${message}`);
}

interface Block {
  seqno: number;
  /** Block time, unix seconds */
  time: number;
}

async function blockTime(seqno: number): Promise<number> {
  const shard = "workchain=-1&shard=-9223372036854775808";
  const header = await toncenter<{ gen_utime: number }>(`getBlockHeader?${shard}&seqno=${seqno}`);
  return header.gen_utime;
}

/** First masterchain block at or after `unixtime`, with its time */
async function masterBlockAt(unixtime: number): Promise<Block> {
  const shard = "workchain=-1&shard=-9223372036854775808";
  const block = await toncenter<{ seqno: number }>(`lookupBlock?${shard}&unixtime=${Math.floor(unixtime)}`);
  return { seqno: block.seqno, time: await blockTime(block.seqno) };
}

async function getMethod(address: string, method: string, seqno?: number): Promise<StackEntry[]> {
  const result = await toncenter<{ exit_code: number; stack: StackEntry[] }>("runGetMethod", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, method, stack: [], ...(seqno === undefined ? {} : { seqno }) }),
  });
  if (result.exit_code !== 0) throw new Error(`${method} exit code ${result.exit_code}`);
  return result.stack;
}

/**
 * Read a contract at a past block. Archival liteservers now and then cannot
 * load one block; a block a little later is just as good for a window of
 * days, so step forward, and use the real time of the block that answered.
 */
async function readAt(spec: LstSpec, block: Block): Promise<{ snapshot: RateSnapshot; time: number }> {
  let lastError: unknown;
  for (const step of ARCHIVE_STEPS) {
    const seqno = block.seqno + step;
    try {
      const snapshot = spec.extract(await getMethod(spec.address, spec.method, seqno));
      return { snapshot, time: step === 0 ? block.time : await blockTime(seqno) };
    } catch (error) {
      lastError = error;
      if (!String((error as Error).message).includes("LITE_SERVER")) throw error;
    }
  }
  throw lastError;
}

// ------------------------------------------------------------------ engine

const rateOf = (snapshot: RateSnapshot) => Number(snapshot.coins) / Number(snapshot.tokens);

/** Realized APY in % from two rates `seconds` apart; null when implausible */
export function realizedApy(rateThen: number, rateNow: number, seconds: number): number | null {
  if (!(rateThen > 0) || !(rateNow > rateThen) || !(seconds > 0)) return null;
  const apy = (Math.pow(rateNow / rateThen, YEAR_SECONDS / seconds) - 1) * 100;
  return Number.isFinite(apy) && apy > 0 && apy <= MAX_LST_APY ? apy : null;
}

/**
 * Choose the post's APY and "7d" value from the one-cycle and 5-cycle
 * readings. A one-cycle reading far from the week counted a payout too many
 * or too few, so the week stands in for both. A week reading moderately far
 * from the cycle may be off by one payout, so no "7d" value is shown.
 */
export function reconcile(
  current: number | null,
  week: number | null,
): { apy: number; apy7d?: number; note?: string } | null {
  if (current === null && week === null) return null;
  if (current === null) return { apy: week!, apy7d: week!, note: "no usable one-cycle reading" };
  // Without the week nothing can vouch for the one-cycle value: fall back
  if (week === null) return null;
  const gap = Math.abs(current - week) / week;
  if (gap > CYCLE_MISCOUNT_GAP) {
    return { apy: week, apy7d: week, note: `one-cycle ${current.toFixed(2)}% vs 5-cycle ${week.toFixed(2)}%, used the 5-cycle value` };
  }
  if (gap > WEEK_MISCOUNT_GAP) {
    return { apy: current, note: `one-cycle ${current.toFixed(2)}% vs 5-cycle ${week.toFixed(2)}%, 7d not shown` };
  }
  return { apy: current, apy7d: week };
}

export interface OnchainLstResult {
  spec: LstSpec;
  /** The post's APY (normally the last cycle) */
  apy: number;
  /** The post's "7d" value (the last 5 cycles); absent when not trustworthy */
  apy7d?: number;
  /** GRAM staked in the contract now */
  stakedGram: number;
}

async function pastBlock(label: string, unixtime: number): Promise<Block | null> {
  let lastError: unknown;
  // A LITE_SERVER answer is retried for a block a few seconds later (the lookup version of stepping)
  for (const shift of [0, 5, 30]) {
    try {
      return await masterBlockAt(unixtime + shift);
    } catch (error) {
      lastError = error;
      if (!String((error as Error).message).includes("LITE_SERVER")) break;
    }
  }
  console.warn(`  ↳ On-chain: no ${label} block (${(lastError as Error).message})`);
  return null;
}

/** Current state, with one retry on a LITE_SERVER answer */
async function readNow(spec: LstSpec): Promise<RateSnapshot> {
  try {
    return spec.extract(await getMethod(spec.address, spec.method));
  } catch (error) {
    if (!String((error as Error).message).includes("LITE_SERVER")) throw error;
    return spec.extract(await getMethod(spec.address, spec.method));
  }
}

async function windowApy(spec: LstSpec, block: Block | null, rateNow: number, nowTime: number, label: string) {
  if (!block) return null;
  try {
    const { snapshot, time } = await readAt(spec, block);
    return realizedApy(rateOf(snapshot), rateNow, nowTime - time);
  } catch (error) {
    console.warn(`  ↳ On-chain ${spec.source} ${spec.poolMeta}: ${label} read failed (${(error as Error).message})`);
    return null;
  }
}

/**
 * Realized APY of every LST over the last cycle and the last 5 cycles. Each
 * window can fail on its own; an LST with no usable window, or whose current
 * state cannot be read, is left out (and logged).
 */
export async function computeLstApys(specs: LstSpec[] = LSTS): Promise<OnchainLstResult[]> {
  const start = Date.now() / 1000;
  const cycleAgo = await pastBlock("one-cycle", start - CYCLE_SECONDS);
  const weekAgo = await pastBlock("5-cycle", start - WINDOW_SECONDS);
  if (!cycleAgo && !weekAgo) throw new Error("no past block available");

  const results: OnchainLstResult[] = [];
  for (const spec of specs) {
    const label = `${spec.source} ${spec.poolMeta}`;
    let now: RateSnapshot;
    try {
      now = await readNow(spec);
    } catch (error) {
      console.warn(`  ↳ On-chain ${label}: ${(error as Error).message}; left to the fallback source`);
      continue;
    }
    const nowTime = Date.now() / 1000;
    const rateNow = rateOf(now);
    const current = await windowApy(spec, cycleAgo, rateNow, nowTime, "one-cycle");
    const week = await windowApy(spec, weekAgo, rateNow, nowTime, "5-cycle");
    const chosen = reconcile(current, week);
    if (!chosen) {
      console.warn(`  ↳ On-chain ${label}: no plausible reading, left to the fallback source`);
      continue;
    }
    if (chosen.note) console.warn(`  ↳ On-chain ${label}: ${chosen.note}`);
    results.push({ spec, apy: chosen.apy, apy7d: chosen.apy7d, stakedGram: Number(now.coins) / 1e9 });
  }
  return results;
}

/**
 * LST rows computed from the contracts, ready to replace the Swap.coffee rows
 * of the same LSTs. TVL = GRAM staked x GRAM price (hidden when there is no
 * price; preferOnchain then keeps the fallback row's TVL). Returns [] when
 * the chain cannot be read or the time limit is reached.
 */
export async function fetchOnchainLstYields(): Promise<YieldOpportunity[]> {
  console.log("Computing LST yields on-chain (toncenter)...");
  deadlineMs = Date.now() + ENGINE_TIME_LIMIT_MS;
  let timedOut = false;
  let timer: number | undefined;
  const timeLimit = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ENGINE_TIME_LIMIT_MS);
  });
  try {
    const work = Promise.all([computeLstApys(), fetchGramPriceUsd()]);
    const outcome = await Promise.race([work, timeLimit]);
    if (outcome === null) {
      console.warn(`On-chain LST engine hit its ${ENGINE_TIME_LIMIT_MS / 1000} s limit, keeping the fallback sources`);
      timedOut = true;
      // The abandoned run stops at its next toncenter call (the deadline
      // stays in force until it has settled)
      work.catch(() => {}).finally(() => {
        deadlineMs = Number.POSITIVE_INFINITY;
      });
      return [];
    }
    const [results, gramPriceUsd] = outcome;
    const yields = results.map(({ spec, apy, apy7d, stakedGram }): YieldOpportunity => ({
      assetType: "TON",
      source: spec.source,
      sourceUrl: getProtocolUrl(spec.urlKey),
      asset: spec.asset,
      poolMeta: spec.poolMeta,
      apyBase: apy,
      apyReward: null,
      apyTotal: apy,
      ...(apy7d !== undefined && { apy7d }),
      tvlUsd: gramPriceUsd === null ? 0 : stakedGram * gramPriceUsd,
      ...(gramPriceUsd === null && { tvlHidden: true }),
      onChain: true,
      poolAddress: spec.address,
    }));
    for (const y of yields) {
      const week = y.apy7d === undefined ? "7d not shown" : `7d ${y.apy7d.toFixed(2)}%`;
      console.log(`  ↳ On-chain ${y.source} ${y.poolMeta}: ${y.apyTotal.toFixed(2)}% APY, ${week}`);
    }
    console.log(`Computed ${yields.length}/${LSTS.length} LST yields on-chain`);
    return yields;
  } catch (error) {
    console.error("On-chain LST engine failed, keeping the fallback sources:", error);
    return [];
  } finally {
    clearTimeout(timer);
    if (!timedOut) deadlineMs = Number.POSITIVE_INFINITY;
  }
}

/** Ticker key that survives the TON -> GRAM rename (tsGRAM ~ tsTON, hGRAM ~ hTON) */
function tickerKey(poolMeta: string | null): string {
  const upper = (poolMeta ?? "").toUpperCase();
  return upper.endsWith("GRAM") && upper !== "GRAM" ? `${upper.slice(0, -4)}TON` : upper;
}

/**
 * Replace fallback rows with the on-chain rows of the same LST, matched by
 * contract address or by protocol and ticker (in either ticker generation).
 * Rows without an on-chain counterpart stay untouched. An on-chain row with
 * no price-based TVL takes the replaced row's TVL.
 */
export function preferOnchain(rows: YieldOpportunity[], onchain: YieldOpportunity[]): YieldOpportunity[] {
  const labelKey = (y: YieldOpportunity) => `${y.source}|${tickerKey(y.poolMeta)}`;
  const replaces = (fallback: YieldOpportunity, chain: YieldOpportunity) =>
    (fallback.poolAddress !== undefined && fallback.poolAddress === chain.poolAddress) ||
    labelKey(fallback) === labelKey(chain);

  const kept: YieldOpportunity[] = [];
  const merged = onchain.map((y) => ({ ...y }));
  for (const fallback of rows) {
    const chain = merged.find((y) => replaces(fallback, y));
    if (!chain) {
      kept.push(fallback);
      continue;
    }
    if (Number.isFinite(fallback.apyTotal)) {
      const gap = fallback.apyTotal - chain.apyTotal;
      const note = `  ↳ Cross-check ${chain.source} ${chain.poolMeta}: on-chain ${chain.apyTotal.toFixed(2)}% vs fallback ${fallback.apyTotal.toFixed(2)}%`;
      if (Math.abs(gap) > 1) console.warn(`${note} (differs by ${gap.toFixed(2)} pp)`);
      else console.log(note);
    }
    if (chain.tvlHidden && !fallback.tvlHidden && Number.isFinite(fallback.tvlUsd) && fallback.tvlUsd > 0) {
      chain.tvlUsd = fallback.tvlUsd;
      chain.tvlHidden = false;
    }
  }
  return [...kept, ...merged];
}

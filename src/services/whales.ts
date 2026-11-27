/**
 * TON Whales native staking: the open nominator pools that Tonkeeper users and
 * the Whales app stake in (Tonkeeper Queue #1 and #2, Whales Nominators Queue
 * #1 and #2), shown as one row since 2026-11-27. Together they held about
 * 16.3M GRAM ($15.7M) on 2026-11-26, the largest yield the post was missing.
 *
 * Data: tonapi's staking pools endpoint (Tonkeeper's API). Its APY is the
 * pools' own estimate (the network's expected validator yield minus the pools'
 * 25% fee), not a measured rate, so the row is marked "est." and shows no
 * 7-day value; tonapi is credited in the footer. Withdrawals wait for the end
 * of the pool's validation cycle (about 36 hours).
 *
 * Left out: the Whales Club pools (only for holders of a Whales NFT, per the
 * Whales site) and the private Whales Team pool. wsTON, TON Whales' liquid
 * staking token, is measured from its contract by onchain.ts.
 */

import type { YieldOpportunity } from "../types/yields.ts";
import { fetchGramPriceUsd } from "./prices.ts";
import { getProtocolUrl } from "./protocols.ts";

const TONAPI_STAKING_POOLS = "https://tonapi.io/v2/staking/pools";

/** Raw addresses of the open pools (tonapi and the Whales site, 2026-11-26) */
export const WHALES_OPEN_POOLS: ReadonlySet<string> = new Set([
  "0:00ff9fdd8b3b80d70e8ea734d262f5e1bd4c184c33535bf3190dd67408629e7a", // Tonkeeper Queue #1
  "0:efbc198fdf051c8e85cf6358c77d3e3e7e06f6f788a65581f910774b9c029e7a", // Tonkeeper Queue #2
  "0:a44757069a7b04e393782b4a2d3e5e449f19d16a4986a9e25436e6b97e45a16a", // Whales Nominators Queue #1
  "0:98e0ce936589ce327181425aa2fe7c9e6880752de0457c680fe2e5d0d555a16a", // Whales Nominators Queue #2
]);

/** The fields of a tonapi staking pool that this file reads */
export interface TonapiPool {
  address?: string;
  name?: string;
  implementation?: string;
  /** APY estimate in % */
  apy?: number;
  /** GRAM staked, in nano units */
  total_amount?: number;
}

export interface WhalesSummary {
  /** Stake-weighted APY estimate of the open pools, in % */
  apy: number;
  /** GRAM staked in them */
  stakedGram: number;
  /** How many of the open pools had usable data */
  pools: number;
}

/**
 * Stake-weighted APY and total stake of the open pools. Pools that are not on
 * the list, not of the Whales kind, or have no plausible APY (0-100%) or
 * stake are skipped; null when none is left.
 */
export function summarizeWhalesPools(pools: TonapiPool[]): WhalesSummary | null {
  let staked = 0;
  let weighted = 0;
  let count = 0;
  for (const pool of pools) {
    if (!pool.address || !WHALES_OPEN_POOLS.has(pool.address) || pool.implementation !== "whales") continue;
    const amount = Number(pool.total_amount) / 1e9;
    const apy = Number(pool.apy);
    if (!(amount > 0) || !(apy > 0) || !(apy <= 100)) continue;
    staked += amount;
    weighted += apy * amount;
    count++;
  }
  return count === 0 ? null : { apy: weighted / staked, stakedGram: staked, pools: count };
}

/** The post's row for TON Whales native staking */
export function whalesRow(summary: WhalesSummary, gramPriceUsd: number | null): YieldOpportunity {
  return {
    assetType: "TON",
    source: "TON Whales",
    sourceUrl: getProtocolUrl("ton-whales"),
    asset: "GRAM",
    poolMeta: "native staking",
    apyBase: summary.apy,
    apyReward: null,
    apyTotal: summary.apy,
    tvlUsd: gramPriceUsd === null ? 0 : summary.stakedGram * gramPriceUsd,
    ...(gramPriceUsd === null && { tvlHidden: true }),
    apyEstimate: true,
    footerCredit: { name: "tonapi", url: "https://tonapi.io/" },
  };
}

/**
 * One row for the open TON Whales pools, or none when tonapi fails (the post
 * goes out without it; the failure is logged).
 */
export async function fetchWhalesNativeStaking(): Promise<YieldOpportunity[]> {
  console.log("Fetching TON Whales native staking (tonapi)...");
  try {
    const [pools, gramPriceUsd] = await Promise.all([fetchTonapiPools(), fetchGramPriceUsd()]);
    const summary = summarizeWhalesPools(pools);
    if (!summary) {
      console.warn("TON Whales native staking: no open pool with a usable APY and stake; row left out");
      return [];
    }
    if (summary.pools < WHALES_OPEN_POOLS.size) {
      console.warn(`TON Whales native staking: only ${summary.pools} of ${WHALES_OPEN_POOLS.size} open pools usable`);
    }
    console.log(
      `  ↳ TON Whales native staking: ${summary.apy.toFixed(2)}% APY (pool estimate), ` +
        `${(summary.stakedGram / 1e6).toFixed(2)}M GRAM in ${summary.pools} pools`,
    );
    return [whalesRow(summary, gramPriceUsd)];
  } catch (error) {
    console.warn("TON Whales native staking: request failed:", error instanceof Error ? error.message : error);
    return [];
  }
}

async function fetchTonapiPools(): Promise<TonapiPool[]> {
  const response = await fetch(TONAPI_STAKING_POOLS, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`tonapi HTTP ${response.status} ${response.statusText}`);
  }
  const data = await response.json() as { pools?: unknown };
  return Array.isArray(data?.pools) ? data.pools as TonapiPool[] : [];
}

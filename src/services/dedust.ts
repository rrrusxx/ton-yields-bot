/**
 * DeDust pools from DeDust's own API, the same endpoint DefiLlama's DeDust
 * adaptor reads. Swap.coffee returns an APR of 0 for every DeDust pool, so
 * before 2026-11-20 no DeDust pool ever reached the post.
 *
 * POST https://mainnet.api.dedust.io/v4/api/get_pools
 *   body: { limit, offset, sort_by: "tvl", sort_direction: "desc" }
 *   → { assets_metadata, pool_rows: [{ pools: [...] }], total_count }
 *
 * apr_fees is the liquidity providers' share of the last 24 hours of trading
 * fees, annualised. Pool types differ in what happens to those fees:
 * - Classic (cpmm_v1) and Stable pools: fees are added to the pool and
 *   compound, so the APY is the APR compounded daily (DefiLlama's formula);
 * - CPMM v2 (cpmm_v2): fees accrue separately and must be claimed, so
 *   nothing compounds by itself and the APY equals the APR.
 * DeDust's app shows the APR: Classic rows here are about 1 point above it
 * (equal to DefiLlama), CPMM v2 rows equal it (DefiLlama compounds them too,
 * so it shows CPMM v2 pools higher).
 *
 * Like DefiLlama's DeDust listing, pools under $10K TVL are left out.
 */

import type { YieldOpportunity } from "../types/yields.ts";
import { config } from "../config.ts";
import {
  classifyAsset,
  getProtocolUrl,
  isCorrelatedPair,
  isExcludedAsset,
  isTonUsdtPool,
  pairBelongsToCategory,
} from "./protocols.ts";

const DEDUST_API = "https://mainnet.api.dedust.io/v4/api/get_pools";
const PAGE_SIZE = 100;
const MAX_PAGES = 5;

export interface DedustPool {
  address: string;
  dex: string;
  type?: string;
  verified?: boolean;
  assets: string[];
  tvl_usd: string | number;
  /** Trade fee in hundredths of a percent: "10" = 0.10% */
  trade_fee?: string | number;
  apr_fees?: string | number;
  apr_rewards?: string | number;
}

interface DedustAssetMeta {
  ticker?: string;
  name?: string;
}

interface DedustResponse {
  assets_metadata?: Record<string, DedustAssetMeta>;
  pool_rows?: { tvl_usd?: string | number; pools?: DedustPool[] }[];
}

/** Display labels for DeDust pool types, as DeDust names them */
const POOL_TYPE_LABELS: Record<string, string> = {
  cpmm_v1: "Classic",
  cpmm_v2: "CPMM v2",
  stable: "Stable",
};

/** Pool types whose fees are added to the pool (and so compound) */
const COMPOUNDING_TYPES = new Set(["cpmm_v1", "stable"]);

/** Same floor as Swap.coffee: lower APRs would print as 0.0% */
const MIN_APY = 0.05;

/**
 * Row label: pool type plus trade fee, as DeDust's app shows them
 * ("Classic 0.10%", "CPMM v2 0.25%"), so pools of one pair stay apart.
 */
function poolLabel(pool: DedustPool): string | null {
  const type = POOL_TYPE_LABELS[pool.type ?? ""];
  if (!type) return null;
  const fee = Number(pool.trade_fee) / 100;
  return Number.isFinite(fee) && fee > 0 ? `${type} ${fee.toFixed(2)}%` : type;
}

function displaySymbol(meta: DedustAssetMeta | undefined): string | null {
  const raw = (meta?.ticker || meta?.name || "").trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  // The native coin is still "TON" in DeDust's API; the post calls it GRAM
  if (upper === "TON") return "GRAM";
  if (upper === "USD₮") return "USDT";
  return raw;
}

/** "X-USDT" when one side is USDT, else "GRAM-X": the order the other rows use */
function pairSymbol(left: string, right: string): string {
  if (left.toUpperCase() === "USDT") return `${right}-${left}`;
  if (right.toUpperCase() === "USDT") return `${left}-${right}`;
  if (right.toUpperCase() === "GRAM") return `${right}-${left}`;
  return `${left}-${right}`;
}

/**
 * Convert one DeDust pool to a yield row, or null when it does not belong in
 * the post (not DeDust, unverified, unknown pool type or assets, under the TVL
 * floor, no real APR, memecoin, or an impermanent-loss pair other than
 * GRAM-USDT).
 */
export function transformDedustPool(
  pool: DedustPool,
  meta: Record<string, DedustAssetMeta>,
): YieldOpportunity | null {
  if (typeof pool.dex !== "string" || !pool.dex.startsWith("dedust")) return null;
  if (pool.verified === false) return null;
  const label = poolLabel(pool);
  if (label === null) return null;
  if (!Array.isArray(pool.assets) || pool.assets.length !== 2) return null;

  const left = displaySymbol(meta[pool.assets[0]]);
  const right = displaySymbol(meta[pool.assets[1]]);
  if (!left || !right) return null;

  const tvlUsd = Number(pool.tvl_usd);
  const aprFees = Number(pool.apr_fees ?? 0);
  const aprRewards = Number(pool.apr_rewards ?? 0);
  if (!Number.isFinite(tvlUsd) || tvlUsd < config.minTvlUsd) return null;
  if (!Number.isFinite(aprFees) || aprFees <= 0) return null;

  const asset = pairSymbol(left, right);
  if (isExcludedAsset(asset)) return null;

  const isTonUsdt = isTonUsdtPool(asset);
  const assetType = classifyAsset(asset);
  if (!isTonUsdt && !(pairBelongsToCategory(asset, assetType) && isCorrelatedPair(asset, assetType))) {
    return null;
  }

  const compounds = COMPOUNDING_TYPES.has(pool.type ?? "");
  const apyBase = compounds ? (Math.pow(1 + aprFees / 100 / 365, 365) - 1) * 100 : aprFees;
  const apyReward = Number.isFinite(aprRewards) && aprRewards > 0 ? aprRewards : null;
  const apyTotal = apyBase + (apyReward ?? 0);
  if (!Number.isFinite(apyTotal) || apyTotal < MIN_APY || apyTotal >= 10000) return null;

  return {
    assetType,
    source: "DeDust",
    sourceUrl: getProtocolUrl("dedust"),
    asset,
    poolMeta: label,
    apyBase,
    apyReward,
    apyTotal,
    tvlUsd,
    isTonUsdtPool: isTonUsdt,
  };
}

/**
 * Keep only the largest pool per pair and label, so two pools that would print
 * the same row (and share one 7-day history key) never both appear.
 */
export function keepLargestPerLabel(yields: YieldOpportunity[]): YieldOpportunity[] {
  const best = new Map<string, YieldOpportunity>();
  for (const y of yields) {
    const key = `${y.asset}|${y.poolMeta ?? ""}`;
    const current = best.get(key);
    if (!current || y.tvlUsd > current.tvlUsd) best.set(key, y);
  }
  return yields.filter((y) => best.get(`${y.asset}|${y.poolMeta ?? ""}`) === y);
}

async function fetchPage(offset: number): Promise<DedustResponse> {
  const response = await fetch(DEDUST_API, {
    method: "POST",
    headers: { "content-type": "application/json", "accept": "application/json" },
    body: JSON.stringify({ limit: PAGE_SIZE, offset, sort_by: "tvl", sort_direction: "desc" }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`DeDust API error: ${response.status} ${response.statusText}`);
  }
  return await response.json() as DedustResponse;
}

/**
 * Fetch DeDust pools sorted by TVL, page by page, until the pools fall under
 * the TVL floor. Returns [] on any failure so the post still goes out.
 */
export async function fetchDedustYields(): Promise<YieldOpportunity[]> {
  console.log("Fetching yields from DeDust API...");
  try {
    const meta: Record<string, DedustAssetMeta> = {};
    const pools: DedustPool[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await fetchPage(page * PAGE_SIZE);
      Object.assign(meta, data.assets_metadata ?? {});
      const rows = data.pool_rows ?? [];
      for (const row of rows) {
        pools.push(...(row.pools ?? []));
      }
      const lastRowTvl = Number(rows.at(-1)?.tvl_usd ?? 0);
      if (rows.length < PAGE_SIZE || !(lastRowTvl >= config.minTvlUsd)) break;
    }

    const unknownTypes = new Set(
      pools.map((pool) => pool.type ?? "none").filter((type) => !(type in POOL_TYPE_LABELS)),
    );
    if (unknownTypes.size > 0) {
      console.warn(`DeDust: skipped pools of unknown type: ${[...unknownTypes].join(", ")}`);
    }

    const yields = keepLargestPerLabel(
      pools
        .map((pool) => transformDedustPool(pool, meta))
        .filter((y): y is YieldOpportunity => y !== null),
    );

    for (const y of yields) {
      console.log(`  ↳ DeDust ${y.asset} (${y.poolMeta ?? "?"}): ${y.apyTotal.toFixed(2)}% APY, TVL $${(y.tvlUsd / 1000).toFixed(1)}K`);
    }
    console.log(`Fetched ${pools.length} DeDust pools, ${yields.length} shown`);
    return yields;
  } catch (error) {
    console.error("Failed to fetch DeDust yields:", error);
    return [];
  }
}

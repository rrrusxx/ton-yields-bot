import { config } from "../config.ts";
import type {
  AssetType,
  DefiLlamaPool,
  DefiLlamaResponse,
  GroupedYields,
  OrganizedYields,
  ProtocolGroup,
  YieldOpportunity,
} from "../types/yields.ts";
import {
  classifyAsset,
  formatProtocolName,
  getProtocolUrl,
  isSingleAsset,
  isSingleAssetInCategory,
  isCorrelatedPair,
  leftOutNote,
  pairBelongsToCategory,
  isExcludedAsset,
  isHackedProtocol,
  isTonUsdtPool,
} from "./protocols.ts";

/**
 * Fetch all yield pools from DefiLlama API
 */
async function fetchAllPools(): Promise<DefiLlamaPool[]> {
  const response = await fetch(config.defiLlamaApiUrl, { signal: AbortSignal.timeout(config.defiLlamaTimeoutMs) });
  
  if (!response.ok) {
    throw new Error(`DefiLlama API error: ${response.status} ${response.statusText}`);
  }
  
  const data: DefiLlamaResponse = await response.json();
  return data.data;
}

/**
 * Filter pools to only TON chain
 */
function filterTonPools(pools: DefiLlamaPool[]): DefiLlamaPool[] {
  return pools.filter(pool => 
    pool.chain.toUpperCase() === config.chain.toUpperCase()
  );
}

/**
 * Clean up pool metadata for display
 */
function cleanPoolMeta(poolMeta: string | null): string | null {
  if (!poolMeta) return null;
  
  // Clean up common patterns
  let cleaned = poolMeta
    .replace(/pool/gi, "")
    .replace(/vault/gi, "")
    .replace(/-+/g, " ")
    .replace(/_+/g, " ")
    .trim();
  
  // Capitalize first letter
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Transform DefiLlama pool to our YieldOpportunity format
 */
function transformPool(pool: DefiLlamaPool): YieldOpportunity {
  const assetType = classifyAsset(pool.symbol);
  const apyBase = pool.apyBase ?? 0;
  const apyReward = pool.apyReward ?? null;
  const apyTotal = pool.apy ?? apyBase + (apyReward ?? 0);
  const isTonUsdt = isTonUsdtPool(pool.symbol);
  
  return {
    assetType,
    source: formatProtocolName(pool.project),
    sourceUrl: getProtocolUrl(pool.project, pool.url),
    asset: pool.symbol,
    poolMeta: cleanPoolMeta(pool.poolMeta),
    apyBase,
    apyReward,
    apyTotal,
    tvlUsd: pool.tvlUsd ?? 0,
    isTonUsdtPool: isTonUsdt,
  };
}

/**
 * Filter out pools with low TVL or invalid APY
 */
function filterValidPools(pools: YieldOpportunity[]): YieldOpportunity[] {
  return pools.filter(pool => 
    pool.tvlUsd >= config.minTvlUsd && 
    pool.apyTotal > 0 &&
    pool.apyTotal < 10000 && // Filter out obviously wrong APY values
    !isExcludedAsset(pool.asset) // Filter out memecoins
  );
}

/**
 * Filter pools to only include:
 * - Single assets (lending, staking) that belong to their section
 * - LP pairs with correlated assets (no IL risk)
 * Excludes TON-USDT pools (they go in separate category)
 */
export function filterCorrelatedOnly(pools: YieldOpportunity[]): YieldOpportunity[] {
  return pools.filter(pool => {
    // Exclude TON-USDT pools (handled separately)
    if (pool.isTonUsdtPool) {
      return false;
    }

    // Single assets stay only in their own section: in the GRAM section,
    // GRAM and its staking tokens (see isSingleAssetInCategory)
    if (isSingleAsset(pool.asset)) {
      if (isSingleAssetInCategory(pool.asset, pool.assetType)) return true;
      console.warn(`  ↳ DefiLlama ${pool.source} ${leftOutNote(pool.asset, pool.assetType)}`);
      return false;
    }
    
    // For LP pairs, check if both assets belong to the same category
    // AND are correlated (e.g., TON-stTON, USDT-USDC)
    return pairBelongsToCategory(pool.asset, pool.assetType) && 
           isCorrelatedPair(pool.asset, pool.assetType);
  });
}

/**
 * Filter pools to only include TON-USDT LP pairs
 */
function filterTonUsdtOnly(pools: YieldOpportunity[]): YieldOpportunity[] {
  return pools.filter(pool => pool.isTonUsdtPool === true);
}

/**
 * Sort pools by TVL (highest first)
 */
function sortByTvl(pools: YieldOpportunity[]): YieldOpportunity[] {
  return [...pools].sort((a, b) => b.tvlUsd - a.tvlUsd);
}

/**
 * Sort pools by APY (highest first)
 */
function sortByApy(pools: YieldOpportunity[]): YieldOpportunity[] {
  return [...pools].sort((a, b) => b.apyTotal - a.apyTotal);
}


/**
 * Group yields by asset type
 */
function groupByAssetType(pools: YieldOpportunity[]): GroupedYields {
  const grouped: GroupedYields = {
    TON: [],
    STABLE: [],
    BTC: [],
    ETH: [],
    TON_USDT: [],
  };
  
  for (const pool of pools) {
    // TON-USDT pools go in separate category
    if (pool.isTonUsdtPool) {
      grouped.TON_USDT.push(pool);
    } else {
      grouped[pool.assetType].push(pool);
    }
  }
  
  // Sort each group by TVL
  grouped.TON = sortByTvl(grouped.TON);
  grouped.STABLE = sortByTvl(grouped.STABLE);
  grouped.BTC = sortByTvl(grouped.BTC);
  grouped.ETH = sortByTvl(grouped.ETH);
  grouped.TON_USDT = sortByTvl(grouped.TON_USDT);
  
  return grouped;
}

/**
 * Group yields by protocol within each asset category
 */
function groupByProtocol(yields: YieldOpportunity[]): ProtocolGroup[] {
  const protocolMap = new Map<string, YieldOpportunity[]>();
  
  for (const yield_ of yields) {
    const existing = protocolMap.get(yield_.source) || [];
    existing.push(yield_);
    protocolMap.set(yield_.source, existing);
  }
  
  // Convert to array and sort by total TVL of protocol
  const groups: ProtocolGroup[] = [];
  for (const [protocol, protocolYields] of protocolMap) {
    const totalTvl = protocolYields.reduce((sum, y) => sum + y.tvlUsd, 0);
    groups.push({
      protocol,
      protocolUrl: protocolYields[0].sourceUrl,
      yields: sortByTvl(protocolYields),
    });
  }
  
  // Sort protocol groups by total TVL
  groups.sort((a, b) => {
    const tvlA = a.yields.reduce((sum, y) => sum + y.tvlUsd, 0);
    const tvlB = b.yields.reduce((sum, y) => sum + y.tvlUsd, 0);
    return tvlB - tvlA;
  });
  
  return groups;
}

/**
 * Organize yields by asset type, then by protocol
 */
function organizeYields(grouped: GroupedYields): OrganizedYields {
  return {
    TON: groupByProtocol(grouped.TON),
    STABLE: groupByProtocol(grouped.STABLE),
    BTC: groupByProtocol(grouped.BTC),
    ETH: groupByProtocol(grouped.ETH),
    TON_USDT: groupByProtocol(grouped.TON_USDT),
  };
}

/**
 * True if a yield may enter the TOP-5 (see getTopYields).
 */
export function isTopYieldEligible(y: YieldOpportunity): boolean {
  return Number.isFinite(y.apyTotal) &&
    y.apyTotal > 0 &&
    y.apyTotal <= config.top5MaxApy &&
    !y.tvlHidden &&
    Number.isFinite(y.tvlUsd) &&
    y.tvlUsd >= config.top5MinTvlUsd &&
    !isHackedProtocol(y.source);
}

/**
 * Get the top N yields by APY across the impermanent-loss-free categories
 * (GRAM, stablecoins, BTC, ETH). GRAM-USDT pools never qualify.
 *
 * Eligibility (isTopYieldEligible): TVL of at least config.top5MinTvlUsd and
 * known, APY above 0 and at most config.top5MaxApy, protocol not hacked.
 * Rows that fail stay visible in their own section.
 *
 * One place per protocol and asset class, so one product shown twice (for
 * example Bemo v1 stTON and v2 bmTON at the same rate) takes a single place.
 * On equal APY the higher-TVL row wins (input is sorted by TVL, sort is stable).
 */
export function getTopYields(grouped: GroupedYields, limit: number = 5): YieldOpportunity[] {
  const candidates = [...grouped.TON, ...grouped.STABLE, ...grouped.BTC, ...grouped.ETH]
    .filter(isTopYieldEligible);

  const taken = new Set<string>();
  const top: YieldOpportunity[] = [];
  for (const y of sortByApy(candidates)) {
    if (top.length >= limit) break;
    const key = `${y.source}|${y.assetType}`;
    if (taken.has(key)) continue;
    taken.add(key);
    top.push(y);
  }
  return top;
}

/**
 * Protocols covered by Swap Coffee API
 * DefiLlama will exclude these to avoid duplicates
 * 
 * NOTE: EVAA is intentionally NOT excluded from DefiLlama because:
 * - Swap Coffee has incomplete EVAA coverage (missing USDE and other pools)
 * - DefiLlama has all 16 EVAA pools (100% coverage)
 * 
 * NOTE: Moon is excluded entirely as it's no longer live on TON
 */
const SWAP_COFFEE_PROTOCOLS = [
  "tonstakers",
  "bemo",
  "hipo",
  "kton",
  "stakee",
  "torch-finance",
  // "evaa", "evaa-protocol" - NOT excluded, using DefiLlama for complete EVAA data
  "storm-trade",
  "ston-fi",
  "ston.fi",
  "stonfi",
  "dedust", // covered by dedust.ts (DeDust's own API)
  "swap-coffee",
  "swap.coffee",
  "tonco",
  "bidask",
  "moon", // Excluded - no longer live on TON
  "daolama",
];

/**
 * Protocols temporarily hidden from the feed (paused / unavailable).
 * Matched as a substring against the DefiLlama project name.
 */
const DISABLED_PROTOCOLS = [
  "fiva",
  "daolama", // Project closed — temporarily hidden
];

/**
 * Fetch and process all TON yields from DefiLlama only
 * Excludes protocols that are covered by Swap Coffee API
 * Returns yields grouped by asset type
 */
async function fetchDefiLlamaYields(): Promise<GroupedYields> {
  console.log("Fetching yields from DefiLlama (excluding Swap Coffee protocols)...");
  
  // Fetch all pools
  const allPools = await fetchAllPools();
  console.log(`Fetched ${allPools.length} total pools`);
  
  // Filter to TON chain only
  const tonPools = filterTonPools(allPools);
  console.log(`Found ${tonPools.length} TON pools`);
  
  // Exclude protocols covered by Swap Coffee, plus any temporarily disabled ones
  const defiLlamaOnlyPools = tonPools.filter((pool) => {
    const projectLower = pool.project.toLowerCase();
    if (DISABLED_PROTOCOLS.some(disabled => projectLower.includes(disabled))) {
      return false;
    }
    return !SWAP_COFFEE_PROTOCOLS.some(swapProj => projectLower.includes(swapProj));
  });
  console.log(`${defiLlamaOnlyPools.length} pools after excluding Swap Coffee protocols`);
  
  // Transform to our format
  const yields = defiLlamaOnlyPools.map(transformPool);
  
  // Filter valid pools
  const validYields = filterValidPools(yields);
  console.log(`${validYields.length} pools after basic filtering`);
  
  // Separate TON-USDT pools from correlated pairs
  const tonUsdtYields = filterTonUsdtOnly(validYields);
  const correlatedYields = filterCorrelatedOnly(validYields);
  console.log(`${correlatedYields.length} correlated pools, ${tonUsdtYields.length} TON-USDT pools`);
  
  // Combine both types for grouping
  const allYields = [...correlatedYields, ...tonUsdtYields];
  
  // Group by asset type (TON-USDT will be in separate category)
  const grouped = groupByAssetType(allYields);
  console.log(`Grouped: ${grouped.TON.length} TON, ${grouped.STABLE.length} STABLE, ${grouped.BTC.length} BTC, ${grouped.ETH.length} ETH, ${grouped.TON_USDT.length} TON-USDT`);
  
  return grouped;
}

/**
 * Merge, in place, the rows computed from the contracts into their groups:
 * each on-chain row goes to the group of its asset class (the Storm USDT vault
 * to the stablecoins; the LSTs and the Storm GRAM vault to GRAM), where
 * `merge` (preferOnchain) replaces the fallback row of the same pool or adds
 * the row.
 */
export function mergeOnchainRows(
  grouped: GroupedYields,
  onchain: YieldOpportunity[],
  merge: (rows: YieldOpportunity[], onchain: YieldOpportunity[]) => YieldOpportunity[],
): void {
  for (const assetType of ["TON", "STABLE", "BTC", "ETH"] as const) {
    grouped[assetType] = merge(grouped[assetType], onchain.filter((y) => y.assetType === assetType));
  }
}

/**
 * Remove, in place, every row whose APY is not a finite number, with a
 * warning per row. Returns the number of rows removed.
 */
export function dropNonFiniteApy(grouped: GroupedYields): number {
  let dropped = 0;
  for (const category of ["TON", "STABLE", "BTC", "ETH", "TON_USDT"] as const) {
    grouped[category] = grouped[category].filter((y) => {
      if (Number.isFinite(y.apyTotal)) return true;
      console.warn(`Dropped ${y.source} ${y.asset}: APY is not a number after overrides`);
      dropped++;
      return false;
    });
  }
  return dropped;
}

/**
 * Fetch and process all TON yields: LSTs and the Storm Trade vaults on-chain
 * (own engine, with Swap.coffee as the fallback), DefiLlama, Swap.coffee, Ethena, GTC and DeDust, then apply
 * Palette APR and TVL overrides to the rows not computed on-chain.
 * Returns yields grouped by asset type.
 *
 * The TAC sources (Merkl, Feather Zone, Morpho via Goldsky, Euler, YieldFi)
 * and the Midas vault were removed on 2026-11-20: the TAC sources no longer
 * returned live data, and the Midas product is closed to new deposits. Their
 * code is in the git history before that date.
 */
export async function fetchTonYields(): Promise<GroupedYields> {
  // Import services dynamically to avoid circular dependencies
  const { fetchEthenaYields } = await import("./ethena.ts");
  const { fetchSwapCoffeeYields } = await import("./swapcoffee.ts");
  const { fetchGtcYields } = await import("./gtc.ts");
  const { fetchDedustYields } = await import("./dedust.ts");
  const { fetchOnchainYields, preferOnchain } = await import("./onchain.ts");
  const { fetchPaletteData, applyPaletteOverrides } = await import("./palette.ts");

  // Fetch from all sources in parallel
  const [defiLlamaYields, ethenaYields, swapCoffeeYields, gtcYields, dedustYields, onchainYields, paletteData] = await Promise.all([
    fetchDefiLlamaYields(),
    fetchEthenaYields(),
    fetchSwapCoffeeYields(),
    fetchGtcYields(),
    fetchDedustYields(),
    fetchOnchainYields(),
    fetchPaletteData(),
  ]);

  // Merge Ethena yields into the grouped structure
  for (const yield_ of ethenaYields) {
    if (yield_.isTonUsdtPool) {
      defiLlamaYields.TON_USDT.push(yield_);
    } else {
      defiLlamaYields[yield_.assetType].push(yield_);
    }
  }

  // Merge Swap Coffee yields into the grouped structure
  // No deduplication needed since DefiLlama already excludes Swap Coffee protocols
  // EXCEPT EVAA which we intentionally kept in DefiLlama for USDE coverage
  for (const yield_ of swapCoffeeYields) {
    if (yield_.isTonUsdtPool) {
      defiLlamaYields.TON_USDT.push(yield_);
    } else {
      defiLlamaYields[yield_.assetType].push(yield_);
    }
  }
  
  // Merge DeDust pools (own API; DeDust is excluded from DefiLlama and Swap.coffee)
  for (const yield_ of dedustYields) {
    if (yield_.isTonUsdtPool) {
      defiLlamaYields.TON_USDT.push(yield_);
    } else {
      defiLlamaYields[yield_.assetType].push(yield_);
    }
  }

  // Merge GTC lending vaults (GRAM → TON, USDT → STABLE)
  for (const yield_ of gtcYields) {
    defiLlamaYields[yield_.assetType].push(yield_);
  }

  // Apply Palette Finance APR and TVL overrides (values for covered
  // protocols). Must run before re-sort and before downstream snapshot/average
  // tracking so all consumers see the corrected APRs.
  const overrideCount = applyPaletteOverrides(defiLlamaYields, paletteData);
  if (overrideCount > 0) {
    console.log(`Applied ${overrideCount} Palette APR override(s)`);
  }

  // Drop rows whose APY is still not a real number (for example a Swap.coffee
  // "NaN" APR that no Palette override replaced); they would print as "NaN%".
  dropNonFiniteApy(defiLlamaYields);

  // Rows computed from the contracts (the LSTs and the Storm Trade vaults)
  // replace the fallback rows of the same pools (Swap.coffee, already with
  // Palette's APR and TVL) and stand in when Swap.coffee leaves a pool out.
  // A pool the engine could not read keeps its fallback row; without a GRAM
  // price an on-chain row takes the fallback row's TVL (Palette's for Hipo,
  // Swap.coffee's free balance for the Storm GRAM vault).
  mergeOnchainRows(defiLlamaYields, onchainYields, preferOnchain);

  // Re-sort after merging
  defiLlamaYields.TON = sortByTvl(defiLlamaYields.TON);
  defiLlamaYields.STABLE = sortByTvl(defiLlamaYields.STABLE);
  defiLlamaYields.BTC = sortByTvl(defiLlamaYields.BTC);
  defiLlamaYields.ETH = sortByTvl(defiLlamaYields.ETH);
  defiLlamaYields.TON_USDT = sortByTvl(defiLlamaYields.TON_USDT);
  
  console.log(`Total after merge: ${defiLlamaYields.TON.length} TON, ${defiLlamaYields.STABLE.length} STABLE, ${defiLlamaYields.BTC.length} BTC, ${defiLlamaYields.ETH.length} ETH, ${defiLlamaYields.TON_USDT.length} TON-USDT`);
  
  return defiLlamaYields;
}

/**
 * Fetch yields organized by protocol within each category
 */
export async function fetchOrganizedYields(): Promise<OrganizedYields> {
  const grouped = await fetchTonYields();
  return organizeYields(grouped);
}

/**
 * Fetch yields and return as flat array (for testing/debugging)
 */
export async function fetchTonYieldsFlat(): Promise<YieldOpportunity[]> {
  const grouped = await fetchTonYields();
  return [...grouped.TON, ...grouped.STABLE, ...grouped.BTC];
}

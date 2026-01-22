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
  isCorrelatedPair,
  pairBelongsToCategory,
  isExcludedAsset,
  isTonUsdtPool,
} from "./protocols.ts";

/**
 * Fetch all yield pools from DefiLlama API
 */
async function fetchAllPools(): Promise<DefiLlamaPool[]> {
  const response = await fetch(config.defiLlamaApiUrl);
  
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
 * - Single assets (lending, staking)
 * - LP pairs with correlated assets (no IL risk)
 * Excludes TON-USDT pools (they go in separate category)
 */
function filterCorrelatedOnly(pools: YieldOpportunity[]): YieldOpportunity[] {
  return pools.filter(pool => {
    // Exclude TON-USDT pools (handled separately)
    if (pool.isTonUsdtPool) {
      return false;
    }
    
    // Single assets are always included
    if (isSingleAsset(pool.asset)) {
      return true;
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
    TON_USDT: groupByProtocol(grouped.TON_USDT),
  };
}

/**
 * Get top N yields by APY across all categories
 * Excludes TON-USDT pools (IL risk)
 */
export function getTopYields(grouped: GroupedYields, limit: number = 5): YieldOpportunity[] {
  const allYields = [...grouped.TON, ...grouped.STABLE, ...grouped.BTC];
  // Explicitly exclude TON-USDT pools from TOP 5 (they have IL risk)
  return sortByApy(allYields).slice(0, limit);
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
  "dedust",
  "swap-coffee",
  "swap.coffee",
  "tonco",
  "bidask",
  "moon", // Excluded - no longer live on TON
  "daolama",
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
  
  // Exclude protocols covered by Swap Coffee
  const defiLlamaOnlyPools = tonPools.filter((pool) => {
    const projectLower = pool.project.toLowerCase();
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
  console.log(`Grouped: ${grouped.TON.length} TON, ${grouped.STABLE.length} STABLE, ${grouped.BTC.length} BTC, ${grouped.TON_USDT.length} TON-USDT`);
  
  return grouped;
}

/**
 * Fetch and process all TON yields from DefiLlama, Merkl, and Morpho
 * Returns yields grouped by asset type
 */
export async function fetchTonYields(): Promise<GroupedYields> {
  // Import services dynamically to avoid circular dependencies
  const { fetchMerklYields } = await import("./merkl.ts");
  const { fetchMorphoYields } = await import("./morpho.ts");
  const { fetchEulerYields } = await import("./euler.ts");
  const { fetchYieldFiYields } = await import("./yieldfi.ts");
  const { fetchEthenaYields } = await import("./ethena.ts");
  const { fetchSwapCoffeeYields } = await import("./swapcoffee.ts");

  // Fetch from all sources in parallel
  const [defiLlamaYields, merklYields, morphoYields, eulerYields, yieldFiYields, ethenaYields, swapCoffeeYields] = await Promise.all([
    fetchDefiLlamaYields(),
    fetchMerklYields(),
    fetchMorphoYields(),
    fetchEulerYields(),
    fetchYieldFiYields(),
    fetchEthenaYields(),
    fetchSwapCoffeeYields(),
  ]);
  
  // Merge Merkl yields into the grouped structure
  for (const yield_ of merklYields) {
    if (yield_.isTonUsdtPool) {
      defiLlamaYields.TON_USDT.push(yield_);
    } else {
      defiLlamaYields[yield_.assetType].push(yield_);
    }
  }
  
  // Merge Morpho yields into the grouped structure
  for (const yield_ of morphoYields) {
    if (yield_.isTonUsdtPool) {
      defiLlamaYields.TON_USDT.push(yield_);
    } else {
      defiLlamaYields[yield_.assetType].push(yield_);
    }
  }
  
  // Merge Euler yields into the grouped structure
  for (const yield_ of eulerYields) {
    if (yield_.isTonUsdtPool) {
      defiLlamaYields.TON_USDT.push(yield_);
    } else {
      defiLlamaYields[yield_.assetType].push(yield_);
    }
  }
  
  // Merge YieldFi yields into the grouped structure
  for (const yield_ of yieldFiYields) {
    if (yield_.isTonUsdtPool) {
      defiLlamaYields.TON_USDT.push(yield_);
    } else {
      defiLlamaYields[yield_.assetType].push(yield_);
    }
  }
  
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
  
  // Re-sort after merging
  defiLlamaYields.TON = sortByTvl(defiLlamaYields.TON);
  defiLlamaYields.STABLE = sortByTvl(defiLlamaYields.STABLE);
  defiLlamaYields.BTC = sortByTvl(defiLlamaYields.BTC);
  defiLlamaYields.TON_USDT = sortByTvl(defiLlamaYields.TON_USDT);
  
  console.log(`Total after merge: ${defiLlamaYields.TON.length} TON, ${defiLlamaYields.STABLE.length} STABLE, ${defiLlamaYields.BTC.length} BTC, ${defiLlamaYields.TON_USDT.length} TON-USDT`);
  
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

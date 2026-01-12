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
 */
function filterCorrelatedOnly(pools: YieldOpportunity[]): YieldOpportunity[] {
  return pools.filter(pool => {
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
  };
  
  for (const pool of pools) {
    grouped[pool.assetType].push(pool);
  }
  
  // Sort each group by TVL
  grouped.TON = sortByTvl(grouped.TON);
  grouped.STABLE = sortByTvl(grouped.STABLE);
  grouped.BTC = sortByTvl(grouped.BTC);
  
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
  };
}

/**
 * Get top N yields by APY across all categories
 */
export function getTopYields(grouped: GroupedYields, limit: number = 5): YieldOpportunity[] {
  const allYields = [...grouped.TON, ...grouped.STABLE, ...grouped.BTC];
  return sortByApy(allYields).slice(0, limit);
}

/**
 * Fetch and process all TON yields from DefiLlama only
 * Returns yields grouped by asset type
 */
async function fetchDefiLlamaYields(): Promise<GroupedYields> {
  console.log("Fetching yields from DefiLlama...");
  
  // Fetch all pools
  const allPools = await fetchAllPools();
  console.log(`Fetched ${allPools.length} total pools`);
  
  // Filter to TON chain only
  const tonPools = filterTonPools(allPools);
  console.log(`Found ${tonPools.length} TON pools`);
  
  // Transform to our format
  const yields = tonPools.map(transformPool);
  
  // Filter valid pools
  const validYields = filterValidPools(yields);
  console.log(`${validYields.length} pools after basic filtering`);
  
  // Filter to correlated pairs only (no IL risk)
  const correlatedYields = filterCorrelatedOnly(validYields);
  console.log(`${correlatedYields.length} pools after correlated filter`);
  
  // Group by asset type
  const grouped = groupByAssetType(correlatedYields);
  console.log(`Grouped: ${grouped.TON.length} TON, ${grouped.STABLE.length} STABLE, ${grouped.BTC.length} BTC`);
  
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
  
  // Fetch from all sources in parallel
  const [defiLlamaYields, merklYields, morphoYields, eulerYields] = await Promise.all([
    fetchDefiLlamaYields(),
    fetchMerklYields(),
    fetchMorphoYields(),
    fetchEulerYields(),
  ]);
  
  // Merge Merkl yields into the grouped structure
  for (const yield_ of merklYields) {
    defiLlamaYields[yield_.assetType].push(yield_);
  }
  
  // Merge Morpho yields into the grouped structure
  for (const yield_ of morphoYields) {
    defiLlamaYields[yield_.assetType].push(yield_);
  }
  
  // Merge Euler yields into the grouped structure
  for (const yield_ of eulerYields) {
    defiLlamaYields[yield_.assetType].push(yield_);
  }
  
  // Re-sort after merging
  defiLlamaYields.TON = sortByTvl(defiLlamaYields.TON);
  defiLlamaYields.STABLE = sortByTvl(defiLlamaYields.STABLE);
  defiLlamaYields.BTC = sortByTvl(defiLlamaYields.BTC);
  
  console.log(`Total after merge: ${defiLlamaYields.TON.length} TON, ${defiLlamaYields.STABLE.length} STABLE, ${defiLlamaYields.BTC.length} BTC`);
  
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

import type { YieldOpportunity } from "../types/yields.ts";
import { 
  classifyAsset, 
  formatProtocolName, 
  getProtocolUrl,
  isSingleAsset,
  isCorrelatedPair,
  pairBelongsToCategory,
  isTonUsdtPool,
} from "./protocols.ts";

/**
 * Merkl API response structure
 */
interface MerklOpportunity {
  name: string;
  identifier: string;
  apr: number;
  tvl: number;
  chainId: number;
  protocol: {
    name: string;
  };
  // Additional fields that might exist
  mainParameter?: string;
  action?: string;
  type?: string;
}

const FEATHER_ZONE_URL = "https://api.feather.zone/vault/v2/aprs";

/**
 * Fetch base APRs for Morpho v2 vaults from Feather Zone.
 * Returns a map of lowercase vault address → base APY (in %).
 * Feather Zone returns APR as a decimal (e.g. 0.000689 = 0.069%).
 * We use continuous compounding to convert APR → APY: APY = (e^APR - 1) * 100.
 */
async function fetchFeatherZoneBaseApys(): Promise<Map<string, number>> {
  try {
    const response = await fetch(FEATHER_ZONE_URL);
    if (!response.ok) {
      console.warn(`Feather Zone API error: ${response.status}`);
      return new Map();
    }
    const data: Array<{ vaultId: string; apr: number }> = await response.json();
    const map = new Map<string, number>();
    for (const { vaultId, apr } of data) {
      // Convert decimal APR → APY percentage (continuous compounding)
      const apy = (Math.exp(apr) - 1) * 100;
      // Only store meaningful rates (>= 0.001%)
      if (apy >= 0.001) {
        map.set(vaultId.toLowerCase(), apy);
      }
    }
    console.log(`Feather Zone: ${map.size} v2 vault base APYs loaded`);
    return map;
  } catch (error) {
    console.warn("Failed to fetch Feather Zone APRs:", error);
    return new Map();
  }
}

/**
 * Convert APR to APY
 * Formula: APY = (1 + APR/365)^365 - 1
 * For simplicity, using continuous compounding: APY ≈ APR when compounded
 */
function aprToApy(apr: number): number {
  // For daily compounding (most DeFi protocols)
  return ((1 + apr / 100 / 365) ** 365 - 1) * 100;
}

/**
 * Extract asset symbol from pool name
 * Examples: 
 *   "USDT-USDC" -> "USDT-USDC"
 *   "Provide liquidity to TON-tsTON 0.01%" -> "TON-tsTON"
 *   "Snap USD₮-TON 0.3%" -> "USD₮-TON"
 *   "Curve USDT/USDC" -> "USDT-USDC"
 */
function extractAssetSymbol(name: string, mainParameter?: string): string {
  // Try mainParameter first if available
  if (mainParameter) {
    return mainParameter;
  }
  
  // Clean up common patterns
  let cleaned = name
    .replace(/^Provide liquidity to\s+/i, "") // Remove Merkl "Provide liquidity to" prefix
    .replace(/^Supply to\s+/i, "")             // Remove Merkl "Supply to" prefix
    .replace(/\s+on TAC$/i, "")               // Remove " on TAC" suffix
    .replace(/^(Curve|Morpho|Euler|Carbon|Snap)\s+/i, "") // Remove protocol name prefix
    .replace(/\s+Pool$/i, "")
    .replace(/\s+Vault$/i, "")
    .replace(/\s+\d+(\.\d+)?%/g, "") // Remove fee percentages like " 0.3%" or " 0.01%"
    .replace(/\//g, "-") // Replace / with -
    .replace(/USD₮/g, "USDT") // Normalize unicode USDT to standard USDT
    .trim();
  
  return cleaned;
}

/**
 * Transform Merkl opportunity to our YieldOpportunity format.
 * baseApyMap: optional map of lowercase vault address → base APY % (from Feather Zone).
 */
function transformMerklToYield(
  opp: MerklOpportunity,
  baseApyMap: Map<string, number> = new Map(),
): YieldOpportunity {
  const asset = extractAssetSymbol(opp.name, opp.mainParameter);
  const assetType = classifyAsset(asset);
  const rewardApy = aprToApy(opp.apr);
  const isTonUsdt = isTonUsdtPool(asset);

  // Look up Feather Zone base APY for this vault (matched by contract address)
  const baseApy = baseApyMap.get(opp.identifier.toLowerCase()) ?? 0;
  const totalApy = baseApy + rewardApy;

  return {
    assetType,
    source: formatProtocolName(opp.protocol.name),
    sourceUrl: getProtocolUrl(opp.protocol.name),
    asset,
    poolMeta: null,
    apyBase: baseApy,
    apyReward: rewardApy,
    apyTotal: totalApy,
    tvlUsd: opp.tvl,
    isTonUsdtPool: isTonUsdt,
  };
}

/**
 * Filter Merkl yields to only include:
 * - Single assets (lending/staking)
 * - Correlated pairs (no IL risk)
 * - TON-USDT pairs (separate category, shown separately)
 */
function filterCorrelatedMerklYields(yields: YieldOpportunity[]): YieldOpportunity[] {
  return yields.filter(pool => {
    // Single assets are always included (lending/staking)
    if (isSingleAsset(pool.asset)) {
      return true;
    }
    
    // TON-USDT pools are included (will be shown in separate category)
    if (pool.isTonUsdtPool) {
      return true;
    }
    
    // For LP pairs, check if both assets belong to the same category
    // AND are correlated (e.g., TON-tsTON, USDT-USDC)
    return pairBelongsToCategory(pool.asset, pool.assetType) && 
           isCorrelatedPair(pool.asset, pool.assetType);
  });
}

/**
 * Fetch yield opportunities from Merkl for TAC chain (chainId: 239)
 */
export async function fetchMerklYields(): Promise<YieldOpportunity[]> {
  console.log("Fetching yields from Merkl API (TAC chain)...");
  
  try {
    // Fetch Merkl opportunities and Feather Zone base APYs in parallel
    const [response, baseApyMap] = await Promise.all([
      fetch("https://api.merkl.xyz/v4/opportunities?chainId=239"),
      fetchFeatherZoneBaseApys(),
    ]);
    
    if (!response.ok) {
      throw new Error(`Merkl API error: ${response.status} ${response.statusText}`);
    }
    
    const opportunities: MerklOpportunity[] = await response.json();
    console.log(`Fetched ${opportunities.length} opportunities from Merkl`);
    
    // Filter and transform, injecting Feather Zone base APYs
    const yields = opportunities
      .filter(opp => 
        opp.apr > 0 && // Has Merkl reward APR
        opp.tvl > 5000 && // Minimum TVL threshold
        opp.chainId === 239 // TAC chain
      )
      .map(opp => transformMerklToYield(opp, baseApyMap));
    
    console.log(`${yields.length} Merkl yields after basic filtering`);
    
    // Filter to correlated pairs only (no IL risk)
    const correlatedYields = filterCorrelatedMerklYields(yields);
    console.log(`${correlatedYields.length} Merkl yields after correlated filter`);
    
    return correlatedYields;
  } catch (error) {
    console.error("Failed to fetch Merkl yields:", error);
    // Return empty array on error - don't break the whole bot
    return [];
  }
}

/**
 * Get summary of Merkl data by protocol
 */
export async function getMerklSummary(): Promise<Record<string, { count: number; avgApr: number; totalTvl: number }>> {
  try {
    const yields = await fetchMerklYields();
    const summary: Record<string, { count: number; totalApr: number; totalTvl: number }> = {};
    
    for (const y of yields) {
      if (!summary[y.source]) {
        summary[y.source] = { count: 0, totalApr: 0, totalTvl: 0 };
      }
      summary[y.source].count++;
      summary[y.source].totalApr += y.apyTotal;
      summary[y.source].totalTvl += y.tvlUsd;
    }
    
    // Calculate averages
    const result: Record<string, { count: number; avgApr: number; totalTvl: number }> = {};
    for (const [protocol, data] of Object.entries(summary)) {
      result[protocol] = {
        count: data.count,
        avgApr: data.totalApr / data.count,
        totalTvl: data.totalTvl,
      };
    }
    
    return result;
  } catch (error) {
    console.error("Failed to get Merkl summary:", error);
    return {};
  }
}

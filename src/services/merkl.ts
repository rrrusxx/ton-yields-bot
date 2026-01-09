import type { YieldOpportunity } from "../types/yields.ts";
import { 
  classifyAsset, 
  formatProtocolName, 
  getProtocolUrl,
  isSingleAsset,
  isCorrelatedPair,
  pairBelongsToCategory,
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
 *   "Provide liquidity to TON-tsTON 0.01%" -> "TON-tsTON 0.01%"
 *   "Curve USDT/USDC" -> "USDT-USDC"
 */
function extractAssetSymbol(name: string, mainParameter?: string): string {
  // Try mainParameter first if available
  if (mainParameter) {
    return mainParameter;
  }
  
  // Clean up common patterns
  let cleaned = name
    .replace(/^Provide liquidity to\s+/i, "") // Remove Merkl prefix
    .replace(/^(Curve|Morpho|Euler|Carbon|Snap)\s+/i, "")
    .replace(/\s+Pool$/i, "")
    .replace(/\s+Vault$/i, "")
    .replace(/\//g, "-")
    .trim();
  
  return cleaned;
}

/**
 * Transform Merkl opportunity to our YieldOpportunity format
 */
function transformMerklToYield(opp: MerklOpportunity): YieldOpportunity {
  const asset = extractAssetSymbol(opp.name, opp.mainParameter);
  const assetType = classifyAsset(asset);
  const apy = aprToApy(opp.apr);
  
  return {
    assetType,
    source: formatProtocolName(opp.protocol.name),
    sourceUrl: getProtocolUrl(opp.protocol.name),
    asset,
    poolMeta: "Merkl", // Label to indicate this is from Merkl rewards
    apyBase: 0, // Merkl only shows reward APR
    apyReward: apy, // All APY is from rewards
    apyTotal: apy,
    tvlUsd: opp.tvl,
  };
}

/**
 * Filter Merkl yields to only include correlated pairs (no IL risk)
 * Same logic as DefiLlama filtering
 */
function filterCorrelatedMerklYields(yields: YieldOpportunity[]): YieldOpportunity[] {
  return yields.filter(pool => {
    // Single assets are always included (lending/staking)
    if (isSingleAsset(pool.asset)) {
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
    const response = await fetch("https://api.merkl.xyz/v4/opportunities?chainId=239");
    
    if (!response.ok) {
      throw new Error(`Merkl API error: ${response.status} ${response.statusText}`);
    }
    
    const opportunities: MerklOpportunity[] = await response.json();
    console.log(`Fetched ${opportunities.length} opportunities from Merkl`);
    
    // Filter and transform
    const yields = opportunities
      .filter(opp => 
        opp.apr > 0 && // Has APR
        opp.tvl > 10000 && // Minimum TVL threshold
        opp.chainId === 239 // TAC chain
      )
      .map(transformMerklToYield);
    
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

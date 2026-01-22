import {
  classifyAsset,
  getProtocolUrl,
} from "./protocols.ts";
import type { YieldOpportunity, DefiLlamaPool } from "../types/yields.ts";

// DefiLlama API URL
const DEFILLAMA_API_URL = "https://yields.llama.fi/pools";

// Fetch Ethena pools from DefiLlama
async function fetchEthenaPools(): Promise<DefiLlamaPool[]> {
  const response = await fetch(DEFILLAMA_API_URL);
  
  if (!response.ok) {
    throw new Error(`DefiLlama API error: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  
  // Filter for Ethena project pools with sUSDE symbol
  const ethenaPools = data.data.filter((pool: DefiLlamaPool) => 
    pool.project?.toLowerCase() === "ethena-usde" &&
    pool.symbol?.toUpperCase() === "SUSDE"
  );
  
  console.log(`Found ${ethenaPools.length} Ethena sUSDE pools on DefiLlama`);
  return ethenaPools;
}

// Aggregate Ethena pools by taking max APY and summing TVL across all chains
// sUSDE APY should be consistent, but we aggregate to get total picture
function aggregateEthena(pools: DefiLlamaPool[]): { apy: number, tvl: number } | null {
  if (pools.length === 0) {
    return null;
  }
  
  let maxApy = 0;
  let totalTvl = 0;
  
  for (const pool of pools) {
    // Take the max APY (should be consistent across chains)
    maxApy = Math.max(maxApy, pool.apy || 0);
    
    // Sum TVL across all chains
    totalTvl += (pool.tvlUsd || 0);
  }
  
  return { apy: maxApy, tvl: totalTvl };
}

// Transform aggregated Ethena data to YieldOpportunity
function transformEthenaToken(
  apy: number,
  tvl: number,
): YieldOpportunity {
  // tsUSDE on TON has the same APY as sUSDE (same underlying asset)
  const symbol = "tsUSDE";
  const assetType = classifyAsset(symbol); // Should be STABLE

  return {
    assetType,
    source: "Ethena",
    sourceUrl: getProtocolUrl("ethena"),
    asset: symbol,
    poolMeta: null,
    apyBase: apy,
    apyReward: null,
    apyTotal: apy,
    tvlUsd: tvl,
  };
}

// Main function to fetch Ethena yields
export async function fetchEthenaYields(): Promise<YieldOpportunity[]> {
  console.log("Fetching yields from Ethena (DefiLlama, sUSDE APY for tsUSDE)...");

  try {
    // Fetch all Ethena sUSDE pools from DefiLlama
    const pools = await fetchEthenaPools();
    
    if (pools.length === 0) {
      console.log("No Ethena sUSDE pools found on DefiLlama");
      return [];
    }
    
    // Aggregate sUSDE data across all chains
    const aggregated = aggregateEthena(pools);
    
    if (!aggregated) {
      console.log("Failed to aggregate Ethena data");
      return [];
    }
    
    const { apy, tvl } = aggregated;
    
    if (apy < 0.1) {
      console.log(`Skipping Ethena tsUSDE - APY too low (${apy}%)`);
      return [];
    }
    
    // Transform to YieldOpportunity format
    const yieldOpp = transformEthenaToken(apy, tvl);
    
    console.log(`✓ tsUSDE (sUSDE APY): ${apy.toFixed(2)}% APY, $${(tvl / 1000000).toFixed(2)}M TVL (aggregated across all chains)`);
    
    return [yieldOpp];
  } catch (error) {
    console.error("Failed to fetch Ethena yields:", error);
    return [];
  }
}

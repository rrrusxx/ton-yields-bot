import {
  classifyAsset,
  getProtocolUrl,
} from "./protocols.ts";
import type { YieldOpportunity, DefiLlamaPool } from "../types/yields.ts";

// DefiLlama API URL
const DEFILLAMA_API_URL = "https://yields.llama.fi/pools";

// Fetch YieldFi pools from DefiLlama
async function fetchYieldFiPools(): Promise<DefiLlamaPool[]> {
  const response = await fetch(DEFILLAMA_API_URL);
  
  if (!response.ok) {
    throw new Error(`DefiLlama API error: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  
  // Filter for YieldFi project pools
  const yieldFiPools = data.data.filter((pool: DefiLlamaPool) => 
    pool.project?.toLowerCase() === "yieldfi"
  );
  
  console.log(`Found ${yieldFiPools.length} YieldFi pools on DefiLlama`);
  return yieldFiPools;
}

// Aggregate YieldFi pools by token symbol (yUSD, vyUSD)
// Sum TVL across all chains since it's the same token everywhere
function aggregateYieldFiByToken(pools: DefiLlamaPool[]): Map<string, { apy: number, tvl: number }> {
  const aggregated = new Map<string, { apy: number, tvl: number }>();
  
  for (const pool of pools) {
    const symbol = pool.symbol;
    
    // Check for yUSD or vyUSD in the symbol
    // DefiLlama might use different formats
    const symbolLower = symbol?.toLowerCase() || "";
    const isYUSD = symbolLower.includes("yusd") && !symbolLower.includes("vyusd");
    const isVyUSD = symbolLower.includes("vyusd");
    
    if (!isYUSD && !isVyUSD) {
      continue;
    }
    
    // Normalize symbol
    const normalizedSymbol = isVyUSD ? "vyUSD" : "yUSD";
    
    const current = aggregated.get(normalizedSymbol) || { apy: 0, tvl: 0 };
    
    // Use the APY from the pool (should be consistent across chains)
    // Take the max APY if there are slight differences
    const apy = Math.max(current.apy, pool.apy || 0);
    
    // Sum TVL across all chains
    const tvl = current.tvl + (pool.tvlUsd || 0);
    
    aggregated.set(normalizedSymbol, { apy, tvl });
  }
  
  return aggregated;
}

// Transform aggregated YieldFi data to YieldOpportunity
function transformYieldFiToken(
  symbol: string,
  apy: number,
  tvl: number,
): YieldOpportunity {
  const assetType = classifyAsset(symbol); // Should be STABLE

  return {
    assetType,
    source: "YieldFi",
    sourceUrl: getProtocolUrl("yieldfi"),
    asset: symbol,
    poolMeta: null,
    apyBase: apy,
    apyReward: null,
    apyTotal: apy,
    tvlUsd: tvl,
  };
}

// Main function to fetch YieldFi yields
export async function fetchYieldFiYields(): Promise<YieldOpportunity[]> {
  console.log("Fetching yields from YieldFi (DefiLlama, aggregated across all chains)...");

  try {
    // Fetch all YieldFi pools from DefiLlama
    const pools = await fetchYieldFiPools();
    
    if (pools.length === 0) {
      console.log("No YieldFi pools found on DefiLlama");
      return [];
    }
    
    // Aggregate by token symbol (yUSD, vyUSD) across all chains
    const aggregated = aggregateYieldFiByToken(pools);
    
    // Transform to YieldOpportunity format
    const yields: YieldOpportunity[] = [];
    
    for (const [symbol, data] of aggregated.entries()) {
      if (data.apy < 0.1) {
        console.log(`Skipping ${symbol} - APY too low (${data.apy}%)`);
        continue;
      }
      
      const yieldOpp = transformYieldFiToken(symbol, data.apy, data.tvl);
      yields.push(yieldOpp);
      
      console.log(`✓ ${symbol}: ${data.apy.toFixed(2)}% APY, $${(data.tvl / 1000000).toFixed(2)}M TVL (aggregated across all chains)`);
    }
    
    console.log(`${yields.length} YieldFi yields fetched`);
    return yields;
  } catch (error) {
    console.error("Failed to fetch YieldFi yields:", error);
    return [];
  }
}

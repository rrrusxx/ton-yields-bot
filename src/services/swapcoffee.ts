/**
 * Swap Coffee Yield Aggregator API Service
 * Documentation: https://docs.swap.coffee/technical-guides/aggregator-api-openapi/yield/
 * 
 * Provides comprehensive yield data from 17+ protocols on TON including:
 * - Liquid Staking: Tonstakers, Bemo, KTON, Hipo, Stakee, Torch Finance
 * - DEXes: Stonfi, DeDust, Coffee DEX
 * - Lending: EVAA, Storm Trade, DAO Lama Vault
 * 
 * Rate limit: 1 RPS (no API key required)
 */

import type { YieldOpportunity } from "../types/yields.ts";
import {
  classifyAsset,
  getProtocolUrl,
  isCorrelatedPair,
  pairBelongsToCategory,
  isSingleAsset,
  isEthAsset,
  isExcludedAsset,
  isTonUsdtPool,
} from "./protocols.ts";

const SWAPCOFFEE_API = "https://backend.swap.coffee/v1/yield/pools";

// Map Swap Coffee protocol names to our display names
const PROTOCOL_NAME_MAP: Record<string, string> = {
  "tonstakers": "Tonstakers",
  "bemo": "Bemo",
  "bemo_v2": "Bemo",
  "kton": "KTON",
  "hipo": "Hipo",
  "stakee": "Stakee",
  "torch_finance": "Torch Finance",
  "stonfi": "Ston.fi",
  "stonfi_v2": "Ston.fi",
  "dedust": "DeDust",
  "coffee": "Swap.coffee",
  "evaa": "EVAA",
  "storm_trade": "Storm Trade",
  "dao_lama_vault": "Daolama",
  "moon": "Moon",
  "tonco": "Tonco",
  "bidask": "BidAsk",
};

interface SwapCoffeeToken {
  address: {
    blockchain: string;
    address: string;
  };
  metadata: {
    name: string;
    symbol: string;
    decimals: number;
    listed: boolean;
    verification: string;
  };
}

interface SwapCoffeePool {
  address: string;
  protocol: string;
  is_trusted: boolean;
  tokens: SwapCoffeeToken[];
  pool_statistics: {
    tvl_usd: number;
    volume_usd: number;
    apr: number;
    lp_apr: number;
    boost_apr: number;
  };
  pool?: {
    amm_type?: string;
  };
}

interface SwapCoffeeResponse {
  total_count: number;
  pools: SwapCoffeePool[];
}

/**
 * Fetch yield pools from Swap Coffee API
 */
async function fetchSwapCoffeePools(): Promise<SwapCoffeePool[]> {
  try {
    const response = await fetch(SWAPCOFFEE_API, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Swap Coffee API error: ${response.status} ${response.statusText}`,
      );
    }

    const data: SwapCoffeeResponse[] = await response.json();
    
    if (!data[0]?.pools) {
      console.warn("No pools found in Swap Coffee response");
      return [];
    }

    return data[0].pools;
  } catch (error) {
    console.error("Failed to fetch from Swap Coffee API:", error);
    return [];
  }
}

/**
 * Get asset symbol from pool tokens
 * For single-asset pools (LST), returns the staked token symbol
 * For LP pools, returns "TOKEN1-TOKEN2"
 */
function getAssetSymbol(pool: SwapCoffeePool): string {
  const symbols = pool.tokens.map((t) => t.metadata.symbol);
  
  // Single asset pool (e.g., liquid staking)
  if (symbols.length === 1) {
    return symbols[0];
  }
  
  // LST protocols: 2 tokens where one is underlying and one is receipt token
  // Storm Trade: ["TON", "TON-SLP"] → show as "TON"
  // KTON: ["TON", "KTON"] → show as "TON"
  // Stakee: ["TON", "STAKED"] → show as "TON"
  // Bemo: ["TON", "stTON"] or ["TON", "bmTON"] → already handled by getPoolMeta
  const lstProtocols = ["storm_trade", "kton", "stakee"];
  
  if (lstProtocols.includes(pool.protocol.toLowerCase())) {
    // For Storm Trade, find asset without "-SLP"
    if (pool.protocol.toLowerCase().includes("storm")) {
      const underlyingAsset = symbols.find(s => !s.endsWith("-SLP"));
      if (underlyingAsset) {
        return underlyingAsset;
      }
    }
    
    // For KTON and Stakee, find "TON" (the underlying asset)
    // These have patterns like ["TON", "KTON"] or ["TON", "STAKED"]
    const tonAsset = symbols.find(s => s.toUpperCase() === "TON");
    if (tonAsset) {
      return tonAsset;
    }
  }
  
  // LP pool
  return symbols.join("-");
}

/**
 * Get pool metadata for display
 */
function getPoolMeta(pool: SwapCoffeePool): string | null {
  // For liquid staking, show the derivative token
  if (pool.tokens.length === 2) {
    const symbols = pool.tokens.map(t => t.metadata.symbol);
    
    // For LST protocols, show the derivative token
    // KTON: ["TON", "KTON"] → show "KTON"
    // Stakee: ["TON", "STAKED"] → show "STAKED"
    // Storm Trade: ["TON", "TON-SLP"] → show "TON-SLP"
    // Bemo: ["TON", "stTON"] → show "stTON"
    const tonIndex = symbols.findIndex(s => s.toUpperCase() === "TON");
    if (tonIndex !== -1) {
      const derivativeIndex = tonIndex === 0 ? 1 : 0;
      return symbols[derivativeIndex];
    }
    
    // Legacy check: If one is native TON by address, show the derivative
    const [token1, token2] = pool.tokens;
    if (token1.address.address === "native") {
      return token2.metadata.symbol;
    }
    if (token2.address.address === "native") {
      return token1.metadata.symbol;
    }
  }
  
  // For AMM pools, show AMM type
  if (pool.pool?.amm_type) {
    return `AMM: ${pool.pool.amm_type}`;
  }
  
  return null;
}

/**
 * Transform Swap Coffee pool to YieldOpportunity
 */
function transformSwapCoffeePool(pool: SwapCoffeePool): YieldOpportunity | null {
  // Skip untrusted pools
  if (!pool.is_trusted) {
    return null;
  }

  // Skip pools with very low TVL (< $100)
  if (pool.pool_statistics.tvl_usd < 100) {
    return null;
  }

  // Skip pools with very low APR (< 0.05% for most, but keep EVAA TSUSDE even if low)
  const isEvaaUsde = pool.protocol === "evaa" && 
    pool.tokens.some(t => t.metadata.symbol.toUpperCase().includes("USDE"));
  
  if (pool.pool_statistics.apr < 0.05 && !isEvaaUsde) {
    return null;
  }

  const asset = getAssetSymbol(pool);
  const assetType = classifyAsset(asset);
  
  // Skip ETH assets
  if (isEthAsset(asset)) {
    return null;
  }
  
  // Skip excluded assets (memecoins)
  if (isExcludedAsset(asset)) {
    return null;
  }

  // Skip memecoins and small cap tokens (very high APR is usually unsustainable)
  if (pool.pool_statistics.apr > 100 && pool.pool_statistics.tvl_usd < 10000) {
    return null;
  }

  const protocolName = PROTOCOL_NAME_MAP[pool.protocol] || pool.protocol;
  
  // Split APR into base and rewards
  // lp_apr = base trading fees
  // boost_apr = additional rewards
  const apyBase = pool.pool_statistics.lp_apr || 0;
  const apyReward = pool.pool_statistics.boost_apr || 0;
  const apyTotal = pool.pool_statistics.apr;
  
  // Check if this is a TON-USDT pool
  const isTonUsdt = isTonUsdtPool(asset);

  return {
    assetType,
    source: protocolName,
    sourceUrl: getProtocolUrl(pool.protocol),
    asset,
    poolMeta: getPoolMeta(pool),
    apyBase,
    apyReward: apyReward > 0 ? apyReward : null,
    apyTotal,
    tvlUsd: pool.pool_statistics.tvl_usd,
    isTonUsdtPool: isTonUsdt,
  };
}

/**
 * Filter for correlated pairs only (prevent impermanent loss)
 */
function filterCorrelatedPools(
  pools: YieldOpportunity[],
): YieldOpportunity[] {
  return pools.filter((pool) => {
    // Single assets always included
    if (isSingleAsset(pool.asset)) return true;
    
    // TON-USDT pools are included (shown in separate category)
    if (pool.isTonUsdtPool) return true;
    
    // Correlated pairs (no IL risk)
    return (
      pairBelongsToCategory(pool.asset, pool.assetType) &&
      isCorrelatedPair(pool.asset, pool.assetType)
    );
  });
}

/**
 * Fetch and transform all Swap Coffee yields
 */
export async function fetchSwapCoffeeYields(): Promise<YieldOpportunity[]> {
  console.log("Fetching yields from Swap Coffee API (100+ pools from 17 protocols)...");

  const allPools = await fetchSwapCoffeePools();
  console.log(`Fetched ${allPools.length} pools from Swap Coffee`);

  // Filter out EVAA pools - we use DefiLlama for complete EVAA coverage (includes USDE)
  // Filter out Moon - no longer live on TON
  const pools = allPools.filter(pool => {
    const protocol = pool.protocol.toLowerCase();
    return protocol !== "evaa" && protocol !== "moon";
  });
  console.log(`${pools.length} pools after excluding EVAA and Moon`);

  // Transform to yield opportunities
  const yields = pools
    .map(transformSwapCoffeePool)
    .filter((y): y is YieldOpportunity => y !== null);

  console.log(`${yields.length} Swap Coffee yields after transformation`);

  // Apply correlation filter
  const correlatedYields = filterCorrelatedPools(yields);
  console.log(
    `${correlatedYields.length} Swap Coffee yields after correlation filter`,
  );

  return correlatedYields;
}

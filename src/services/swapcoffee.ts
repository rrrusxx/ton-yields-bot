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
  leftOutNote,
  pairBelongsToCategory,
  isSingleAsset,
  isSingleAssetInCategory,
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
  "tonco_v2": "Tonco",
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

export interface SwapCoffeePool {
  address: string;
  protocol: string;
  is_trusted: boolean;
  tokens: SwapCoffeeToken[];
  // Numbers can arrive as strings, including "NaN" (seen in Nov 2026)
  pool_statistics: {
    tvl_usd: number | string;
    volume_usd: number | string;
    apr: number | string;
    lp_apr: number | string;
    boost_apr: number | string;
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
      signal: AbortSignal.timeout(15000),
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
 * The native L1 token was renamed from TON to GRAM. Some pools still expose
 * the underlying as "TON" while most now use "GRAM" — treat both as native.
 */
function isNativeSymbol(symbol: string): boolean {
  const s = symbol.toUpperCase();
  return s === "TON" || s === "GRAM";
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
  // (native token renamed TON -> GRAM)
  // Storm Trade: ["GRAM", "TON-SLP"] → show as "GRAM"
  // KTON: ["GRAM", "KTON"] → show as "GRAM"
  // Stakee: ["GRAM", "STAKED"] → show as "GRAM"
  // Bemo: ["GRAM", "stTON"] or ["GRAM", "bmTON"] → already handled by getPoolMeta
  const lstProtocols = ["storm_trade", "kton", "stakee"];
  
  if (lstProtocols.includes(pool.protocol.toLowerCase())) {
    // For Storm Trade, find asset without "-SLP"
    if (pool.protocol.toLowerCase().includes("storm")) {
      const underlyingAsset = symbols.find(s => !s.endsWith("-SLP"));
      if (underlyingAsset) {
        return underlyingAsset;
      }
    }
    
    // For KTON and Stakee, find the native asset (TON/GRAM) as underlying
    // These have patterns like ["GRAM", "KTON"] or ["GRAM", "STAKED"]
    const tonAsset = symbols.find(s => isNativeSymbol(s));
    if (tonAsset) {
      return tonAsset;
    }
  }
  
  // LP pool. GRAM-USDT pools always read "GRAM-USDT" (Swap.coffee sends Ston.fi's
  // as USDT/GRAM), the same order DeDust and Tonco rows use.
  const joined = symbols.join("-");
  if (symbols.length === 2 && isTonUsdtPool(joined) && !isNativeSymbol(symbols[0])) {
    return `${symbols[1]}-${symbols[0]}`;
  }
  return joined;
}

/**
 * Labels of DEX pools: the protocol version where a DEX runs several side by
 * side, and "CL" for concentrated liquidity (Tonco), where fees go only to
 * positions whose price range covers the market price, so the pool's APY is
 * not what a given LP earns (the legend says so).
 */
const DEX_VERSION_LABELS: Record<string, string> = {
  stonfi: "v1",
  stonfi_v2: "v2",
  tonco: "CL v1",
  tonco_v2: "CL",
};

/**
 * DEX protocols. Their rows are LP pools, and the pair already names both
 * tokens, so they never take a token as their label: until 2026-11-27 the
 * Ston.fi GRAM/tsTON pool read "GRAM-tsTON (tsTON)", exactly like Tonstakers'
 * staking row.
 */
const DEX_PROTOCOLS = new Set(["stonfi", "stonfi_v2", "coffee", "tonco", "tonco_v2", "bidask", "moon", "dedust"]);

/**
 * Get pool metadata for display
 */
function getPoolMeta(pool: SwapCoffeePool): string | null {
  // DEX pools are labelled by version or kind: Ston.fi's pairs exist on v1
  // and v2 (the GRAM-USDT pools used to share one label and one 7-day
  // history), and Tonco's are concentrated-liquidity pools. Other DEX pools
  // take no label.
  const protocol = pool.protocol.toLowerCase();
  const versionLabel = DEX_VERSION_LABELS[protocol];
  if (versionLabel) return versionLabel;
  if (DEX_PROTOCOLS.has(protocol)) return null;

  // For liquid staking, show the derivative token
  if (pool.tokens.length === 2) {
    const symbols = pool.tokens.map(t => t.metadata.symbol);
    
    // For LST protocols, show the derivative token
    // KTON: ["GRAM", "KTON"] → show "KTON"
    // Stakee: ["GRAM", "STAKED"] → show "STAKED"
    // Storm Trade: ["GRAM", "TON-SLP"] → show "TON-SLP"
    // Bemo: ["GRAM", "stTON"] → show "stTON"
    const tonIndex = symbols.findIndex(s => isNativeSymbol(s));
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
export function transformSwapCoffeePool(pool: SwapCoffeePool): YieldOpportunity | null {
  // Skip untrusted pools
  if (!pool.is_trusted) {
    return null;
  }

  // Coerce statistics to numbers (the API can send strings, including "NaN").
  // A pool without a real TVL is skipped.
  const tvlUsd = Number(pool.pool_statistics.tvl_usd);
  if (!Number.isFinite(tvlUsd)) {
    const symbols = pool.tokens.map((t) => t.metadata.symbol).join("/");
    console.warn(`  ↳ Swap.coffee ${pool.protocol} ${symbols}: skipped, TVL is not a number (${pool.pool_statistics.tvl_usd})`);
    return null;
  }
  // A non-numeric APR stays NaN on purpose: a Palette override can still
  // replace it. fetchTonYields drops rows whose APY is still not a number
  // after the overrides.
  const apr = Number(pool.pool_statistics.apr);
  const lpApr = Number(pool.pool_statistics.lp_apr);
  const boostApr = Number(pool.pool_statistics.boost_apr);

  // Skip pools with very low TVL (< $100)
  if (tvlUsd < 100) {
    return null;
  }

  // Skip pools with very low APR (< 0.05% for most, but keep EVAA TSUSDE even if low)
  const isEvaaUsde = pool.protocol === "evaa" &&
    pool.tokens.some(t => t.metadata.symbol.toUpperCase().includes("USDE"));

  if (apr < 0.05 && !isEvaaUsde) {
    return null;
  }

  const asset = getAssetSymbol(pool);
  const assetType = classifyAsset(asset);
  
  // Skip excluded assets (memecoins)
  if (isExcludedAsset(asset)) {
    return null;
  }

  // Skip memecoins and small cap tokens (very high APR is usually unsustainable)
  if (apr > 100 && tvlUsd < 10000) {
    return null;
  }

  const protocolName = PROTOCOL_NAME_MAP[pool.protocol] || pool.protocol;

  // Split APR into base and rewards
  // lp_apr = base trading fees
  // boost_apr = additional rewards
  const apyBase = Number.isFinite(lpApr) ? lpApr : 0;
  const apyReward = Number.isFinite(boostApr) ? boostApr : 0;
  const apyTotal = apr;
  
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
    tvlUsd,
    isTonUsdtPool: isTonUsdt,
    poolAddress: pool.address,
  };
}

/**
 * Filter for correlated pairs only (prevent impermanent loss), and single
 * tokens that belong to their section
 */
export function filterCorrelatedPools(
  pools: YieldOpportunity[],
): YieldOpportunity[] {
  return pools.filter((pool) => {
    // Single assets stay only in their own section: in the GRAM section,
    // GRAM and its staking tokens (see isSingleAssetInCategory)
    if (isSingleAsset(pool.asset)) {
      if (isSingleAssetInCategory(pool.asset, pool.assetType)) return true;
      console.warn(`  ↳ Swap.coffee ${pool.source} ${leftOutNote(pool.asset, pool.assetType)}`);
      return false;
    }
    
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
  // Filter out DeDust - its APR is always 0 here; dedust.ts reads DeDust's own API
  // Filter out Affluent - hacked on 2026-10-16 and dead since (owner's choice of 2026-11-27)
  const pools = allPools.filter(pool => {
    const protocol = pool.protocol.toLowerCase();
    // Fiva and Daolama temporarily disabled
    return protocol !== "evaa" &&
      protocol !== "moon" &&
      !protocol.startsWith("dedust") &&
      !protocol.includes("fiva") &&
      !protocol.includes("daolama") &&
      !protocol.includes("dao_lama") &&
      !protocol.includes("affluent");
  });
  console.log(`${pools.length} pools after excluding EVAA, Moon, DeDust, Fiva, Daolama and Affluent`);

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

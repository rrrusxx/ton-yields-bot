/**
 * Morpho Protocol Data Service
 * Fetches yield data from Morpho Goldsky subgraph for TAC chain
 */

import {
  classifyAsset,
  formatProtocolName,
  getProtocolUrl,
  isCorrelatedPair,
  pairBelongsToCategory,
  isSingleAsset,
  isEthAsset,
} from "./protocols.ts";
import type { YieldOpportunity } from "../types/yields.ts";

const MORPHO_GOLDSKY_URL =
  "https://api.goldsky.com/api/public/project_cmb98e0e8apjg01q7eg6u5w6f/subgraphs/morpho-subgraph-prod/1.0.3/gn";

interface MorphoAsset {
  symbol: string;
  id: string;
  decimals: number;
}

interface MorphoRate {
  rate: string;
}

interface MorphoMarket {
  enabled: boolean;
  market: {
    inputTokenBalance: string;
  };
}

interface MorphoMetaMorpho {
  id: string;
  name: string;
  symbol: string;
  decimals: number;
  asset: MorphoAsset;
  rate: MorphoRate;
  lastTotalAssets: string;
  idle: string;
  markets: MorphoMarket[];
}

interface MorphoGraphQLResponse {
  data?: {
    metaMorphos: MorphoMetaMorpho[];
  };
  errors?: Array<{ message: string }>;
}

/**
 * Query Morpho Goldsky subgraph for MetaMorpho vaults
 */
async function queryMetaMorphos(query: string): Promise<MorphoMetaMorpho[]> {
  try {
    const response = await fetch(MORPHO_GOLDSKY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      throw new Error(
        `Morpho API error: ${response.status} ${response.statusText}`,
      );
    }

    const result: MorphoGraphQLResponse = await response.json();

    if (result.errors) {
      console.error("Morpho GraphQL errors:", result.errors);
      return [];
    }

    return result.data?.metaMorphos || [];
  } catch (error) {
    console.error("Failed to query Morpho subgraph:", error);
    return [];
  }
}

/**
 * Convert Morpho MetaMorpho rate to APY
 * Rate is in decimal format (e.g., 0.034147 = 3.41%)
 */
function rateToApy(rateStr: string): number {
  const rate = parseFloat(rateStr);
  if (isNaN(rate)) return 0;
  
  // Convert decimal to percentage
  return rate * 100;
}

/**
 * Calculate TVL from lastTotalAssets (Total Deposits in the vault)
 * This represents all assets deposited by users, regardless of deployment status
 */
function calculateTVL(vault: MorphoMetaMorpho): number {
  const assetDecimals = vault.asset.decimals;
  const totalAssets = parseFloat(vault.lastTotalAssets || "0");
  
  if (isNaN(totalAssets) || totalAssets === 0) return 0;
  
  // Convert from smallest unit to whole tokens
  return totalAssets / (10 ** assetDecimals);
}

/**
 * Estimate USD value for TVL (rough approximation)
 * We don't have price feeds, so we use approximate market prices
 */
function estimateUSDValue(tokenAmount: number, assetSymbol: string): number {
  // Rough price estimates (as of Jan 2026)
  const priceEstimates: Record<string, number> = {
    "TON": 1.75,      // ~$1.75
    "TSTON": 1.75,    // Same as TON
    "USD₮": 1.0,      // USDT = $1
    "USDT": 1.0,
    "USDC": 1.0,
    "WETH": 3300,     // ~$3,300
    "ETH": 3300,
    "WBTC": 95000,    // ~$95,000
    "CBBTC": 95000,
    "LBTC": 95000,
  };
  
  const price = priceEstimates[assetSymbol.toUpperCase()] || 0;
  return tokenAmount * price;
}

/**
 * Transform MetaMorpho vault to YieldOpportunity
 */
function transformMetaMorpho(vault: MorphoMetaMorpho): YieldOpportunity | null {
  const apy = rateToApy(vault.rate.rate);
  
  // Skip if APY is very low (below 0.01%)
  if (apy < 0.01) {
    return null;
  }

  const asset = vault.asset.symbol;
  const assetType = classifyAsset(asset);
  
  // Skip test tokens (BMW, LADA, etc.)
  const testTokens = ["BMW", "LADA", "unknown"];
  if (testTokens.some(test => asset.toUpperCase().includes(test.toUpperCase()))) {
    return null;
  }
  
  // Skip ETH assets - we only show TON, Stablecoins, and BTC
  if (isEthAsset(asset)) {
    return null;
  }

  // Calculate TVL (deployed capital + idle)
  const tvlInTokens = calculateTVL(vault);
  const tvlUsd = estimateUSDValue(tvlInTokens, asset);

  // Skip vaults with no TVL
  if (tvlUsd < 100) {
    return null;
  }

  return {
    assetType,
    source: "Morpho",
    sourceUrl: getProtocolUrl("morpho"),
    asset,
    poolMeta: vault.name, // Show vault name (e.g., "Re7 USDT", "SingularV TON Tonstakers")
    apyBase: apy,
    apyReward: null,
    apyTotal: apy,
    tvlUsd,
  };
}

/**
 * Filter for correlated pairs only (same IL risk logic as other services)
 */
function filterCorrelatedMorphoYields(
  pools: YieldOpportunity[],
): YieldOpportunity[] {
  return pools.filter((pool) => {
    if (isSingleAsset(pool.asset)) return true;
    return (
      pairBelongsToCategory(pool.asset, pool.assetType) &&
      isCorrelatedPair(pool.asset, pool.assetType)
    );
  });
}

/**
 * Fetch all Morpho MetaMorpho vault yields for TAC chain
 * 
 * Using the MetaMorpho vault query as recommended by Morpho team.
 * This provides accurate vault-level APYs including all fees and rewards.
 */
export async function fetchMorphoYields(): Promise<YieldOpportunity[]> {
  console.log("Fetching yields from Morpho Goldsky subgraph (MetaMorpho vaults)...");

  const metaMorphosQuery = `{
    metaMorphos {
      id
      name
      symbol
      decimals
      asset {
        symbol
        id
        decimals
      }
      rate {
        rate
      }
      lastTotalAssets
      idle
      markets(first: 20) {
        enabled
        market {
          inputTokenBalance
        }
      }
    }
  }`;

  // Fetch MetaMorpho vaults
  const vaults = await queryMetaMorphos(metaMorphosQuery);
  console.log(`Fetched ${vaults.length} MetaMorpho vaults`);

  // Transform vaults to yield opportunities
  const yields = vaults
    .map(transformMetaMorpho)
    .filter((y): y is YieldOpportunity => y !== null);

  console.log(`${yields.length} Morpho yields after transformation`);

  // Apply correlation filter
  const correlatedYields = filterCorrelatedMorphoYields(yields);
  console.log(`${correlatedYields.length} Morpho yields after correlation filter`);

  return correlatedYields;
}

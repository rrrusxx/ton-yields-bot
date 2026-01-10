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

interface MorphoRate {
  rate: string;
  side: "LENDER" | "BORROWER";
  type: string;
}

interface MorphoToken {
  symbol: string;
  name: string;
  decimals: number;
}

interface MorphoMarket {
  id: string;
  name: string;
  protocol: {
    name: string;
  };
  inputToken: MorphoToken;
  rates: MorphoRate[];
  inputTokenBalance: string;
  totalValueLockedUSD: string;
  totalDepositBalanceUSD: string;
}

interface MorphoGraphQLResponse {
  data?: {
    markets: MorphoMarket[];
  };
  errors?: Array<{ message: string }>;
}

/**
 * Query Morpho Goldsky subgraph
 */
async function queryMorpho(query: string): Promise<MorphoMarket[]> {
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

    return result.data?.markets || [];
  } catch (error) {
    console.error("Failed to query Morpho subgraph:", error);
    return [];
  }
}

/**
 * Calculate TVL from token balance and decimals
 * Note: This is a rough estimate since we don't have price data from the subgraph
 * We'll use a minimum threshold to filter out empty markets
 */
function estimateTVL(balance: string, decimals: number): number {
  const balanceNum = parseFloat(balance);
  if (isNaN(balanceNum) || balanceNum === 0) return 0;
  
  // Convert from token units to whole tokens
  const tokens = balanceNum / (10 ** decimals);
  
  // For now, we'll use the token count as a proxy
  // This is not USD but allows us to filter by activity
  return tokens;
}

/**
 * Extract asset symbol from Morpho market name
 * Format: "CollateralAsset / LoanAsset"
 * For supply yields, we want the loan asset (what's being supplied)
 */
function extractAssetSymbol(marketName: string, inputToken: MorphoToken): string {
  // Use inputToken symbol as primary source
  if (inputToken.symbol && inputToken.symbol !== "unknown") {
    return inputToken.symbol;
  }

  // Fallback: parse from market name
  // Market name format: "CollateralAsset / LoanAsset"
  const parts = marketName.split("/").map((p) => p.trim());
  if (parts.length === 2) {
    return parts[1]; // Return loan asset (what's being supplied)
  }

  return marketName;
}

/**
 * Convert Morpho interest rate to APY
 * Morpho rates are stored as decimal values (e.g., 0.08 = 8%)
 */
function rateToApy(rateStr: string): number {
  const rate = parseFloat(rateStr);
  if (isNaN(rate)) return 0;
  
  // Convert to percentage
  return rate * 100;
}

/**
 * Transform Morpho market to YieldOpportunity
 */
function transformMorphoMarket(market: MorphoMarket): YieldOpportunity | null {
  // Find LENDER rate (supply APY)
  const lenderRate = market.rates.find((r) => r.side === "LENDER");
  if (!lenderRate) {
    return null; // Skip markets without supply yields
  }

  const apy = rateToApy(lenderRate.rate);
  
  // Skip if APY is very low or market has no deposits
  if (apy < 0.1 || market.inputTokenBalance === "0") {
    return null;
  }

  const asset = extractAssetSymbol(market.name, market.inputToken);
  const assetType = classifyAsset(asset);

  // Estimate TVL (not in USD, just token count for filtering)
  const tvlProxy = estimateTVL(
    market.inputTokenBalance,
    market.inputToken.decimals || 18,
  );

  // Skip markets with very low activity (< 10 tokens)
  // This filters out test markets and inactive pools
  if (tvlProxy < 10) {
    return null;
  }
  
  // Skip test tokens (BMW, LADA, etc.)
  const testTokens = ["BMW", "LADA", "unknown"];
  if (testTokens.some(test => asset.toUpperCase().includes(test.toUpperCase()))) {
    return null;
  }
  
  // Skip ETH assets - we only show TON, Stablecoins, and BTC
  if (isEthAsset(asset)) {
    return null;
  }

  return {
    assetType,
    source: "Morpho",
    sourceUrl: getProtocolUrl("morpho"),
    asset,
    poolMeta: null,
    apyBase: apy,
    apyReward: null,
    apyTotal: apy,
    tvlUsd: tvlProxy, // Note: This is token count, not USD
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
 * Fetch all Morpho yields for TAC chain (direct markets only)
 * 
 * Note: We only fetch direct Morpho Blue markets, not MetaMorpho vaults.
 * Vault-level APYs include fees and rewards that are not available in the 
 * Goldsky subgraph, making vault yields inaccurate. Direct market yields 
 * are accurate and reliable.
 */
export async function fetchMorphoYields(): Promise<YieldOpportunity[]> {
  console.log("Fetching yields from Morpho Goldsky subgraph (direct markets only)...");

  const marketsQuery = `{
    markets(
      first: 100
      where: { isActive: true }
    ) {
      id
      name
      protocol {
        name
      }
      inputToken {
        symbol
        name
        decimals
      }
      rates(first: 10) {
        rate
        side
        type
      }
      inputTokenBalance
      totalValueLockedUSD
      totalDepositBalanceUSD
    }
  }`;

  // Fetch only direct markets (not vault allocations)
  const directMarkets = await queryMorpho(marketsQuery);
  console.log(`Fetched ${directMarkets.length} direct Morpho markets`);

  // Transform direct markets to yield opportunities
  const yields = directMarkets
    .map(transformMorphoMarket)
    .filter((y): y is YieldOpportunity => y !== null);

  console.log(`${yields.length} Morpho yields after transformation`);

  // Apply correlation filter
  const correlatedYields = filterCorrelatedMorphoYields(yields);
  console.log(`${correlatedYields.length} Morpho yields after correlation filter`);

  return correlatedYields;
}

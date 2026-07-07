import type { YieldOpportunity } from "../types/yields.ts";

const GTC_API = "https://api.giftcredit.app/api/v1/analytics/pools/yield";
const GTC_APP_URL =
  "https://t.me/GiftToCreditBot/app?startapp=ref_NcB5ZyHKtq";

interface GtcPool {
  currency: string;
  symbol: string;
  tvl: number;
  supplyApy: number;
  utilization: number;
  halted: boolean;
}

function normalizeSymbol(symbol: string): string {
  return symbol.replace(/USD₮/g, "USDT").trim();
}

function transformGtcPool(pool: GtcPool): YieldOpportunity {
  const asset = normalizeSymbol(pool.symbol);
  const assetType = pool.currency === "usdt" || asset === "USDT" ? "STABLE" : "TON";
  const apyTotal = pool.supplyApy * 100;

  return {
    assetType,
    source: "GTC",
    sourceUrl: GTC_APP_URL,
    asset: `${asset} vault`,
    poolMeta: null,
    apyBase: apyTotal,
    apyReward: null,
    apyTotal,
    tvlUsd: pool.tvl,
    utilizationPct: pool.utilization * 100,
  };
}

/**
 * Fetch GRAM and USDT lending vault yields from Gift To Credit (GTC).
 * supplyApy is returned as a decimal; utilization reflects borrow demand.
 */
export async function fetchGtcYields(): Promise<YieldOpportunity[]> {
  console.log("Fetching yields from GTC (Gift To Credit)...");

  try {
    const response = await fetch(GTC_API, {
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`GTC API error: ${response.status} ${response.statusText}`);
    }

    const pools: GtcPool[] = await response.json();
    const yields = pools
      .filter((pool) => !pool.halted && pool.tvl > 0)
      .map(transformGtcPool);

    for (const y of yields) {
      console.log(
        `  ↳ GTC ${y.asset}: ${y.apyTotal.toFixed(2)}% APY, util ${y.utilizationPct!.toFixed(1)}%, TVL $${(y.tvlUsd / 1000).toFixed(1)}K`,
      );
    }

    console.log(`Fetched ${yields.length} GTC vault yields`);
    return yields;
  } catch (error) {
    console.error("Failed to fetch GTC yields:", error);
    return [];
  }
}

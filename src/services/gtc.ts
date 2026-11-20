import type { YieldOpportunity } from "../types/yields.ts";
import { fetchGramPriceUsd } from "./prices.ts";

const GTC_API = "https://api.giftcredit.app/api/v1/analytics/pools/yield";
const GTC_APP_URL =
  "https://t.me/GiftToCreditBot/app?startapp=ref_NcB5ZyHKtq";

export interface GtcPool {
  currency: string;
  symbol: string;
  /** TVL in the vault's own asset (GRAM or USDT), not in USD */
  tvl: number;
  supplyApy: number;
  utilization: number;
  halted: boolean;
}

function normalizeSymbol(symbol: string): string {
  return symbol.replace(/USD₮/g, "USDT").trim();
}

/**
 * Which kind of vault this is, from its currency id or its symbol, so a
 * rename on either side ("ton" to "gram", "USDT" in upper case) does not
 * drop the row. Null for anything else.
 */
function vaultKind(pool: GtcPool): "STABLE" | "TON" | null {
  const currency = String(pool.currency ?? "").trim().toLowerCase();
  const symbol = normalizeSymbol(String(pool.symbol ?? "")).toUpperCase();
  if (currency === "usdt" || symbol === "USDT") return "STABLE";
  if (currency === "ton" || currency === "gram" || symbol === "TON" || symbol === "GRAM") return "TON";
  return null;
}

/**
 * Convert one GTC vault to a yield row. The API reports TVL in the vault's
 * asset: USDT is taken 1:1 as USD, GRAM is converted with the GRAM price.
 * Without a GRAM price the GRAM vault keeps its APY but shows no TVL.
 * Returns null for vaults this code cannot classify or price.
 */
export function transformGtcPool(pool: GtcPool, gramPriceUsd: number | null): YieldOpportunity | null {
  const asset = normalizeSymbol(String(pool.symbol ?? ""));
  const apyTotal = Number(pool.supplyApy) * 100;
  const tvl = Number(pool.tvl);
  if (!Number.isFinite(apyTotal) || !Number.isFinite(tvl)) {
    console.warn(`  ↳ GTC ${asset}: skipped, non-numeric APY or TVL`);
    return null;
  }

  const assetType = vaultKind(pool);
  if (assetType === null) {
    console.warn(`  ↳ GTC ${asset}: skipped, unknown vault currency "${pool.currency}"`);
    return null;
  }

  let tvlUsd: number;
  let tvlHidden = false;
  if (assetType === "STABLE") {
    tvlUsd = tvl;
  } else if (gramPriceUsd !== null) {
    tvlUsd = tvl * gramPriceUsd;
  } else {
    tvlUsd = 0;
    tvlHidden = true;
    console.warn(`  ↳ GTC ${asset}: no GRAM price, TVL hidden`);
  }

  const utilization = Number(pool.utilization);

  return {
    assetType,
    source: "GTC",
    sourceUrl: GTC_APP_URL,
    asset: `${asset} vault`,
    poolMeta: null,
    apyBase: apyTotal,
    apyReward: null,
    apyTotal,
    tvlUsd,
    ...(tvlHidden && { tvlHidden: true }),
    ...(Number.isFinite(utilization) && { utilizationPct: utilization * 100 }),
  };
}

/**
 * Fetch the vault list. The body is read inside this promise, so a slow GRAM
 * price lookup running in parallel cannot outlive the request timeout.
 */
async function fetchGtcPools(): Promise<GtcPool[]> {
  const response = await fetch(GTC_API, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`GTC API error: ${response.status} ${response.statusText}`);
  }
  return await response.json() as GtcPool[];
}

/**
 * Fetch GRAM and USDT lending vault yields from Gift To Credit (GTC).
 * supplyApy is returned as a decimal; utilization reflects borrow demand.
 */
export async function fetchGtcYields(): Promise<YieldOpportunity[]> {
  console.log("Fetching yields from GTC (Gift To Credit)...");

  try {
    const [pools, gramPriceUsd] = await Promise.all([fetchGtcPools(), fetchGramPriceUsd()]);

    const yields = pools
      .filter((pool) => !pool.halted && Number(pool.tvl) > 0)
      .map((pool) => transformGtcPool(pool, gramPriceUsd))
      .filter((y): y is YieldOpportunity => y !== null);

    for (const y of yields) {
      const tvlText = y.tvlHidden ? "TVL hidden" : `TVL $${(y.tvlUsd / 1000).toFixed(1)}K`;
      const utilText = y.utilizationPct === undefined ? "util n/a" : `util ${y.utilizationPct.toFixed(1)}%`;
      console.log(`  ↳ GTC ${y.asset}: ${y.apyTotal.toFixed(2)}% APY, ${utilText}, ${tvlText}`);
    }

    if (yields.length === 0) {
      console.warn("GTC returned no active vaults");
    }
    console.log(`Fetched ${yields.length} GTC vault yields`);
    return yields;
  } catch (error) {
    console.error("Failed to fetch GTC yields:", error);
    return [];
  }
}

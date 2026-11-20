import {
  classifyAsset,
  getProtocolUrl,
} from "./protocols.ts";
import type { YieldOpportunity, DefiLlamaPool } from "../types/yields.ts";

// DefiLlama yields API (APY of sUSDe, which tsUSDe on TON earns)
const DEFILLAMA_API_URL = "https://yields.llama.fi/pools";

// DefiLlama "Ethena tsUSDe" listing: tsUSDe locked on TON only
const ETHENA_TON_PROTOCOL_URL = "https://api.llama.fi/protocol/ethena-tsusde";

// Fetch Ethena sUSDe pools from DefiLlama
async function fetchEthenaPools(): Promise<DefiLlamaPool[]> {
  const response = await fetch(DEFILLAMA_API_URL, { signal: AbortSignal.timeout(20000) });

  if (!response.ok) {
    await response.body?.cancel();
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

/**
 * TVL of tsUSDe on TON in USD, from DefiLlama's Ethena tsUSDe listing.
 * Returns null on any failure; the row then shows no TVL.
 *
 * The sUSDe pools in the yields API are on Ethereum, so their TVL (over $1B)
 * must never be shown for TON. Until 2026-11-20 the bot did exactly that.
 */
async function fetchEthenaTonTvl(): Promise<number | null> {
  try {
    const response = await fetch(ETHENA_TON_PROTOCOL_URL, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
      await response.body?.cancel();
      console.warn(`Ethena TON TVL: HTTP ${response.status} ${response.statusText}`);
      return null;
    }
    const data = await response.json() as { currentChainTvls?: Record<string, unknown> };
    const tvl = Number(data?.currentChainTvls?.TON);
    if (!Number.isFinite(tvl) || tvl <= 0) {
      console.warn("Ethena TON TVL: no usable TON value in the DefiLlama response");
      return null;
    }
    return tvl;
  } catch (error) {
    console.warn("Ethena TON TVL: request failed:", error instanceof Error ? error.message : error);
    return null;
  }
}

// Highest sUSDe APY among DefiLlama's Ethena pools (they share one rate)
function maxApy(pools: DefiLlamaPool[]): number {
  let best = 0;
  for (const pool of pools) {
    const apy = Number(pool.apy);
    if (Number.isFinite(apy)) {
      best = Math.max(best, apy);
    }
  }
  return best;
}

// Build the tsUSDe row
function transformEthenaToken(
  apy: number,
  tonTvl: number | null,
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
    tvlUsd: tonTvl ?? 0,
    ...(tonTvl === null && { tvlHidden: true }),
  };
}

// Main function to fetch Ethena yields
export async function fetchEthenaYields(): Promise<YieldOpportunity[]> {
  console.log("Fetching yields from Ethena (DefiLlama: sUSDe APY, tsUSDe TVL on TON)...");

  try {
    const [pools, tonTvl] = await Promise.all([fetchEthenaPools(), fetchEthenaTonTvl()]);

    if (pools.length === 0) {
      console.log("No Ethena sUSDE pools found on DefiLlama");
      return [];
    }

    const apy = maxApy(pools);

    if (apy < 0.1) {
      console.log(`Skipping Ethena tsUSDE - APY too low (${apy}%)`);
      return [];
    }

    const yieldOpp = transformEthenaToken(apy, tonTvl);

    const tvlText = tonTvl === null ? "TVL hidden" : `$${(tonTvl / 1000000).toFixed(2)}M TVL on TON`;
    console.log(`✓ tsUSDE (sUSDe APY): ${apy.toFixed(2)}% APY, ${tvlText}`);

    return [yieldOpp];
  } catch (error) {
    console.error("Failed to fetch Ethena yields:", error);
    return [];
  }
}

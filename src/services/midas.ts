import type { YieldOpportunity } from "../types/yields.ts";

const TONAPI_JETTON_URL =
  "https://tonapi.io/v2/jettons/EQAPMnib1eghlNQ9TnLZKCMUsY1QJ4rQ7pyB7PvGWxMIeQlM";

const COINGECKO_PRICE_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=midas-mre7yield&vs_currencies=usd";

const MIDAS_APYS_URL = "https://api-prod.midas.app/api/data/apys";
const TELEGRAM_WALLET_URL = "https://bit.ly/Earn_With_USDT";

interface TonApiJettonResponse {
  total_supply: string;
  metadata?: {
    decimals?: string;
  };
}

interface CoinGeckoPriceResponse {
  "midas-mre7yield"?: {
    usd?: number;
  };
}

interface MidasApysResponse {
  mre7?: number;
}

/**
 * Fetch the 7-day trailing APY for the mRe7 product from Midas API.
 * Returns APY as a percentage (e.g. 0.0423 → 4.23%).
 */
async function fetchMidasApy(): Promise<number> {
  const response = await fetch(MIDAS_APYS_URL, {
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Midas APY API error: ${response.status} ${response.statusText}`);
  }

  const data: MidasApysResponse = await response.json();
  const apyDecimal = data.mre7;

  if (apyDecimal === null || apyDecimal === undefined) {
    throw new Error("Midas APY API returned no mre7 value");
  }

  return apyDecimal * 100;
}

/**
 * Fetch total supply of the mRe7YIELD jetton from TonAPI.
 * Returns the human-readable amount (adjusted for decimals).
 */
async function fetchJettonSupply(): Promise<number> {
  const response = await fetch(TONAPI_JETTON_URL, {
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`TonAPI error: ${response.status} ${response.statusText}`);
  }

  const data: TonApiJettonResponse = await response.json();
  const decimals = parseInt(data.metadata?.decimals ?? "9", 10);
  const raw = BigInt(data.total_supply);
  return Number(raw) / Math.pow(10, decimals);
}

/**
 * Fetch the USD price of mRe7YIELD from CoinGecko.
 */
async function fetchMidasPrice(): Promise<number> {
  const response = await fetch(COINGECKO_PRICE_URL, {
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(
      `CoinGecko error: ${response.status} ${response.statusText}`,
    );
  }

  const data: CoinGeckoPriceResponse = await response.json();
  const price = data["midas-mre7yield"]?.usd;

  if (!price || price <= 0) {
    throw new Error("CoinGecko returned no price for midas-mre7yield");
  }

  return price;
}

/**
 * Fetch the Midas Re7 USDT vault yield opportunity.
 * APY comes from Midas's 7-day trailing rate (mre7); TVL is supply × price.
 */
export async function fetchMidasVaultYield(): Promise<YieldOpportunity | null> {
  console.log("Fetching Midas Re7 USDT vault (APY + TVL)...");

  try {
    const [apy, supply, price] = await Promise.all([
      fetchMidasApy(),
      fetchJettonSupply(),
      fetchMidasPrice(),
    ]);

    const tvlUsd = supply * price;
    console.log(
      `Midas vault: APY=${apy.toFixed(2)}% (7d trailing), supply=${supply.toFixed(2)} mRe7YIELD, price=$${price.toFixed(4)}, TVL=$${tvlUsd.toFixed(0)}`,
    );

    return {
      assetType: "STABLE",
      source: "Telegram Wallet",
      sourceUrl: TELEGRAM_WALLET_URL,
      asset: "Midas USDT vault",
      poolMeta: null,
      apyBase: apy,
      apyReward: null,
      apyTotal: apy,
      tvlUsd,
      apyNote: "7d trailing",
    };
  } catch (error) {
    console.error("Failed to fetch Midas vault data:", error);
    return null;
  }
}

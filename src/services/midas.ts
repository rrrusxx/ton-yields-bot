import type { YieldOpportunity } from "../types/yields.ts";

const TONAPI_JETTON_URL =
  "https://tonapi.io/v2/jettons/EQAPMnib1eghlNQ9TnLZKCMUsY1QJ4rQ7pyB7PvGWxMIeQlM";

const COINGECKO_PRICE_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=midas-mre7yield&vs_currencies=usd";

// Hardcoded APY - 5-year average annual return for Midas Re7 USDT product
const MIDAS_APY = 17.98;
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
 * Fetch the Midas Re7 USDT vault as a hardcoded YieldOpportunity.
 * APY is set to the 5-year average annual return of the underlying Midas product.
 * TVL is calculated dynamically: mRe7YIELD total supply × current USD price.
 */
export async function fetchMidasVaultYield(): Promise<YieldOpportunity | null> {
  console.log("Fetching Midas Re7 USDT vault TVL...");

  try {
    const [supply, price] = await Promise.all([
      fetchJettonSupply(),
      fetchMidasPrice(),
    ]);

    const tvlUsd = supply * price;
    console.log(
      `Midas vault: supply=${supply.toFixed(2)} mRe7YIELD, price=$${price.toFixed(4)}, TVL=$${tvlUsd.toFixed(0)}`,
    );

    return {
      assetType: "STABLE",
      source: "Telegram Wallet",
      sourceUrl: TELEGRAM_WALLET_URL,
      asset: "Midas USDT vault",
      poolMeta: null,
      apyBase: MIDAS_APY,
      apyReward: null,
      apyTotal: MIDAS_APY,
      tvlUsd,
      apyNote: "5y avg",
    };
  } catch (error) {
    console.error("Failed to fetch Midas vault data:", error);
    return null;
  }
}

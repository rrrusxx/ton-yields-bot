/**
 * GRAM (formerly TON) spot price in USD, used to convert TVL reported in
 * GRAM into dollars.
 *
 * Primary source: DefiLlama coins API. Fallback: CoinGecko simple price.
 * Both still list GRAM under the pre-rename CoinGecko id "the-open-network".
 */

const COIN_ID = "the-open-network";
const DEFILLAMA_PRICE_URL = `https://coins.llama.fi/prices/current/coingecko:${COIN_ID}`;
const COINGECKO_PRICE_URL =
  `https://api.coingecko.com/api/v3/simple/price?ids=${COIN_ID}&vs_currencies=usd`;

function toPrice(value: unknown): number | null {
  const price = typeof value === "number" ? value : Number(value);
  return Number.isFinite(price) && price > 0 ? price : null;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  return await response.json();
}

async function fromDefiLlama(): Promise<number | null> {
  const data = await fetchJson(DEFILLAMA_PRICE_URL) as {
    coins?: Record<string, { price?: unknown }>;
  };
  return toPrice(data?.coins?.[`coingecko:${COIN_ID}`]?.price);
}

async function fromCoinGecko(): Promise<number | null> {
  const data = await fetchJson(COINGECKO_PRICE_URL) as Record<string, { usd?: unknown }>;
  return toPrice(data?.[COIN_ID]?.usd);
}

/**
 * Returns the GRAM price in USD, or null when neither source gives a
 * positive number. Callers must not guess a price on null.
 */
export async function fetchGramPriceUsd(): Promise<number | null> {
  for (const [name, source] of [["DefiLlama", fromDefiLlama], ["CoinGecko", fromCoinGecko]] as const) {
    try {
      const price = await source();
      if (price !== null) {
        return price;
      }
      console.warn(`GRAM price: ${name} returned no usable value`);
    } catch (error) {
      console.warn(`GRAM price: ${name} request failed:`, error instanceof Error ? error.message : error);
    }
  }
  return null;
}

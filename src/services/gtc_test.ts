import { assertEquals } from "std/assert/mod.ts";
import { fetchGtcYields, type GtcPool, transformGtcPool } from "./gtc.ts";

function pool(overrides: Partial<GtcPool>): GtcPool {
  return {
    currency: "ton",
    symbol: "GRAM",
    tvl: 44_704.09,
    supplyApy: 0.2026,
    utilization: 0.722,
    halted: false,
    ...overrides,
  };
}

Deno.test("GRAM vault TVL is converted from GRAM to USD", () => {
  const y = transformGtcPool(pool({}), 1.033)!;
  assertEquals(y.assetType, "TON");
  assertEquals(y.asset, "GRAM vault");
  assertEquals(Math.round(y.tvlUsd), 46_179);
  assertEquals(y.tvlHidden, undefined);
});

Deno.test("GRAM vault without a price keeps its APY and hides its TVL", () => {
  const y = transformGtcPool(pool({}), null)!;
  assertEquals(y.tvlUsd, 0);
  assertEquals(y.tvlHidden, true);
  assertEquals(y.apyTotal.toFixed(2), "20.26");
});

Deno.test("renamed or upper-cased currency ids keep the vault", () => {
  assertEquals(transformGtcPool(pool({ currency: "gram" }), 1.033)?.assetType, "TON");
  assertEquals(transformGtcPool(pool({ currency: "TON" }), 1.033)?.assetType, "TON");
  const usdt = transformGtcPool(pool({ currency: "USDT", symbol: "USD₮", tvl: 37_780.68 }), 1.033)!;
  assertEquals(usdt.assetType, "STABLE");
  assertEquals(usdt.asset, "USDT vault");
  assertEquals(usdt.tvlUsd, 37_780.68);
});

Deno.test("unknown or non-numeric vaults are skipped", () => {
  assertEquals(transformGtcPool(pool({ currency: "btc", symbol: "BTC" }), 1.033), null);
  assertEquals(transformGtcPool(pool({ supplyApy: Number.NaN }), 1.033), null);
});

Deno.test({
  name: "the GTC list is read before a slow GRAM price lookup finishes",
  // AbortSignal.timeout timers outlive the stubbed requests
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const realFetch = globalThis.fetch;
    let listRead = false;
    let listReadBeforePrice: boolean | null = null;
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes("giftcredit")) {
        const json = JSON.stringify([pool({}), pool({ currency: "usdt", symbol: "USD₮", tvl: 37_780.68 })]);
        // Body bytes are produced only when someone reads them
        const body = new ReadableStream<Uint8Array>({
          pull(controller) {
            listRead = true;
            controller.enqueue(new TextEncoder().encode(json));
            controller.close();
          },
        }, { highWaterMark: 0 });
        return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("coins.llama.fi")) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        listReadBeforePrice = listRead;
        return Response.json({ coins: { "coingecko:the-open-network": { price: 1.033 } } });
      }
      throw new Error(`unexpected request in test: ${url}`);
    }) as typeof fetch;
    try {
      const yields = await fetchGtcYields();
      assertEquals(yields.length, 2);
      assertEquals(listReadBeforePrice, true);
    } finally {
      globalThis.fetch = realFetch;
    }
  },
});

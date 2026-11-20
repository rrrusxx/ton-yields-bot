import { assert, assertEquals } from "std/assert/mod.ts";
import { type SwapCoffeePool, transformSwapCoffeePool } from "./swapcoffee.ts";

const token = (symbol: string) => ({
  address: { blockchain: "ton", address: `addr-${symbol}` },
  metadata: { name: symbol, symbol, decimals: 9, listed: true, verification: "WHITELISTED" },
});

function pool(stats: Partial<SwapCoffeePool["pool_statistics"]>): SwapCoffeePool {
  return {
    address: "pool-address",
    protocol: "tonstakers",
    is_trusted: true,
    tokens: [token("GRAM"), token("tsTON")],
    pool_statistics: { tvl_usd: 155_000_000, volume_usd: 0, apr: 13.3, lp_apr: 13.3, boost_apr: 0, ...stats },
  };
}

Deno.test("numeric strings from Swap.coffee are converted", () => {
  const y = transformSwapCoffeePool(pool({ tvl_usd: "155000000.5", apr: "13.33", lp_apr: "13.33", boost_apr: "0" }))!;
  assertEquals(y.tvlUsd, 155_000_000.5);
  assertEquals(y.apyTotal, 13.33);
  assertEquals(y.apyBase, 13.33);
  assertEquals(y.apyReward, null);
});

Deno.test("a NaN APR is kept so a Palette override can replace it", () => {
  const y = transformSwapCoffeePool(pool({ apr: "NaN", lp_apr: "NaN" }))!;
  assert(Number.isNaN(y.apyTotal));
  assertEquals(y.apyBase, 0);
  assertEquals(y.tvlUsd, 155_000_000);
});

Deno.test("a pool without a real TVL is skipped", () => {
  assertEquals(transformSwapCoffeePool(pool({ tvl_usd: "NaN" })), null);
});

Deno.test("Ston.fi GRAM-USDT pools read GRAM-USDT and carry a v1/v2 label", () => {
  const v1 = transformSwapCoffeePool({ ...pool({ apr: 4.07, lp_apr: 4.07 }), protocol: "stonfi", tokens: [token("USDT"), token("GRAM")] })!;
  const v2 = transformSwapCoffeePool({ ...pool({ apr: 6.74, lp_apr: 6.74 }), protocol: "stonfi_v2", tokens: [token("USDT"), token("GRAM")] })!;
  assertEquals([v1.asset, v1.poolMeta, v1.source, v1.isTonUsdtPool], ["GRAM-USDT", "v1", "Ston.fi", true]);
  assertEquals([v2.asset, v2.poolMeta, v2.source, v2.isTonUsdtPool], ["GRAM-USDT", "v2", "Ston.fi", true]);
});

Deno.test("other Ston.fi pools and liquid staking rows keep their token label", () => {
  const stonfiLst = transformSwapCoffeePool({ ...pool({ apr: 1.9, lp_apr: 1.9 }), protocol: "stonfi_v2" })!;
  assertEquals([stonfiLst.asset, stonfiLst.poolMeta], ["GRAM-tsTON", "tsTON"]);
  const y = transformSwapCoffeePool(pool({}))!;
  assertEquals([y.asset, y.poolMeta], ["GRAM-tsTON", "tsTON"]);
});

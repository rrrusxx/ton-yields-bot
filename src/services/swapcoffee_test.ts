import { assert, assertEquals } from "std/assert/mod.ts";
import { filterCorrelatedPools, type SwapCoffeePool, transformSwapCoffeePool } from "./swapcoffee.ts";

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

Deno.test("DEX pools never take a token as their label; liquid staking rows do", () => {
  // Until 2026-11-27 Ston.fi's GRAM/tsTON pool read "GRAM-tsTON (tsTON)", like Tonstakers' staking row
  const stonfiV2 = transformSwapCoffeePool({ ...pool({ apr: 1.9, lp_apr: 1.9 }), protocol: "stonfi_v2" })!;
  assertEquals([stonfiV2.asset, stonfiV2.poolMeta], ["GRAM-tsTON", "v2"]);
  const stonfiV1 = transformSwapCoffeePool({ ...pool({ apr: 3.3, lp_apr: 3.3 }), protocol: "stonfi" })!;
  assertEquals([stonfiV1.asset, stonfiV1.poolMeta], ["GRAM-tsTON", "v1"]);
  const coffee = transformSwapCoffeePool({ ...pool({ apr: 20, lp_apr: 0, boost_apr: 20 }), protocol: "coffee" })!;
  assertEquals([coffee.source, coffee.asset, coffee.poolMeta], ["Swap.coffee", "GRAM-tsTON", null]);
  const y = transformSwapCoffeePool(pool({}))!;
  assertEquals([y.asset, y.poolMeta], ["GRAM-tsTON", "tsTON"]);
});

Deno.test("Tonco pools are labelled as concentrated liquidity", () => {
  const usdt = [token("USDT"), token("GRAM")];
  const v2 = transformSwapCoffeePool({ ...pool({ apr: 175.2, lp_apr: 175.2 }), protocol: "tonco_v2", tokens: usdt })!;
  assertEquals([v2.source, v2.asset, v2.poolMeta, v2.isTonUsdtPool], ["Tonco", "GRAM-USDT", "CL", true]);
  const v1 = transformSwapCoffeePool({ ...pool({ apr: 3, lp_apr: 3 }), protocol: "tonco", tokens: usdt })!;
  assertEquals(v1.poolMeta, "CL v1");
});

Deno.test("single tokens unrelated to GRAM stay out of the GRAM section", () => {
  // Shaped like the "coffin" one-token markets recorded on 2026-11-20 and 21
  const coffin = (symbol: string, tvl: number, apr: number) =>
    transformSwapCoffeePool({
      ...pool({ tvl_usd: tvl, apr, lp_apr: apr }),
      protocol: "coffin",
      address: `coffin-${symbol}`,
      tokens: [token(symbol)],
    })!;
  const stakee = transformSwapCoffeePool({
    ...pool({ apr: 14.3, lp_apr: 14.3 }),
    protocol: "stakee",
    tokens: [token("GRAM"), token("STAKED")],
  })!;
  const rows = [
    coffin("HYDRA", 2546, 4.15),
    coffin("KINGY", 2352, 0.12),
    coffin("GRM", 1300, 6.4), // the jetton "Grm", not GRAM
    coffin("GRAM", 294, 5.71),
    coffin("KTON", 5000, 3.1), // a GRAM staking token stays
    coffin("USDT", 2066, 6.87),
    stakee,
  ];
  assertEquals(rows.map((y) => `${y.asset} ${y.assetType}`), [
    "HYDRA TON",
    "KINGY TON",
    "GRM TON",
    "GRAM TON",
    "KTON TON",
    "USDT STABLE",
    "GRAM TON",
  ]);
  const kept = filterCorrelatedPools(rows);
  assertEquals(kept.map((y) => `${y.source} ${y.asset}`), ["coffin GRAM", "coffin KTON", "coffin USDT", "Stakee GRAM"]);
});

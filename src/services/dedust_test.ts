import { assertAlmostEquals, assertEquals } from "std/assert/mod.ts";
import type { YieldOpportunity } from "../types/yields.ts";
import { type DedustPool, keepLargestPerLabel, transformDedustPool } from "./dedust.ts";

const USDT = "jetton:0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe";
const TSTON = "jetton:tston";
const UTYA = "jetton:utya";
const meta = {
  native: { ticker: "TON", name: "Toncoin" },
  [USDT]: { ticker: "USDT", name: "Tether USD" },
  [TSTON]: { ticker: "tsTON" },
  [UTYA]: { ticker: "UTYA" },
};

function pool(overrides: Partial<DedustPool>): DedustPool {
  return {
    address: "0:3e5f",
    dex: "dedust",
    type: "cpmm_v1",
    verified: true,
    assets: ["native", USDT],
    tvl_usd: "444623.77",
    trade_fee: "10",
    apr_fees: "15.0643",
    apr_rewards: "0",
    ...overrides,
  };
}

Deno.test("Classic pool: fees compound, so the APY is the daily-compounded APR", () => {
  const y = transformDedustPool(pool({}), meta)!;
  assertEquals(y.source, "DeDust");
  assertEquals(y.asset, "GRAM-USDT");
  assertEquals(y.poolMeta, "Classic 0.10%");
  assertEquals(y.isTonUsdtPool, true);
  assertAlmostEquals(y.apyTotal, (Math.pow(1 + 0.150643 / 365, 365) - 1) * 100, 1e-9);
  assertAlmostEquals(y.apyTotal, 16.255, 0.01);
  assertEquals(y.tvlUsd, 444623.77);
});

Deno.test("CPMM v2 pool: fees are claimed separately, so the APY equals the APR", () => {
  const y = transformDedustPool(pool({ dex: "dedust_v3_cpmm", type: "cpmm_v2", assets: [USDT, "native"], tvl_usd: "38682.66", apr_fees: "35.2884" }), meta)!;
  assertEquals(y.asset, "GRAM-USDT");
  assertEquals(y.poolMeta, "CPMM v2 0.10%");
  assertEquals(y.apyTotal, 35.2884);
});

Deno.test("Stable pools compound like Classic ones", () => {
  const y = transformDedustPool(pool({ type: "stable", trade_fee: "5", assets: ["native", TSTON], apr_fees: "2" }), meta)!;
  assertEquals(y.poolMeta, "Stable 0.05%");
  assertAlmostEquals(y.apyTotal, (Math.pow(1 + 0.02 / 365, 365) - 1) * 100, 1e-9);
});

Deno.test("dust, near-zero APR, unknown types, memecoins and foreign pools are skipped", () => {
  assertEquals(transformDedustPool(pool({ tvl_usd: "2247.85" }), meta), null);
  assertEquals(transformDedustPool(pool({ apr_fees: "0.0148" }), meta), null);
  assertEquals(transformDedustPool(pool({ type: "cpmm_v9" }), meta), null);
  assertEquals(transformDedustPool(pool({ assets: [UTYA, "native"] }), meta), null);
  assertEquals(transformDedustPool(pool({ verified: false }), meta), null);
  assertEquals(transformDedustPool(pool({ dex: "stonfi" }), meta), null);
  assertEquals(transformDedustPool(pool({ apr_fees: "0" }), meta), null);
  assertEquals(transformDedustPool(pool({ apr_fees: "NaN" }), meta), null);
  assertEquals(transformDedustPool(pool({ assets: ["native", "jetton:unknown"] }), meta), null);
});

Deno.test("an impermanent-loss-free GRAM pair goes to the GRAM section, GRAM first", () => {
  for (const assets of [["native", TSTON], [TSTON, "native"]]) {
    const y = transformDedustPool(pool({ assets }), meta)!;
    assertEquals(y.asset, "GRAM-tsTON");
    assertEquals(y.assetType, "TON");
    assertEquals(y.isTonUsdtPool, false);
  }
});

Deno.test("two pools with the same pair and label never both appear", () => {
  const row = (tvlUsd: number) => ({ asset: "GRAM-USDT", poolMeta: "CPMM v2 0.25%", tvlUsd } as YieldOpportunity);
  const small = row(12_000);
  const big = row(15_000);
  const other = { ...row(40_000), poolMeta: "CPMM v2 0.10%" } as YieldOpportunity;
  assertEquals(keepLargestPerLabel([small, big, other]), [big, other]);
});

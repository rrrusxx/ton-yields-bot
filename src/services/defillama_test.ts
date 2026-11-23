import { assertEquals } from "std/assert/mod.ts";
import type { GroupedYields, YieldOpportunity } from "../types/yields.ts";
import { dropNonFiniteApy, filterCorrelatedOnly, getTopYields, mergeOnchainRows } from "./defillama.ts";
import { preferOnchain } from "./onchain.ts";

function row(overrides: Partial<YieldOpportunity>): YieldOpportunity {
  return {
    assetType: "TON",
    source: "Protocol",
    sourceUrl: "",
    asset: "GRAM",
    poolMeta: null,
    apyBase: 5,
    apyReward: null,
    apyTotal: 5,
    tvlUsd: 1_000_000,
    ...overrides,
  };
}

function grouped(rows: YieldOpportunity[], tonUsdt: YieldOpportunity[] = []): GroupedYields {
  return {
    TON: rows.filter((r) => r.assetType === "TON"),
    STABLE: rows.filter((r) => r.assetType === "STABLE"),
    BTC: rows.filter((r) => r.assetType === "BTC"),
    ETH: rows.filter((r) => r.assetType === "ETH"),
    TON_USDT: tonUsdt,
  };
}

const names = (rows: YieldOpportunity[]) => rows.map((r) => `${r.source} ${r.asset}`);

Deno.test("TOP-5 skips low-TVL, hidden-TVL, glitch-APY and hacked rows", () => {
  const top = getTopYields(grouped([
    row({ source: "Dust", apyTotal: 799.9, tvlUsd: 1_600 }),
    row({ source: "Glitch", apyTotal: 150, tvlUsd: 5_000_000 }),
    row({ source: "Affluent", apyTotal: 40, tvlUsd: 700_000 }),
    row({ source: "NoTvl", apyTotal: 30, tvlUsd: 0, tvlHidden: true }),
    row({ source: "NaN", apyTotal: Number.NaN }),
    row({ source: "Floor", apyTotal: 20, tvlUsd: 10_000 }),
    row({ source: "Below", apyTotal: 25, tvlUsd: 9_999 }),
    row({ source: "Cap", apyTotal: 100, tvlUsd: 50_000 }),
  ]));
  assertEquals(names(top), ["Cap GRAM", "Floor GRAM"]);
});

Deno.test("TOP-5 gives one place per protocol and asset class", () => {
  const top = getTopYields(grouped([
    // Same protocol, same asset class, same APY: the first (higher-TVL) row wins
    row({ source: "Bemo", asset: "GRAM-stTON", apyTotal: 14.63, tvlUsd: 1_400_000 }),
    row({ source: "Bemo", asset: "GRAM-bmTON", apyTotal: 14.63, tvlUsd: 336_000 }),
    // Same protocol, different asset classes: both stay
    row({ source: "GTC", asset: "USDT vault", assetType: "STABLE", apyTotal: 27.4, tvlUsd: 37_800 }),
    row({ source: "GTC", asset: "GRAM vault", apyTotal: 20.3, tvlUsd: 46_000 }),
    row({ source: "Hipo", asset: "GRAM-hGRAM", apyTotal: 17.05, tvlUsd: 7_500_000 }),
    row({ source: "Stakee", apyTotal: 13.6, tvlUsd: 22_000_000 }),
    row({ source: "KTON", apyTotal: 13.4, tvlUsd: 2_000_000 }),
  ]));
  assertEquals(names(top), [
    "GTC USDT vault",
    "GTC GRAM vault",
    "Hipo GRAM-hGRAM",
    "Bemo GRAM-stTON",
    "Stakee GRAM",
  ]);
});

Deno.test("GRAM-USDT pools never enter the TOP-5", () => {
  const top = getTopYields(grouped(
    [row({ source: "Hipo", apyTotal: 17 })],
    [row({ source: "Tonco", asset: "GRAM-USDT", apyTotal: 75, tvlUsd: 126_000, isTonUsdtPool: true })],
  ));
  assertEquals(names(top), ["Hipo GRAM"]);
});

Deno.test("TOP-5 respects the limit", () => {
  const rows = Array.from({ length: 8 }, (_, i) => row({ source: `P${i}`, apyTotal: 10 + i }));
  assertEquals(getTopYields(grouped(rows), 5).length, 5);
  assertEquals(getTopYields(grouped(rows), 0).length, 0);
});

Deno.test("rows whose APY is still not a number are dropped from every group", () => {
  const groups = grouped(
    [row({ source: "Tonstakers", apyTotal: 13.33 }), row({ source: "Bemo", apyTotal: Number.NaN })],
    [row({ source: "Tonco", asset: "GRAM-USDT", apyTotal: Number.POSITIVE_INFINITY, isTonUsdtPool: true })],
  );
  assertEquals(dropNonFiniteApy(groups), 2);
  assertEquals(names(groups.TON), ["Tonstakers GRAM"]);
  assertEquals(groups.TON_USDT.length, 0);
});

Deno.test("DefiLlama single tokens unrelated to GRAM stay out of the GRAM section", () => {
  const rows = [
    row({ source: "EVAA", asset: "GRAM", poolMeta: "Main" }),
    row({ source: "EVAA", asset: "TSTON", poolMeta: "Main" }),
    row({ source: "Some Lender", asset: "STON" }), // classifyAsset puts it in the GRAM class
    row({ source: "EVAA", asset: "USDT", assetType: "STABLE" }),
    row({ source: "Some DEX", asset: "GRAM-tsTON" }),
  ];
  assertEquals(filterCorrelatedOnly(rows).map((y) => y.asset), ["GRAM", "TSTON", "USDT", "GRAM-tsTON"]);
});

Deno.test("Storm vault rows take part in the TOP-5 like any row (owner's decision of 2026-11-23)", () => {
  // The Storm GRAM vault's 7-day APY reached 63.7% on 2026-10-30
  const storm = row({ source: "Storm Trade", asset: "GRAM", poolMeta: "TON-SLP", apyTotal: 63.7, onChain: true });
  const bemo = row({ source: "Bemo", asset: "GRAM-stTON", poolMeta: "stTON", apyTotal: 13.4 });
  assertEquals(getTopYields(grouped([bemo, storm])).map((y) => y.source), ["Storm Trade", "Bemo"]);
});

Deno.test("on-chain rows go to the group of their asset class", () => {
  const swapCoffee = () =>
    grouped([
      row({ source: "Storm Trade", asset: "GRAM", poolMeta: "TON-SLP", apyTotal: 8.77 }),
      row({ source: "EVAA", asset: "GRAM", poolMeta: "Main", apyTotal: 6.9 }),
      row({ source: "Storm Trade", asset: "USDT", assetType: "STABLE", apyTotal: 4.03 }),
    ]);
  const onchain = [
    row({ source: "Storm Trade", asset: "GRAM", poolMeta: "TON-SLP", apyTotal: 4.81, onChain: true }),
    row({ source: "Storm Trade", asset: "USDT", assetType: "STABLE", apyTotal: 1.18, onChain: true }),
    row({ source: "Tonstakers", asset: "GRAM-tsTON", poolMeta: "tsTON", apyTotal: 12.06, onChain: true }),
  ];
  const label = (y: YieldOpportunity) => `${y.source} ${y.asset} ${y.apyTotal}`;
  // The on-chain rows replace Swap.coffee's rows of the same vaults, each in its own section
  const merged = swapCoffee();
  mergeOnchainRows(merged, onchain, preferOnchain);
  assertEquals(merged.TON.map(label), ["EVAA GRAM 6.9", "Storm Trade GRAM 4.81", "Tonstakers GRAM-tsTON 12.06"]);
  assertEquals(merged.STABLE.map(label), ["Storm Trade USDT 1.18"]);
  // Swap.coffee sent no Storm rows: the vaults are added, the USDT one to the stablecoins only
  const empty = grouped([]);
  mergeOnchainRows(empty, onchain.slice(0, 2), preferOnchain);
  assertEquals(empty.TON.map(label), ["Storm Trade GRAM 4.81"]);
  assertEquals(empty.STABLE.map(label), ["Storm Trade USDT 1.18"]);
});

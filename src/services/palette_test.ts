import { assertEquals } from "std/assert/mod.ts";
import type { GroupedYields, YieldOpportunity } from "../types/yields.ts";
import { applyPaletteOverrides } from "./palette.ts";

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

function grouped(ton: YieldOpportunity[], stable: YieldOpportunity[] = []): GroupedYields {
  return { TON: ton, STABLE: stable, BTC: [], ETH: [], TON_USDT: [] };
}

const palette = (aprBySymbol: Record<string, number | null>, aprBySource: Record<string, number | null>) => ({
  aprBySymbol,
  aprBySource,
  fetchedAt: "2026-11-19T18:58:37.659Z",
});

Deno.test("Palette sets Hipo APR and TVL", () => {
  const hipo = row({ source: "Hipo", asset: "GRAM-hGRAM", poolMeta: "hGRAM", apyTotal: 17.06, tvlUsd: 7_510_490 });
  applyPaletteOverrides(grouped([hipo]), palette({ hGRAM: 17.045 }, { "tvl:hGRAM": 9_097_736 }));
  assertEquals(hipo.apyTotal, 17.045);
  assertEquals(hipo.tvlUsd, 9_097_736);
});

Deno.test("Palette TVL applies even without a Palette APR, and bad values are ignored", () => {
  const stormGram = row({ source: "Storm Trade", asset: "GRAM", poolMeta: "TON-SLP", apyTotal: 8.86, tvlUsd: 787_294 });
  const stormUsdt = row({ source: "Storm Trade", asset: "USDT", assetType: "STABLE", apyTotal: 4.1, tvlUsd: 2_153_301 });
  applyPaletteOverrides(
    grouped([stormGram], [stormUsdt]),
    palette({}, { "tvl:storm_vault_ton": 978_014, storm_vault_usdt: 4.17, "tvl:storm_vault_usdt": Number.NaN }),
  );
  assertEquals(stormGram.apyTotal, 8.86);
  assertEquals(stormGram.tvlUsd, 978_014);
  assertEquals(stormUsdt.apyTotal, 4.17);
  assertEquals(stormUsdt.tvlUsd, 2_153_301);
});

Deno.test("Palette replaces a non-numeric APR", () => {
  const tonstakers = row({ source: "Tonstakers", asset: "GRAM-tsTON", apyBase: 0, apyTotal: Number.NaN });
  applyPaletteOverrides(grouped([tonstakers]), palette({ tsTON: 13.33 }, {}));
  assertEquals(tonstakers.apyTotal, 13.33);
  assertEquals(tonstakers.apyBase, 13.33);
});

Deno.test("Affluent is never overridden", () => {
  const affluent = row({ source: "Affluent", asset: "USDT", assetType: "STABLE", apyTotal: 5.6 });
  applyPaletteOverrides(grouped([], [affluent]), palette({}, { affluent_lending_vault_usdt: 34.97 }));
  assertEquals(affluent.apyTotal, 5.6);
});

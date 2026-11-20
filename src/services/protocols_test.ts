import { assert, assertFalse } from "std/assert/mod.ts";
import { isCorrelatedPair, isHackedProtocol, pairBelongsToCategory } from "./protocols.ts";

const acceptedAsGramPair = (symbol: string) =>
  pairBelongsToCategory(symbol, "TON") && isCorrelatedPair(symbol, "TON");

Deno.test("GRAM-era LST tickers count as GRAM-correlated", () => {
  // Hipo disappeared from the post on 2026-11-08 when Swap.coffee switched
  // to GRAM/hGRAM; every rename must keep the row.
  for (const symbol of ["GRAM-hGRAM", "GRAM-tsGRAM", "GRAM-stGRAM", "GRAM-bmGRAM", "GRAM-wGRAM", "hGRAM-tsGRAM"]) {
    assert(acceptedAsGramPair(symbol), symbol);
  }
});

Deno.test("pre-rename LST tickers still count as GRAM-correlated", () => {
  for (const symbol of ["GRAM-hTON", "GRAM-tsTON", "GRAM-stTON", "GRAM-bmTON", "TON-tsTON", "GRAM-TON"]) {
    assert(acceptedAsGramPair(symbol), symbol);
  }
});

Deno.test("lookalike tokens are never GRAM-correlated", () => {
  for (const symbol of ["GRAM-STON", "GRAM-GEMSTON", "GRAM-TONNEL", "GRAM-JETTON", "GRAM-sTONks", "GRAM-USDT"]) {
    assertFalse(acceptedAsGramPair(symbol), symbol);
  }
});

Deno.test("hacked protocol list", () => {
  assert(isHackedProtocol("Affluent"));
  assertFalse(isHackedProtocol("EVAA"));
  assertFalse(isHackedProtocol("affluent")); // display names are exact
});

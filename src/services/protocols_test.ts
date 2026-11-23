import { assert, assertFalse } from "std/assert/mod.ts";
import { isCorrelatedPair, isHackedProtocol, isSingleAssetInCategory, pairBelongsToCategory } from "./protocols.ts";

const acceptedAsGramPair = (symbol: string) =>
  pairBelongsToCategory(symbol, "TON") && isCorrelatedPair(symbol, "TON");

Deno.test("GRAM-era LST tickers count as GRAM-correlated", () => {
  // Hipo disappeared from the post on 2026-11-08 when Swap.coffee switched
  // to GRAM/hGRAM; every rename must keep the row.
  for (const symbol of ["GRAM-hGRAM", "GRAM-tsGRAM", "GRAM-stGRAM", "GRAM-bmGRAM", "GRAM-wGRAM", "hGRAM-tsGRAM", "GRAM-KTON", "STAKED-GRAM"]) {
    assert(acceptedAsGramPair(symbol), symbol);
  }
});

Deno.test("pre-rename LST tickers still count as GRAM-correlated", () => {
  for (const symbol of ["GRAM-hTON", "GRAM-tsTON", "GRAM-stTON", "GRAM-bmTON", "TON-tsTON", "GRAM-TON"]) {
    assert(acceptedAsGramPair(symbol), symbol);
  }
});

Deno.test("lookalike tokens are never GRAM-correlated", () => {
  // GRM and TGRAM are jettons, not the native coin
  for (const symbol of ["GRAM-STON", "GRAM-GEMSTON", "GRAM-TONNEL", "GRAM-JETTON", "GRAM-sTONks", "GRAM-USDT", "GRAM-GRM", "GRAM-TGRAM"]) {
    assertFalse(acceptedAsGramPair(symbol), symbol);
  }
});

Deno.test("only GRAM and its staking tokens count as single tokens in the GRAM section", () => {
  // HYDRA, KINGY and GRM (one-token markets of Swap.coffee's "coffin"
  // provider) sat in the GRAM section of the posts of 2026-06-01 to 2026-11-11
  for (const symbol of ["GRAM", "TON", "tsTON", "tsGRAM", "hGRAM", "hTON", "stTON", "bmGRAM", "wGRAM", "KTON", "STAKED"]) {
    assert(isSingleAssetInCategory(symbol, "TON"), symbol);
  }
  // GRM ("Grm") and TGRAM are jettons that only look like the native coin
  for (const symbol of ["HYDRA", "KINGY", "GRM", "TGRAM", "durev", "STON", "GEMSTON", "TONNEL", "JETTON", "NOT"]) {
    assertFalse(isSingleAssetInCategory(symbol, "TON"), symbol);
    assertFalse(pairBelongsToCategory(symbol, "TON"), symbol); // the same rule through the pair check
  }
  // The other sections keep their rules
  assert(isSingleAssetInCategory("USDT", "STABLE"));
  assert(isSingleAssetInCategory("TSUSDE", "STABLE"));
  assertFalse(isSingleAssetInCategory("HYDRA", "STABLE"));
});

Deno.test("hacked protocol list", () => {
  assert(isHackedProtocol("Affluent"));
  assertFalse(isHackedProtocol("EVAA"));
  assertFalse(isHackedProtocol("affluent")); // display names are exact
});

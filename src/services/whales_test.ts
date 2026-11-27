import { assertAlmostEquals, assertEquals } from "std/assert/mod.ts";
import { summarizeWhalesPools, type TonapiPool, WHALES_OPEN_POOLS, whalesRow } from "./whales.ts";

const [queue1, queue2, nominators1, nominators2] = [...WHALES_OPEN_POOLS];

/** tonapi pools as served on 2026-11-26 (apy in %, total_amount in nano GRAM) */
const live: TonapiPool[] = [
  { address: nominators1, name: "Whales Nominators Queue #1", implementation: "whales", apy: 12.6154875, total_amount: 949_744_461_246_863 },
  { address: queue1, name: "Tonkeeper Queue #1", implementation: "whales", apy: 12.6154875, total_amount: 6_740_252_366_350_575 },
  { address: nominators2, name: "Whales Nominators Queue #2", implementation: "whales", apy: 12.6154875, total_amount: 6_124_667_907_634_176 },
  { address: queue2, name: "Tonkeeper Queue #2", implementation: "whales", apy: 12.6154875, total_amount: 2_497_507_639_226_453 },
  // NFT-gated Club pools and other kinds of pools are not part of the row
  { address: "0:c5be7c6ec80da880d3cea048f596ef7af14e0f3fcfc5cc97eb39652c8bfa3508", name: "Whales Club Queue #1", implementation: "whales", apy: 13.79, total_amount: 6_612_790_326_162_094 },
  { address: "0:1111", name: "TON Foundation pool", implementation: "tf", apy: 17.02, total_amount: 300_001_000_000_000 },
];

Deno.test("the open TON Whales pools are summed into one stake-weighted row", () => {
  const summary = summarizeWhalesPools(live)!;
  assertEquals(summary.pools, 4);
  assertAlmostEquals(summary.stakedGram, 16_312_172.37, 0.01);
  assertAlmostEquals(summary.apy, 12.6154875, 1e-9);
});

Deno.test("pools of the wrong kind or with implausible data are skipped", () => {
  assertEquals(summarizeWhalesPools([]), null);
  assertEquals(summarizeWhalesPools([{ ...live[1], implementation: "tf" }]), null);
  assertEquals(summarizeWhalesPools([{ ...live[1], apy: 0 }, { ...live[3], apy: 140 }]), null);
  assertEquals(summarizeWhalesPools([{ ...live[1], total_amount: 0 }]), null);
  const weighted = summarizeWhalesPools([{ ...live[1], apy: 12 }, { ...live[3], apy: 14, total_amount: live[1].total_amount }])!;
  assertAlmostEquals(weighted.apy, 13, 1e-9);
  assertEquals(weighted.pools, 2);
});

Deno.test("the row is an estimate credited to tonapi, without TVL when there is no GRAM price", () => {
  const summary = { apy: 12.6154875, stakedGram: 16_312_172, pools: 4 };
  const row = whalesRow(summary, 0.9638);
  assertEquals([row.source, row.asset, row.poolMeta, row.assetType], ["TON Whales", "GRAM", "native staking", "TON"]);
  assertEquals([row.apyEstimate, row.onChain, row.footerCredit?.name], [true, undefined, "tonapi"]);
  assertEquals(row.sourceUrl, "https://tonwhales.com/staking");
  assertAlmostEquals(row.tvlUsd, 16_312_172 * 0.9638, 1e-6);
  const noPrice = whalesRow(summary, null);
  assertEquals([noPrice.tvlUsd, noPrice.tvlHidden], [0, true]);
});

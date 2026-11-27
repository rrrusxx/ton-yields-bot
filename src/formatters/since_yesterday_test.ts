import { assert, assertEquals, assertFalse, assertStringIncludes } from "std/assert/mod.ts";
import type { PostSnapshot, SnapshotRow } from "../services/post_snapshot.ts";
import type { YieldOpportunity } from "../types/yields.ts";
import type { DigestData } from "./message.ts";
import { compareSnapshots, formatSinceClassic, formatSinceRich, isQuiet, sinceLines, sinceTitle, snapshotOf } from "./since_yesterday.ts";

function snap(date: string, rows: Array<Partial<SnapshotRow> & { protocol: string; label: string }>): PostSnapshot {
  return {
    date,
    rows: rows.map((r) => ({
      section: "TON",
      apy: 10,
      tvlUsd: 1_000_000,
      ...r,
      id: `${r.section ?? "TON"}|${r.protocol}|${r.label}`,
    })),
  };
}

Deno.test("a notable APY move is at least 1 point and 10% of the old value, biggest first", () => {
  const before = snap("2026-11-26", [
    { protocol: "GTC", label: "USDT vault", apy: 24.0, section: "STABLE" },
    { protocol: "Tonstakers", label: "GRAM (tsTON)", apy: 12.1 },
    { protocol: "Storm Trade", label: "USDT", apy: 30, section: "STABLE" },
    { protocol: "EVAA", label: "USDT (Main)", apy: 2.0, section: "STABLE" },
  ]);
  const after = snap("2026-11-27", [
    { protocol: "GTC", label: "USDT vault", apy: 28.7, section: "STABLE" },
    { protocol: "Tonstakers", label: "GRAM (tsTON)", apy: 12.9 }, // 0.8 points: too small
    { protocol: "Storm Trade", label: "USDT", apy: 32.5, section: "STABLE" }, // 2.5 points, under 10% of 30
    { protocol: "EVAA", label: "USDT (Main)", apy: 3.5, section: "STABLE" }, // 1.5 points, 75%
  ]);
  const s = compareSnapshots(before, after);
  assertEquals(s.moves.map((m) => [m.row.protocol, m.from, m.row.apy]), [["GTC", 24, 28.7], ["EVAA", 2, 3.5]]);
  assertEquals(s.moreMoves, 0);
  const lines = sinceLines(s);
  assertEquals(lines[0], "📈 <b>GTC</b> USDT vault: 24.0% → 28.7%");
  assertEquals(lines[1], "📈 <b>EVAA</b> USDT (Main): 2.0% → 3.5%");
});

Deno.test("moves skip GRAM-USDT pools, low or unknown TVL, estimates and hacked rows; only 3 are named", () => {
  const before = snap("2026-11-26", [
    { protocol: "Tonco", label: "GRAM-USDT (CL)", apy: 150, section: "TON_USDT" },
    { protocol: "Small", label: "GRAM", apy: 5, tvlUsd: 9_000 },
    { protocol: "Hidden", label: "GRAM vault", apy: 5, tvlUsd: null },
    { protocol: "TON Whales", label: "GRAM (native staking)", apy: 10, estimate: true },
    { protocol: "Rekt", label: "GRAM", apy: 5, hacked: true, tvlUsd: null },
    ...["A", "B", "C", "D", "E"].map((p, i) => ({ protocol: p, label: "GRAM", apy: 10 + i })),
  ]);
  const after = snap("2026-11-27", [
    { protocol: "Tonco", label: "GRAM-USDT (CL)", apy: 60, section: "TON_USDT" },
    { protocol: "Small", label: "GRAM", apy: 9, tvlUsd: 9_500 },
    { protocol: "Hidden", label: "GRAM vault", apy: 9, tvlUsd: null },
    { protocol: "TON Whales", label: "GRAM (native staking)", apy: 14, estimate: true },
    { protocol: "Rekt", label: "GRAM", apy: 9, hacked: true, tvlUsd: null },
    ...["A", "B", "C", "D", "E"].map((p, i) => ({ protocol: p, label: "GRAM", apy: 10 + i + (i + 2) * 2 })),
  ]);
  const s = compareSnapshots(before, after);
  assertEquals(s.moves.map((m) => m.row.protocol), ["E", "D", "C"]);
  assertEquals(s.moreMoves, 2);
  assertStringIncludes(sinceLines(s).join("\n"), "📈 <b>C</b> GRAM: 12.0% → 20.0% (+2 more)");
});

Deno.test("TOP-5 changes name who came in at which place and who dropped out", () => {
  const before = snap("2026-11-26", [
    { protocol: "GTC", label: "USDT vault", top5: 1, section: "STABLE" },
    { protocol: "KTON", label: "GRAM (KTON)", top5: 5 },
    { protocol: "TON Whales", label: "GRAM (wsTON)" },
  ]);
  const after = snap("2026-11-27", [
    { protocol: "GTC", label: "USDT vault", top5: 1, section: "STABLE" },
    { protocol: "KTON", label: "GRAM (KTON)" },
    { protocol: "TON Whales", label: "GRAM (wsTON)", top5: 5 },
  ]);
  const s = compareSnapshots(before, after);
  assertEquals(sinceLines(s), ["🏆 TOP-5: <b>TON Whales</b> GRAM (wsTON) at #5 in · <b>KTON</b> GRAM (KTON) out"]);
  // A previous post without a recorded TOP-5 reports no TOP-5 change
  const untracked = compareSnapshots(snap("2026-11-26", [{ protocol: "KTON", label: "GRAM (KTON)" }]), after);
  assertEquals(untracked.topEntered.length + untracked.topLeft.length, 0);
});

Deno.test("rows that joined or left the post; a protocol with no row today says no data", () => {
  const before = snap("2026-11-26", [
    { protocol: "Storm Trade", label: "GRAM (TON-SLP)", tvlUsd: 750_000 },
    { protocol: "EVAA", label: "GRAM (LP)", tvlUsd: 28_000 },
    { protocol: "EVAA", label: "GRAM (Main)", tvlUsd: 370_000 },
    { protocol: "Dust", label: "GRAM", tvlUsd: 2_000 }, // too small to report
  ]);
  const after = snap("2026-11-27", [
    { protocol: "EVAA", label: "GRAM (Main)", tvlUsd: 370_000 },
    { protocol: "TON Whales", label: "GRAM (native staking)", apy: 12.66, estimate: true, tvlUsd: 16_000_000 },
  ]);
  const s = compareSnapshots(before, after);
  const lines = sinceLines(s);
  assertEquals(lines, [
    "➕ Joined the post: <b>TON Whales</b> GRAM (native staking) 12.7% est.",
    "➖ Left the post: <b>Storm Trade</b> GRAM (TON-SLP) (no data today), <b>EVAA</b> GRAM (LP)",
  ]);
});

Deno.test("a protocol newly flagged as hacked is reported once", () => {
  const before = snap("2026-11-26", [{ protocol: "Affluent", label: "GRAM-tsTON" }, { protocol: "Affluent", label: "USDT" }]);
  const after = snap("2026-11-27", [
    { protocol: "Affluent", label: "GRAM-tsTON", hacked: true, tvlUsd: null },
    { protocol: "Affluent", label: "USDT", hacked: true, tvlUsd: null },
  ]);
  assertEquals(sinceLines(compareSnapshots(before, after)), ["🚨 <b>Affluent</b> is now flagged as hacked and kept out of the TOP-5"]);
  // Already flagged the day before: no news
  assert(isQuiet(compareSnapshots(after, { ...after, date: "2026-11-28" })));
});

Deno.test("a quiet day says so; the title names the date when the last post was not yesterday", () => {
  const rows = [{ protocol: "Hipo", label: "GRAM (hGRAM)", apy: 16.4 }];
  const s = compareSnapshots(snap("2026-11-26", rows), snap("2026-11-27", [{ ...rows[0], apy: 16.6 }]));
  assert(isQuiet(s));
  assertEquals(sinceLines(s), ["Quiet day: no notable changes since the last post."]);
  assertEquals(sinceTitle(s), "Since yesterday");
  assertEquals(sinceTitle({ ...s, since: "2026-11-24" }), "Since Nov 24");
  assertStringIncludes(formatSinceClassic(s, "───"), "───\n<b>🔁 SINCE YESTERDAY</b>\n<blockquote>Quiet day");
  // Small or skipped moves (under 10%, GRAM-USDT pools) leave the day quiet without a false claim
  const swings = compareSnapshots(
    snap("2026-11-26", [{ protocol: "Storm Trade", label: "USDT", apy: 30, section: "STABLE" }, { protocol: "Tonco", label: "GRAM-USDT (CL)", apy: 132.6, section: "TON_USDT" }]),
    snap("2026-11-27", [{ protocol: "Storm Trade", label: "USDT", apy: 32.5, section: "STABLE" }, { protocol: "Tonco", label: "GRAM-USDT (CL)", apy: 172.6, section: "TON_USDT" }]),
  );
  assert(isQuiet(swings));
  assertFalse(sinceLines(swings).join("").includes("moved by 1 point"));
  assertStringIncludes(formatSinceRich(s), "<h4>🔁 Since yesterday</h4>\n<ul><li>Quiet day");
});

Deno.test("names in the block are escaped", () => {
  const before = snap("2026-11-26", [{ protocol: "Evil <b>", label: "X & Y", apy: 5 }]);
  const after = snap("2026-11-27", [{ protocol: "Evil <b>", label: "X & Y", apy: 9 }]);
  const text = sinceLines(compareSnapshots(before, after)).join("");
  assertStringIncludes(text, "<b>Evil &lt;b&gt;</b> X &amp; Y");
  assertFalse(text.includes("<b>Evil <b>"));
});

function row(overrides: Partial<YieldOpportunity>): YieldOpportunity {
  return { assetType: "TON", source: "Hipo", sourceUrl: "", asset: "GRAM", poolMeta: "hGRAM", apyBase: 16, apyReward: null, apyTotal: 16, tvlUsd: 9_000_000, ...overrides };
}

Deno.test("the snapshot records what the post shows: label, TOP-5 place, no TVL when hidden or hacked", () => {
  const hipo = row({});
  const gtc = row({ source: "GTC", asset: "GRAM vault", poolMeta: null, tvlHidden: true });
  const usde = row({ assetType: "STABLE", source: "EVAA", asset: "TSUSDE", poolMeta: "Main", apyTotal: 0.2, tvlUsd: 33_000 });
  const affluent = row({ source: "Affluent", asset: "GRAM-TSTON", poolMeta: null });
  const data = {
    top5: [hipo],
    shown: [
      { row: hipo, section: "TON", label: "hGRAM" },
      { row: gtc, section: "TON", label: null },
      { row: usde, section: "STABLE", label: "Main" },
      { row: affluent, section: "TON", label: null },
      { row: hipo, section: "TON", label: "hGRAM" }, // a repeated row is kept once
    ],
  } as unknown as DigestData;
  const s = snapshotOf(data, "2026-11-27");
  assertEquals(s.date, "2026-11-27");
  assertEquals(s.rows.map((r) => r.id), ["TON|Hipo|GRAM (hGRAM)", "TON|GTC|GRAM vault", "STABLE|EVAA|tsUSDe (Main)", "TON|Affluent|GRAM-tsTON"]);
  assertEquals(s.rows[0].top5, 1);
  assertEquals(s.rows[1].tvlUsd, null);
  assertEquals(s.rows[3].hacked, true);
  assertEquals(s.rows[3].tvlUsd, null);
});

const TSTON = "EQCkWxfyhAkim3g2DjKQQg8T5P4g-Q1-K_jErGcDJZ4i-vqR";

Deno.test("an on-chain row and the provider's fallback row for one contract are one pool", () => {
  // Day 1 read on-chain, day 2 the on-chain read failed and Swap.coffee's row stood in
  const before = snap("2026-11-26", [{ protocol: "Tonstakers", label: "GRAM (tsTON)", apy: 12.0, address: TSTON, onChain: true, top5: 3 }]);
  const after = snap("2026-11-27", [{ protocol: "Tonstakers", label: "GRAM-tsTON (tsTON)", apy: 12.9, address: TSTON, top5: 3 }]);
  const s = compareSnapshots(before, after);
  assert(isQuiet(s), JSON.stringify(s));
  assertEquals(compareSnapshots(after, { ...before, date: "2026-11-28" }).moves.length, 0);
});

Deno.test("a switch between the contract reading and the provider's figure is not an APY move", () => {
  const vault = { protocol: "Storm Trade", label: "USDT", section: "STABLE" as const, address: "EQAz6ehNfL7_8NI7OVh1Qg46HsuC4kFpK-icfqK9J3Frd6CJ" };
  const onchain = snap("2026-11-26", [{ ...vault, apy: 1.1, onChain: true }]);
  const fallback = snap("2026-11-27", [{ ...vault, apy: 4.0 }]);
  assert(isQuiet(compareSnapshots(onchain, fallback)));
  assert(isQuiet(compareSnapshots(fallback, { ...onchain, date: "2026-11-28" })));
  // The same method on both days still reports the move
  const later = snap("2026-11-28", [{ ...vault, apy: 4.0, onChain: true }]);
  assertEquals(compareSnapshots(onchain, later).moves.map((m) => m.row.apy), [4.0]);
});

Deno.test("two pools under the same text but different contracts stay apart", () => {
  const before = snap("2026-11-26", [{ protocol: "Ston.fi", label: "GRAM-tsTON (v2)", apy: 1.3, address: "EQ-pool-a" }]);
  const after = snap("2026-11-27", [{ protocol: "Ston.fi", label: "GRAM-tsTON (v2)", apy: 9.0, address: "EQ-pool-b" }]);
  const s = compareSnapshots(before, after);
  assertEquals(s.moves.length, 0);
  assertEquals(s.joined.length + s.left.length, 2);
});

Deno.test("a TOP-5 row past its section's cap is still recorded with its place", () => {
  const shownEvaa = row({ assetType: "STABLE", source: "EVAA", asset: "USDT", poolMeta: "Main", tvlUsd: 500_000 });
  const cappedEvaa = row({ assetType: "STABLE", source: "EVAA", asset: "USDE", poolMeta: "Alts", apyTotal: 30, tvlUsd: 20_000 });
  const data = { top5: [cappedEvaa], shown: [{ row: shownEvaa, section: "STABLE", label: "Main" }] } as unknown as DigestData;
  const s = snapshotOf(data, "2026-11-27");
  assertEquals(s.rows.map((r) => [r.id, r.top5]), [["STABLE|EVAA|USDT (Main)", undefined], ["STABLE|EVAA|USDe (Alts)", 1]]);
});

Deno.test("the snapshot keeps the contract address and how the APY was measured", () => {
  const tonstakers = row({ source: "Tonstakers", poolMeta: "tsTON", onChain: true, poolAddress: TSTON });
  const s = snapshotOf({ top5: [], shown: [{ row: tonstakers, section: "TON", label: "tsTON" }] } as unknown as DigestData, "2026-11-27");
  assertEquals(s.rows[0].address, TSTON);
  assertEquals(s.rows[0].onChain, true);
});

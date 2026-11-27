import { assert, assertEquals, assertFalse, assertStringIncludes } from "std/assert/mod.ts";
import type { YieldOpportunity } from "../types/yields.ts";
import { type DigestData, organizeByProtocol } from "./message.ts";
import { renderRich } from "./rich_message.ts";
import { CLASSIC_LIMIT, classicPost, visibleLength } from "./digest.ts";
import type { SinceYesterday } from "./since_yesterday.ts";

function row(overrides: Partial<YieldOpportunity>): YieldOpportunity {
  return {
    assetType: "TON",
    source: "Protocol",
    sourceUrl: "https://example.org/",
    asset: "GRAM",
    poolMeta: null,
    apyBase: 5,
    apyReward: null,
    apyTotal: 5,
    tvlUsd: 1_000_000,
    ...overrides,
  };
}

/** DigestData as prepareDigest would build it, without network or KV */
function digestOf(ton: YieldOpportunity[], stable: YieldOpportunity[] = [], top5: YieldOpportunity[] = []): DigestData {
  const sections = [
    { key: "TON" as const, title: "💎 GRAM YIELDS", groups: organizeByProtocol(ton) },
    { key: "STABLE" as const, title: "💵 USDT YIELDS", groups: organizeByProtocol(stable), limits: new Map([["EVAA", 3]]) },
    { key: "TON_USDT" as const, title: "🔄 YIELDS FOR GRAM-USDT POOLS", groups: [] },
  ];
  const all = [...ton, ...stable];
  return {
    now: new Date("2026-11-27T08:01:30Z"),
    tonTvl: 42_330_000,
    tvlChange: { change: 797_000, changePercent: 1.92 },
    displayedCount: all.length,
    activeCategories: sections.filter((s) => s.groups.length > 0).length,
    top5,
    sections,
    averages: new Map(),
    allPools: all,
    shown: all.map((r) => ({ row: r, section: r.assetType === "STABLE" ? "STABLE" : "TON", label: r.poolMeta })),
  };
}

Deno.test("the rich post has a header, a TOP-5 table, one collapsible table per section and a footer", () => {
  const tonstakers = row({ source: "Tonstakers", asset: "GRAM", poolMeta: "tsTON", apyTotal: 12.04, apy7d: 12.01, onChain: true, tvlUsd: 153_300_000 });
  const whalesNative = row({ source: "TON Whales", poolMeta: "native staking", apyTotal: 12.66, apyEstimate: true, tvlUsd: 16_200_000 });
  const wston = row({ source: "TON Whales", poolMeta: "wsTON", apyTotal: 13.4, apy7d: 13.2, onChain: true, tvlUsd: 1_010_000 });
  const html = renderRich(digestOf([tonstakers, whalesNative, wston], [], [wston]));
  assert(html.startsWith("<h3>TON Yields Daily</h3>\n<p><b>Nov 27, 2026</b> · 💎 TON DeFi TVL $42.3M <b>"));
  assertStringIncludes(html, "<h4>🏆 Top 5 yield opportunities</h4>");
  assertStringIncludes(html, `<tr><td>🥇</td><td><a href="https://example.org/">TON Whales</a> GRAM (wsTON)</td><td align="right"><b>13.4%</b></td><td align="right">13.2%</td><td align="right">$1.0M</td></tr>`);
  // One protocol with two rows spans them in the protocol column
  assertStringIncludes(html, `<td rowspan="2" valign="top"><b><a href="https://example.org/">TON Whales</a></b></td><td>GRAM (native staking)</td><td align="right"><b>12.7%</b></td><td align="right">est.</td>`);
  assertStringIncludes(html, "<details><summary><b>💎 GRAM Yields</b> · 3</summary>");
  // Empty sections are left out, no UR column without utilisation rates
  assertFalse(html.includes("Stablecoins"));
  assertFalse(html.includes(">UR<"));
  assertStringIncludes(html, `<footer><i>📊 ⛓️ on-chain · `);
  assertStringIncludes(html, `<tg-time unix="1795766490" format="t">08:01 UTC</tg-time></i></footer>`);
});

Deno.test("the rich legend names only markers the post shows", () => {
  const plain = renderRich(digestOf([row({ tvlUsd: 2_000_000 })]));
  for (const marker of ["↑↓", "est. the pool", "utilisation", "TVL below", "concentrated", "hacked protocol"]) {
    assertFalse(plain.includes(marker), `no "${marker}" without such a row`);
  }

  const gtc = row({ source: "GTC", asset: "USDT vault", assetType: "STABLE", apyTotal: 28.7, utilizationPct: 96.2, tvlUsd: 36_500 });
  const dust = row({ source: "Dust", tvlUsd: 2_000 });
  const tonco = row({ source: "Tonco", asset: "GRAM-USDT", poolMeta: "CL", tvlUsd: 123_000 });
  const html = renderRich(digestOf([dust, tonco], [gtc]));
  assertStringIncludes(html, `<td align="right">96.2% 🔥</td>`);
  assertStringIncludes(html, `<td align="right">$2.0K ⚠️</td>`);
  assertStringIncludes(html, "<p><i>UR utilisation rate (🔥 above 95%) · ⚠️ TVL below $10K · CL concentrated liquidity: an LP earns only while the price is in its range</i></p>");
  assertFalse(html.includes("est. the pool"));
});

Deno.test("the APY column holds numbers only, so it lines up; the arrow sits in front of the 7d value", () => {
  const gtc = row({ source: "GTC", asset: "USDT vault", assetType: "STABLE", apyTotal: 28.7, tvlUsd: 36_500 });
  const evaa = row({ source: "EVAA", asset: "USDT", assetType: "STABLE", poolMeta: "Main", apyTotal: 2.0, tvlUsd: 560_000 });
  const data = digestOf([], [gtc, evaa], [gtc]);
  data.averages.set(gtc, 27.1).set(evaa, 2.0);
  const html = renderRich(data);
  assertStringIncludes(html, `<td align="right"><b>28.7%</b></td><td align="right">↑ 27.1%</td>`);
  assertStringIncludes(html, `<td align="right"><b>2.0%</b></td><td align="right">2.0%</td>`);
  assertFalse(/<b>[0-9.]+%\s*[↑↓]/.test(html), "an arrow next to an APY number");
  assertStringIncludes(html, "↑↓ in 7d: today's APY is above or below its 7-day value");
});

Deno.test("hacked protocols show no TVL; third-party names are escaped; EVAA keeps its cap of 3", () => {
  const affluent = row({ source: "Affluent", asset: "GRAM-TSTON", tvlUsd: 721_690 });
  const evil = row({ source: `Evil <a href="x">`, asset: "GRAM<script>", tvlUsd: 50_000 });
  const evaa = [1, 2, 3, 4].map((i) => row({ source: "EVAA", assetType: "STABLE", asset: "USDT", poolMeta: `Pool ${i}`, tvlUsd: 100_000 * (5 - i) }));
  const html = renderRich(digestOf([affluent, evil], evaa));
  assertStringIncludes(html, `<a href="https://example.org/">Affluent</a> 🚨</b></td><td>GRAM-tsTON</td>`);
  assertFalse(html.includes("$721.7K"));
  assertStringIncludes(html, "🚨 hacked protocol");
  assertStringIncludes(html, "Evil &lt;a href=&quot;x&quot;&gt;");
  assertFalse(html.includes("<script>"));
  assertStringIncludes(html, "USDT (Pool 3)");
  assertFalse(html.includes("USDT (Pool 4)"));
  assertStringIncludes(html, `rowspan="3"`);
});

Deno.test("the classic post drops the Since yesterday block rather than pass Telegram's limit", () => {
  const since: SinceYesterday = {
    since: "2026-11-26",
    today: "2026-11-27",
    newlyHacked: [],
    topEntered: [],
    topLeft: [],
    moves: [],
    moreMoves: 0,
    joined: [],
    moreJoined: 0,
    left: [],
    moreLeft: 0,
  };
  const small = classicPost(digestOf([row({})]), since);
  assertStringIncludes(small, "🔁 SINCE YESTERDAY");

  const many = Array.from({ length: 60 }, (_, i) => row({ source: `Protocol ${i}`, asset: `GRAM-LONG-TICKER-${i}`, poolMeta: "a fairly long pool label" }));
  const real = console.warn;
  console.warn = () => {};
  try {
    const big = classicPost(digestOf(many), since);
    assertFalse(big.includes("SINCE YESTERDAY"));
  } finally {
    console.warn = real;
  }
  // Tags removed, entities count as one character, an emoji as two UTF-16 units
  assertEquals(visibleLength("<b>a</b> &lt;b&gt; &amp; 🥇"), 10);
  assert(CLASSIC_LIMIT === 4096);
});

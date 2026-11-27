import { assert, assertEquals, assertFalse, assertStringIncludes } from "std/assert/mod.ts";
import type { YieldOpportunity } from "../types/yields.ts";
import {
  displayText,
  escapeHtml,
  formatCategorySection,
  formatLegend,
  formatPostTime,
  formatSourcesLine,
  formatTopYieldsSection,
  organizeByProtocol,
} from "./message.ts";

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

const noAverages = new Map<YieldOpportunity, number>();

Deno.test("escapeHtml escapes Telegram HTML specials", () => {
  assertEquals(escapeHtml(`a<b>&"c"`), "a&lt;b&gt;&amp;&quot;c&quot;");
  assertEquals(escapeHtml("Ston.fi"), "Ston.fi");
});

Deno.test("displayText keeps third-party text on one short line", () => {
  // A line break in a name could fake an extra ranked row
  assertEquals(displayText("Main)\n\n🥇 Fake GRAM: 99.0% | $50.0M\r\n└ x ("), "Main) 🥇 Fake GRAM: 99.0% | $50.0M └ x (");
  assertEquals(displayText("  Vault\u2028\u0007 7  "), "Vault 7");
  // Lone surrogates are repaired, very long names are shortened
  assertEquals(displayText("a\uD800b"), "a\uFFFDb");
  const long = displayText("x".repeat(500));
  assertEquals(Array.from(long).length, 64);
  assert(long.endsWith("…"));
  assertEquals(displayText("TSUSDE-USDT-VAULT7"), "TSUSDE-USDT-VAULT7");
  // NEL and other C1 controls are line breaks too; direction controls are dropped
  assertEquals(displayText("Vault\u0085└ FAKE: 99.9%"), "Vault └ FAKE: 99.9%");
  assertEquals(displayText("LP\u009C 2"), "LP 2");
  assertEquals(displayText("USDT \u202E%9.99 :YPA"), "USDT %9.99 :YPA");
  assertEquals(displayText("GRAM\u2067 vault\u2069\u200B"), "GRAM vault");
  // Emoji sequences that use the zero-width joiner stay intact
  assertEquals(displayText("👨‍💻 Vault"), "👨‍💻 Vault");
});

Deno.test("third-party names cannot break or inject markup", () => {
  const section = formatCategorySection("💎 GRAM YIELDS", organizeByProtocol([
    row({
      source: `Evil <a href="https://phish.example">Click</a>`,
      sourceUrl: `https://example.org/?a=1&b="2"`,
      asset: "GRAM<script>",
      poolMeta: "Vault & Co",
    }),
  ]), noAverages);
  assertFalse(section.includes("<script>"));
  assertFalse(section.includes(`<a href="https://phish.example">`));
  assertStringIncludes(section, "GRAM&lt;script&gt; (Vault &amp; Co)");
  assertStringIncludes(section, `href="https://example.org/?a=1&amp;b=&quot;2&quot;"`);
});

Deno.test("hacked protocol is flagged, shown without TVL and listed last", () => {
  const groups = organizeByProtocol([
    row({ source: "Affluent", asset: "GRAM-TSTON", apyTotal: 11.83, tvlUsd: 721_690 }),
    row({ source: "Hipo", asset: "GRAM-hGRAM", apyTotal: 17.05, tvlUsd: 7_500_000 }),
    row({ source: "KTON", apyTotal: 13.43, tvlUsd: 2_000 }),
  ]);
  assertEquals(groups.map((g) => g.protocol), ["Hipo", "KTON", "Affluent"]);

  const section = formatCategorySection("💎 GRAM YIELDS", groups, noAverages);
  assertStringIncludes(section, "Affluent</a> 🚨 Hacked</b>");
  // DefiLlama's capitals are shown in the token's own spelling
  assertStringIncludes(section, "└ GRAM-tsTON: 11.8%</blockquote>");
  assertFalse(section.includes("$721.7K"));
  // Low TVL elsewhere is still flagged, not hidden
  assertStringIncludes(section, "└ GRAM: 13.4% | $2.0K ⚠️");
});

Deno.test("rows with hidden TVL show no TVL part", () => {
  const top = formatTopYieldsSection([
    row({ source: "GTC", asset: "GRAM vault", apyTotal: 20.26, tvlUsd: 0, tvlHidden: true }),
    row({ source: "Hipo", asset: "GRAM-hGRAM", apyTotal: 17.05, tvlUsd: 7_508_600 }),
  ], noAverages);
  assertStringIncludes(top, "GRAM vault: 20.3%\n");
  assertStringIncludes(top, "GRAM-hGRAM: 17.1% | $7.5M</blockquote>");
  assert(top.startsWith("──────────────────────\n<b>🏆 TOP 5 YIELD OPPORTUNITIES</b>"));
});

Deno.test("a measured 7d value is shown without any saved history", () => {
  const section = formatCategorySection("💎 GRAM YIELDS", organizeByProtocol([
    row({ source: "Tonstakers", asset: "GRAM-tsTON", poolMeta: "tsTON", apyTotal: 12.06, apy7d: 12.06, onChain: true, tvlUsd: 155_000_000 }),
    row({ source: "Stakee", asset: "GRAM", poolMeta: "STAKED", apyTotal: 14.6, apy7d: 13.7, onChain: true, tvlUsd: 22_000_000 }),
  ]), noAverages);
  assertStringIncludes(section, "GRAM-tsTON (tsTON): 12.1% (7d: 12.1%)");
  assertStringIncludes(section, "GRAM (STAKED): 14.6% ↑ (7d: 13.7%)");
});

Deno.test("an on-chain row without a trustworthy 7d value shows none, even with saved history", () => {
  const onchain = row({ source: "KTON", poolMeta: "KTON", apyTotal: 13.4, onChain: true, tvlUsd: 2_000_000 });
  const averages = new Map<YieldOpportunity, number>([[onchain, 13.0]]);
  const section = formatCategorySection("💎 GRAM YIELDS", organizeByProtocol([onchain]), averages);
  assertStringIncludes(section, "└ GRAM (KTON): 13.4% | $2.0M");
});

const POST_TIME = new Date("2026-11-27T08:01:30Z");

Deno.test("the sources line credits DefiLlama, Swap.coffee and Palette, not DeDust or GTC", () => {
  const onChain = formatSourcesLine([row({ source: "Hipo", onChain: true }), row({ source: "GTC" })], POST_TIME);
  assertEquals(
    onChain.replace(/<[^>]+>/g, ""),
    "📊 ⛓️ on-chain · DefiLlama · Swap.coffee · Palette · 08:01 UTC",
  );
  assertFalse(onChain.includes("GTC") || onChain.includes("giftcredit") || onChain.includes("DeDust"));
  // Without rows read from contracts there is no "on-chain" credit
  assertFalse(formatSourcesLine([row({ source: "GTC" })], POST_TIME).includes("on-chain"));
});

Deno.test("the post time is a date-time entity with the UTC time as its text", () => {
  assertEquals(formatPostTime(POST_TIME), `<tg-time unix="1795766490" format="t">08:01 UTC</tg-time>`);
  assertStringIncludes(formatSourcesLine([row({})], POST_TIME), `<tg-time unix="1795766490" format="t">08:01 UTC</tg-time></i>`);
});

Deno.test("a provider used by some rows is credited only when such a row is shown", () => {
  const whales = row({ source: "TON Whales", footerCredit: { name: "tonapi", url: "https://tonapi.io/" } });
  const line = formatSourcesLine([whales, { ...whales, poolMeta: "copy" }], POST_TIME);
  assertEquals(
    line.replace(/<[^>]+>/g, ""),
    "📊 DefiLlama · Swap.coffee · Palette · tonapi · 08:01 UTC",
  );
  assertStringIncludes(line, `<a href="https://tonapi.io/">tonapi</a>`);
  assertFalse(formatSourcesLine([row({})], POST_TIME).includes("tonapi"));
});

Deno.test("an estimated APY is marked est. and shows no 7-day value", () => {
  const whales = row({
    source: "TON Whales", poolMeta: "native staking", apyTotal: 12.6154, apyBase: 12.6154, apyEstimate: true, tvlUsd: 15_700_000,
  });
  const averages = new Map<YieldOpportunity, number>([[whales, 12.0]]);
  const section = formatCategorySection("💎 GRAM YIELDS", organizeByProtocol([whales]), averages);
  assertStringIncludes(section, "└ GRAM (native staking): 12.6% est. | $15.7M");
  assertStringIncludes(formatTopYieldsSection([whales], averages), "GRAM (native staking): 12.6% est. | $15.7M");
});

Deno.test("tickers keep their usual spelling", () => {
  const section = formatCategorySection("💵 USDT YIELDS", organizeByProtocol([
    row({ source: "EVAA", asset: "TSUSDE", poolMeta: "Main", apyTotal: 0.16, tvlUsd: 33_400 }),
    row({ source: "Ethena", asset: "tsUSDE", apyTotal: 4.95, tvlUsd: 1_650_000 }),
  ]), noAverages);
  assertStringIncludes(section, "└ tsUSDe (Main): 0.2% | $33.4K");
  assertStringIncludes(section, "└ tsUSDe: 5.0% | $1.6M");
});

Deno.test("the legend explains only what the post shows", () => {
  const plain = formatLegend([row({})]);
  assertEquals(plain, ["<i>APY (7d avg) ↑↓ | TVL · ⚠️ low TVL (&lt;$10K)</i>"]);

  const full = formatLegend([
    row({ source: "GTC", utilizationPct: 82 }),
    row({ source: "Affluent" }),
    row({ source: "TON Whales", apyEstimate: true }),
    row({ source: "Tonco", poolMeta: "CL" }),
    row({ source: "DeDust", poolMeta: "Classic 0.10%" }),
  ]);
  assertEquals(full, [
    "<i>APY (7d avg) ↑↓ | UR = Utilisation Rate (🔥 if &gt;95%) | TVL · ⚠️ low TVL (&lt;$10K) · 🚨 hacked protocol</i>",
    "<i>est. = the pool's own estimate · CL = concentrated liquidity: an LP earns only while the price is in its range</i>",
  ]);
  // The post says nothing about referral links (owner's choice of 2026-11-27)
  assertFalse(full.join("").includes("referral"));
  // DeDust's "Classic" label is not a concentrated-liquidity label
  assertFalse(formatLegend([row({ source: "DeDust", poolMeta: "Classic 0.10%" })]).join("").includes("CL ="));
  assertStringIncludes(formatLegend([row({ source: "Tonco", poolMeta: "CL v1" })]).join(""), "CL = concentrated liquidity");
});

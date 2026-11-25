import { assert, assertEquals, assertFalse, assertStringIncludes } from "std/assert/mod.ts";
import type { YieldOpportunity } from "../types/yields.ts";
import {
  displayText,
  escapeHtml,
  formatCategorySection,
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
  const section = formatCategorySection("💎 GRAM AND RELATED ASSETS", organizeByProtocol([
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

  const section = formatCategorySection("💎 GRAM AND RELATED ASSETS", groups, noAverages);
  assertStringIncludes(section, "Affluent</a> 🚨 Hacked</b>");
  assertStringIncludes(section, "└ GRAM-TSTON: 11.8%</blockquote>");
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
  const section = formatCategorySection("💎 GRAM AND RELATED ASSETS", organizeByProtocol([
    row({ source: "Tonstakers", asset: "GRAM-tsTON", poolMeta: "tsTON", apyTotal: 12.06, apy7d: 12.06, onChain: true, tvlUsd: 155_000_000 }),
    row({ source: "Stakee", asset: "GRAM", poolMeta: "STAKED", apyTotal: 14.6, apy7d: 13.7, onChain: true, tvlUsd: 22_000_000 }),
  ]), noAverages);
  assertStringIncludes(section, "GRAM-tsTON (tsTON): 12.1% (7d: 12.1%)");
  assertStringIncludes(section, "GRAM (STAKED): 14.6% ↑ (7d: 13.7%)");
});

Deno.test("an on-chain row without a trustworthy 7d value shows none, even with saved history", () => {
  const onchain = row({ source: "KTON", poolMeta: "KTON", apyTotal: 13.4, onChain: true, tvlUsd: 2_000_000 });
  const averages = new Map<YieldOpportunity, number>([[onchain, 13.0]]);
  const section = formatCategorySection("💎 GRAM AND RELATED ASSETS", organizeByProtocol([onchain]), averages);
  assertStringIncludes(section, "└ GRAM (KTON): 13.4% | $2.0M");
});

Deno.test("the sources line credits DefiLlama, Swap.coffee and Palette, not DeDust or GTC", () => {
  const onChain = formatSourcesLine([row({ source: "Hipo", onChain: true }), row({ source: "GTC" })], "17:48 UTC");
  assertEquals(
    onChain.replace(/<[^>]+>/g, ""),
    "📊 ⛓️ on-chain · DefiLlama · Swap.coffee · Palette · 17:48 UTC",
  );
  assertFalse(onChain.includes("GTC") || onChain.includes("giftcredit") || onChain.includes("DeDust"));
  // Without rows read from contracts there is no "on-chain" credit
  assertFalse(formatSourcesLine([row({ source: "GTC" })], "17:48 UTC").includes("on-chain"));
});

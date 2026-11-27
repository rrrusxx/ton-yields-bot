// Offline tests: no network, nothing sent. Rendering uses the resvg wasm from
// Deno's npm cache and the font files in assets/fonts.

import assert from "node:assert/strict";
import {
  buildWeeklyCardSvg,
  CARD_HEIGHT,
  CARD_WIDTH,
  type CardRow,
  COLORS,
  formatApy,
  tabular,
  type WeeklyCardData,
} from "./weekly_card.ts";
import { FONTS_DIR, INTER_FILES, loadFonts } from "./fonts.ts";
import { inkInMargin, renderPng } from "./render_png.ts";

const fontsDir = FONTS_DIR;
const fonts = await loadFonts(fontsDir);
/** Placeholder content (not real numbers) */
const MOCK_WEEK: WeeklyCardData = {
  title: "GRAM (TON) yields",
  subtitle: "Week of Nov 24-30, 2026",
  sections: [
    {
      title: "Liquid staking",
      note: "7-day APY measured on-chain",
      rows: [
        { name: "Tonstakers", detail: "tsTON", apy: 12.1 },
        { name: "Hipo", detail: "hGRAM", apy: 12.6 },
        { name: "Stakee", detail: "STAKED", apy: 13.7 },
        { name: "KTON", apy: 13.0 },
        { name: "Bemo", detail: "bmGRAM", apy: 12.4 },
        { name: "Bemo", detail: "stTON", apy: 12.2 },
        { name: "TON Whales", detail: "wsTON", apy: 13.5 },
      ],
    },
    {
      title: "Stablecoins",
      rows: [
        { name: "Storm", detail: "USDT vault", apy: 14.2 },
        { name: "EVAA", detail: "USDT", apy: 6.1 },
        { name: "Ethena", detail: "tsUSDe", apy: 5.0 },
      ],
    },
  ],
  footer: { handle: "@ton_yields_daily", sources: "data: on-chain, DefiLlama, Swap.coffee, Palette" },
};

const clone = (): WeeklyCardData => structuredClone(MOCK_WEEK);

async function renderChecked(data: WeeklyCardData) {
  const card = buildWeeklyCardSvg(data, fonts.metrics);
  const png = await renderPng(card.svg, fonts.buffers, { keepPixels: true });
  assert.equal(png.width, CARD_WIDTH);
  assert.equal(png.height, CARD_HEIGHT);
  assert.equal(inkInMargin(png, 24, COLORS.surface), 0, "something is drawn within 24 px of an edge");
  return { ...card, png };
}

Deno.test("fonts are the recorded Inter 4.1 files", async () => {
  for (const w of [400, 600, 700] as const) {
    const bytes = await Deno.readFile(new URL(INTER_FILES[w].file, fontsDir));
    assert.equal(bytes.length, INTER_FILES[w].bytes);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const hex = Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
    assert.equal(hex, INTER_FILES[w].sha256);
  }
});

Deno.test("formatApy: one decimal, a real minus sign, no -0.0", () => {
  assert.equal(formatApy(12.06), "12.1%");
  assert.equal(formatApy(-1.24), "−1.2%");
  assert.equal(formatApy(-0.01), "0.0%");
  assert.equal(formatApy(Number.NaN), "n/a");
});

Deno.test("tabular: decimal points and % line up whatever the digits", () => {
  const m = fonts.metrics[700];
  const a = tabular(m, "11.1%", 45, 1520, 0.72); // narrowest digits
  const b = tabular(m, "4.4%", 45, 1520, 0.72); // widest digit, one fewer
  assert.ok(Math.abs(a.xs[2] - b.xs[1]) < 1e-9, "decimal points differ");
  // digits are centred in equal slots, so compare glyph centres, not pen positions
  const centre = (xs: number[], k: number, ch: string) => xs[k] + (m.advanceUnits(ch.codePointAt(0)!) * 45) / m.unitsPerEm / 2;
  assert.ok(Math.abs(centre(a.xs, 3, "1") - centre(b.xs, 2, "4")) < 1e-9, "first decimals are not in the same slot");
  assert.ok(Math.abs(a.xs[4] - b.xs[3]) < 1e-9, "% signs differ");
  // the run ends exactly at the right edge and starts inside it
  assert.ok(a.xs[0] >= 1520 - a.width - 1e-9 && a.xs[4] < 1520);
});

Deno.test("mock card: ranked, complete, no warnings, phone-sized text", async () => {
  const { svg, warnings, layout } = await renderChecked(MOCK_WEEK);
  assert.deepEqual(warnings, []);
  assert.ok(!/NaN|undefined|Infinity/.test(svg));
  const lst = ["Stakee", "TON Whales", "KTON", "Hipo", "bmGRAM", "stTON", "Tonstakers"];
  const stable = ["Storm", "EVAA", "Ethena"];
  for (const group of [lst, stable]) {
    const at = group.map((s) => svg.indexOf(s));
    assert.ok(at.every((p) => p >= 0), "a row is missing");
    assert.deepEqual([...at].sort((x, y) => x - y), at, "rows are not ranked by APY");
  }
  for (const v of ["13.7", "13.5", "13.0", "12.6", "12.4", "12.2", "12.1", "14.2", "6.1", "5.0"]) {
    assert.ok(svg.includes(`>${v}<tspan`), `value ${v} missing`);
  }
  assert.equal(layout.rowsDrawn, 10);
  assert.ok(layout.labelSize >= 38 && layout.valueSize > layout.labelSize);
  assert.ok(layout.barHeight <= 24, "bars thicker than the 24 px mark cap");
});

Deno.test("escapes XML and leaves out what the font cannot draw (emoji, bidi)", async () => {
  const data = clone();
  data.sections[0].rows[0] = { name: `A<b>&"c'`, detail: "x‮y \u{1f680}", apy: 13 };
  const { svg, warnings } = await renderChecked(data);
  assert.ok(svg.includes("A&lt;b&gt;&amp;&quot;c&#39;"));
  assert.ok(!svg.includes("\u{1f680}") && !svg.includes("‮"));
  assert.ok(warnings.some((w) => w.includes("cannot draw")));
});

Deno.test("too-long text is cut with an ellipsis and stays inside the card", async () => {
  const data = clone();
  data.title = "GRAM (TON) yields with a very long title that cannot share its line";
  data.sections[0].rows[0] = {
    name: "A protocol with an extremely long display name",
    detail: "and a token name that goes on and on",
    apy: 13,
  };
  data.footer.sources = "data: " + Array(20).fill("Provider").join(", ");
  const { svg, warnings } = await renderChecked(data);
  assert.ok(svg.includes("…"));
  assert.ok(warnings.some((w) => w.startsWith("cut the label")));
  assert.ok(warnings.some((w) => w.includes("footer sources")));
});

Deno.test("more rows than fit: the lowest are left out, rows stay readable", async () => {
  const data = clone();
  const extra: CardRow[] = Array.from({ length: 12 }, (_, k) => ({ name: `Extra ${k}`, apy: 1 + k / 10 }));
  data.sections[0].rows.push(...extra);
  const { warnings, layout } = await renderChecked(data);
  assert.ok(warnings.some((w) => w.startsWith("left out")));
  assert.ok(layout.pitch >= 40);
  assert.ok(layout.rowsDrawn < 22);
});

Deno.test("zero, negative and missing APY: no bar, the value is still printed", async () => {
  const data = clone();
  data.sections[1].rows = [
    { name: "Storm", detail: "USDT vault", apy: -2.3 },
    { name: "EVAA", detail: "USDT", apy: 0 },
    { name: "Ethena", detail: "tsUSDe", apy: 5 },
    { name: "Broken", apy: Number.NaN },
  ];
  const { svg, warnings } = await renderChecked(data);
  assert.ok(svg.includes(">−2.3<tspan"));
  assert.ok(svg.includes(">0.0<tspan"));
  assert.ok(warnings.some((w) => w.includes("Broken")));
  assert.equal(svg.match(/<path /g)?.length, 7 + 1, "only positive APYs get bars");
});

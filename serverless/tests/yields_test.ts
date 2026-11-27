import { assert, assertEquals, assertStringIncludes } from "std/assert/mod.ts";
import { answerFor, compactRow, MAX_DATA_BYTES, MAX_ROWS, pack, sectionMessage, topData, widgetCaption } from "../tgcloud/lib/yields.js";
import { SNAPSHOT } from "../tgcloud/lib/data.js";
import { WIDGET_HTML } from "../tgcloud/lib/widget_html.js";
import { compressedSize, dataModule, WIDGET_COMPRESSED_TARGET, widgetModule } from "../scripts/build_lib.ts";

const root = new URL("../", import.meta.url);
const bytes = (s: string) => new TextEncoder().encode(s).length;

type Row = { id: string; section: string; protocol: string; label: string; apy: number; tvlUsd: number | null; top5?: number; estimate?: boolean; hacked?: boolean };
const row = (r: Partial<Row> & { protocol: string }): Row => ({ id: r.protocol, section: "TON", label: "GRAM", apy: 10, tvlUsd: 1_000_000, ...r });
const snap = (rows: Row[]) => ({ date: "2026-11-27", rows });

Deno.test("the committed modules are built from the current sources", async () => {
  const source = await Deno.readTextFile(new URL("widget/yields.html", root));
  assertEquals(await Deno.readTextFile(new URL("tgcloud/lib/widget_html.js", root)), widgetModule(source));
  const sample = await Deno.readTextFile(new URL("sample/snapshot.json", root));
  assertEquals(await Deno.readTextFile(new URL("tgcloud/lib/data.js", root)), dataModule(sample));
});

Deno.test("the widget fits Telegram's limits with room to spare", () => {
  assert(bytes(WIDGET_HTML) < 32768);
  assert(compressedSize(WIDGET_HTML) <= WIDGET_COMPRESSED_TARGET, `${compressedSize(WIDGET_HTML)} bytes compressed`);
  assert(!WIDGET_HTML.includes("\u0000"));
  // No network, no external files: everything the widget needs is inline
  assert(!/<script\s+src|<link|@import|fetch\(/.test(WIDGET_HTML));
});

Deno.test("rows carry the post's markers: estimate, low TVL, hacked", () => {
  assertEquals(compactRow(row({ protocol: "TON Whales", label: "GRAM (native staking)", apy: 12.66, estimate: true, tvlUsd: 16_200_000 })), ["TON Whales", "GRAM (native staking)", 12.7, "$16.2M", "e"]);
  assertEquals(compactRow(row({ protocol: "Dust", apy: 3, tvlUsd: 2_000 })), ["Dust", "GRAM", 3, "$2.0K", "w"]);
  assertEquals(compactRow(row({ protocol: "Rekt", apy: 9, tvlUsd: null, hacked: true })), ["Rekt", "GRAM", 9, "", "h"]);
});

Deno.test("the TOP-5 keeps the post's order; sections sort by APY; GRAM-USDT is not offered", () => {
  const s = snap([
    row({ protocol: "Hipo", apy: 16.6, top5: 3 }),
    row({ protocol: "GTC", label: "USDT vault", section: "STABLE", apy: 28.7, top5: 1 }),
    row({ protocol: "Stakee", apy: 13.5 }),
    row({ protocol: "Tonco", label: "GRAM-USDT (CL)", section: "TON_USDT", apy: 172 }),
  ]);
  assertEquals(JSON.parse(topData(s)).r.map((r: unknown[]) => r[0]), ["GTC", "Hipo"]);
  assertEquals(JSON.parse(answerFor(s, "s:TON")!).r.map((r: unknown[]) => r[0]), ["Hipo", "Stakee"]);
  assertEquals(JSON.parse(answerFor(s, "s:top")!).d, "Nov 27, 2026");
  assertEquals(answerFor(s, "s:TON_USDT"), null);
  assertEquals(answerFor(s, "anything"), null);
});

Deno.test("an answer never passes 1,024 bytes: extra rows are counted instead", () => {
  const many = snap(Array.from({ length: 60 }, (_, i) => row({ protocol: `Protocol number ${i}`, label: `A rather long pool label ${i}`, apy: 60 - i })));
  const json = pack(many, many.rows);
  assert(bytes(json) <= MAX_DATA_BYTES, `${bytes(json)} bytes`);
  const v = JSON.parse(json);
  assertEquals(v.r.length + v.m, 60);
  assert(v.m > 0 && v.r.length <= MAX_ROWS);
  // A tab never grows past the widget's 600 px: 13 short rows show 12 and count 1
  const thirteen = snap(Array.from({ length: 13 }, (_, i) => row({ protocol: `P${i}`, apy: 20 - i })));
  const t = JSON.parse(pack(thirteen, thirteen.rows));
  assertEquals([t.r.length, t.m], [12, 1]);
});

Deno.test("the per-user answer lists one section, escaped, under Telegram's 4,096 characters", () => {
  const s = snap([
    row({ protocol: "Evil <b>", label: "USDT & co", section: "STABLE", apy: 5 }),
    row({ protocol: "Ethena", label: "tsUSDe", section: "STABLE", apy: 4.8, tvlUsd: 1_600_000 }),
  ]);
  const text = sectionMessage(s, "STABLE");
  assertStringIncludes(text, "<b>💵 USDT Yields</b> · Nov 27, 2026");
  assertStringIncludes(text, "<b>Evil &lt;b&gt;</b> USDT &amp; co: 5.0% | $1.0M");
  assertStringIncludes(text, "https://t.me/ton_yields_daily");
  assert(sectionMessage(SNAPSHOT, "TON").length < 4096);
});

Deno.test("the sample data gives a full widget: TOP-5 in the shared state, a caption", () => {
  const top = JSON.parse(topData(SNAPSHOT));
  assertEquals(top.r.length, 5);
  assertEquals(top.m, 0);
  assert(bytes(topData(SNAPSHOT)) <= MAX_DATA_BYTES);
  const caption = widgetCaption(SNAPSHOT);
  assert(caption.length <= 1024);
  assertStringIncludes(caption, "GRAM (TON) yields, Nov 27, 2026.");
});

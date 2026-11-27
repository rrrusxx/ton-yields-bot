import { assertEquals } from "std/assert/mod.ts";
import { daysBefore, loadPreviousSnapshot, type PostSnapshot, savePostSnapshot } from "./post_snapshot.ts";

/** Run `fn` against a throwaway KV file, never ./data/kv.db */
async function withTempKv(fn: () => Promise<void>): Promise<void> {
  const dir = await Deno.makeTempDir();
  const previous = Deno.env.get("YIELDS_KV_PATH");
  Deno.env.set("YIELDS_KV_PATH", `${dir}/kv.db`);
  try {
    await fn();
  } finally {
    if (previous === undefined) Deno.env.delete("YIELDS_KV_PATH");
    else Deno.env.set("YIELDS_KV_PATH", previous);
    await Deno.remove(dir, { recursive: true });
  }
}

const snapshot = (date: string, apy = 12): PostSnapshot => ({
  date,
  rows: [{ id: "TON|Tonstakers|GRAM (tsTON)", section: "TON", protocol: "Tonstakers", label: "GRAM (tsTON)", apy, tvlUsd: 150_000_000 }],
});

Deno.test("the previous post is the newest one before today, per channel, at most 7 days old", async () => {
  await withTempKv(async () => {
    assertEquals(await loadPreviousSnapshot("@ton_yields_daily", "2026-11-27"), null);
    await savePostSnapshot("@ton_yields_daily", snapshot("2026-11-19")); // 8 days old
    assertEquals(await loadPreviousSnapshot("@ton_yields_daily", "2026-11-27"), null);
    await savePostSnapshot("@ton_yields_daily", snapshot("2026-11-24"));
    await savePostSnapshot("@ton_yields_daily", snapshot("2026-11-26"));
    await savePostSnapshot("@ton_yields_daily", snapshot("2026-11-27")); // today's own post is not "previous"
    await savePostSnapshot("@ton_yields_test", snapshot("2026-11-26", 99));
    assertEquals((await loadPreviousSnapshot("@ton_yields_daily", "2026-11-27"))?.date, "2026-11-26");
    assertEquals((await loadPreviousSnapshot("@ton_yields_daily", "2026-11-27"))?.rows[0].apy, 12);
    assertEquals((await loadPreviousSnapshot("@ton_yields_test", "2026-11-27"))?.rows[0].apy, 99);
    // A second post on the same day replaces that day's entry
    await savePostSnapshot("@ton_yields_daily", snapshot("2026-11-26", 13));
    assertEquals((await loadPreviousSnapshot("@ton_yields_daily", "2026-11-27"))?.rows[0].apy, 13);
  });
});

Deno.test("dates count back in UTC days across month ends", () => {
  assertEquals(daysBefore("2026-12-01", 1), "2026-11-30");
  assertEquals(daysBefore("2026-03-01", 7), "2026-02-22");
});

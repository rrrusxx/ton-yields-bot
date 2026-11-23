import { assertEquals } from "std/assert/mod.ts";
import { markPosted, utcDate, wasPostedOn } from "./post_guard.ts";

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

Deno.test("the day's marker is kept per channel and per UTC date", async () => {
  await withTempKv(async () => {
    assertEquals(await wasPostedOn("@ton_yields_daily", "2026-11-24"), false);
    await markPosted("@ton_yields_daily", "2026-11-24");
    assertEquals(await wasPostedOn("@ton_yields_daily", "2026-11-24"), true);
    assertEquals(await wasPostedOn("@ton_yields_test", "2026-11-24"), false); // a test post never blocks the real one
    assertEquals(await wasPostedOn("@ton_yields_daily", "2026-11-25"), false); // the next day
  });
});

Deno.test("a run belongs to its UTC date", () => {
  assertEquals(utcDate(new Date("2026-11-24T23:30:00-05:00")), "2026-11-25");
  assertEquals(utcDate(new Date("2026-11-24T00:10:00Z")), "2026-11-24");
});

import { assertAlmostEquals, assertEquals } from "std/assert/mod.ts";
import { averageOfRecentSnapshots } from "./apy_history.ts";

const snap = (date: string, apy: number) => ({ date, apy });

Deno.test("7d average uses only snapshots from the last 7 days", () => {
  const avg = averageOfRecentSnapshots([
    snap("2026-11-20", 10),
    snap("2026-11-19", 12),
    snap("2026-11-14", 14), // 6 days back: inside the window
    snap("2026-11-13", 99), // 7 days back: outside
    snap("2026-08-17", 99),
  ], "2026-11-20");
  assertAlmostEquals(avg!, 12, 1e-9);
});

Deno.test("stale history alone gives no 7d average", () => {
  // An old local KV file must not produce a "7d" value
  assertEquals(averageOfRecentSnapshots([
    snap("2026-11-20", 13.3),
    snap("2026-08-17", 14.5),
    snap("2026-08-12", 14.9),
    snap("2026-07-08", 15.1),
  ], "2026-11-20"), null);
});

Deno.test("non-numeric snapshots and future dates are ignored", () => {
  assertEquals(averageOfRecentSnapshots([
    snap("2026-11-20", 5),
    snap("2026-11-19", Number.NaN),
    snap("2026-11-21", 7),
    snap("2026-11-18", 6),
  ], "2026-11-20"), null);
});

Deno.test("month boundary", () => {
  const avg = averageOfRecentSnapshots([
    snap("2026-12-02", 3),
    snap("2026-11-30", 4),
    snap("2026-11-26", 5),
    snap("2026-11-25", 50),
  ], "2026-12-02");
  assertAlmostEquals(avg!, 4, 1e-9);
});

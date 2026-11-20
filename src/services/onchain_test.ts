import { assert, assertAlmostEquals, assertEquals } from "std/assert/mod.ts";
import type { YieldOpportunity } from "../types/yields.ts";
import {
  computeLstApys,
  CYCLE_SECONDS,
  LSTS,
  type LstSpec,
  preferOnchain,
  realizedApy,
  reconcile,
  WINDOW_SECONDS,
} from "./onchain.ts";

const hex = (n: bigint) => `0x${n.toString(16)}`;
const numEntry = (n: bigint): [string, string] => ["num", hex(n)];
const filler = (size: number) => Array.from({ length: size }, () => numEntry(0n));

/** A get_pool_full_data stack of `size` values with balance and supply in place */
function poolStack(size: 30 | 34, balance: bigint, supply: bigint): [string, string][] {
  const stack = filler(size);
  stack[2] = numEntry(balance);
  stack[size === 30 ? 13 : 17] = numEntry(supply);
  return stack;
}

/** A Hipo get_treasury_state stack (31 values live) */
function hipoStack(coins: bigint, tokens: bigint): [string, string][] {
  const stack = filler(31);
  stack[0] = numEntry(coins);
  stack[1] = numEntry(tokens);
  return stack;
}

/** A Bemo get_full_data stack (15 values live) */
function bemoStack(tokens: bigint, coins: bigint): [string, string][] {
  const stack = filler(15);
  stack[0] = numEntry(tokens);
  stack[1] = numEntry(coins);
  return stack;
}

const byName = (source: string, poolMeta: string) => LSTS.find((s) => s.source === source && s.poolMeta === poolMeta)!;

Deno.test("realized APY compounds the rate growth over the window", () => {
  const apy = realizedApy(1.0, 1.0025, WINDOW_SECONDS)!;
  const expected = (Math.pow(1.0025, (365 * 24 * 3600) / WINDOW_SECONDS) - 1) * 100;
  assertAlmostEquals(apy, expected, 1e-9);
  assert(apy > 12 && apy < 13);
});

Deno.test("implausible rate changes are rejected", () => {
  assertEquals(realizedApy(1.0, 0.999, WINDOW_SECONDS), null); // rate fell
  assertEquals(realizedApy(1.0, 1.0, WINDOW_SECONDS), null); // no payout
  assertEquals(realizedApy(1.0, 1.05, WINDOW_SECONDS), null); // above 40% a year
  assertEquals(realizedApy(0, 1.0, WINDOW_SECONDS), null);
});

Deno.test("reconcile: normal readings, a miscounted cycle, a doubtful week", () => {
  assertEquals(reconcile(13.93, 13.71), { apy: 13.93, apy7d: 13.71 });
  // Two KTON payouts in one cycle (seen on 2026-11-17): the week stands in
  assertEquals(reconcile(28.51, 13.45)?.apy, 13.45);
  assertEquals(reconcile(28.51, 13.45)?.apy7d, 13.45);
  // No payout in the last cycle
  assertEquals(reconcile(null, 13.43)?.apy, 13.43);
  // The week caught one payout too many: keep the cycle, show no 7d
  const doubtful = reconcile(13.4, 16.1)!;
  assertEquals([doubtful.apy, doubtful.apy7d], [13.4, undefined]);
  // Week unavailable: nothing vouches for the one-cycle value, the LST falls back
  assertEquals(reconcile(12.05, null), null);
  assertEquals(reconcile(null, null), null);
});

Deno.test("every LST row keeps the label of the row it replaces", () => {
  assertEquals(
    LSTS.map((s) => `${s.source} ${s.asset} (${s.poolMeta})`),
    [
      "Tonstakers GRAM-tsTON (tsTON)",
      "Stakee GRAM (STAKED)",
      "Hipo GRAM-hGRAM (hGRAM)",
      "KTON GRAM (KTON)",
      "Bemo GRAM-stTON (stTON)",
      "Bemo GRAM-bmTON (bmTON)",
    ],
  );
});

Deno.test("layouts are recognised by their number of values, anything else fails closed", () => {
  const fails = (fn: () => unknown) => {
    try {
      fn();
      return false;
    } catch {
      return true;
    }
  };
  assertEquals(byName("Tonstakers", "tsTON").extract(poolStack(30, 118n, 100n)), { coins: 118n, tokens: 100n });
  assertEquals(byName("KTON", "KTON").extract(poolStack(34, 109n, 100n)), { coins: 109n, tokens: 100n });
  assertEquals(byName("Hipo", "hGRAM").extract(hipoStack(120n, 100n)), { coins: 120n, tokens: 100n });
  assertEquals(byName("Bemo", "stTON").extract(bemoStack(100n, 119n)), { coins: 119n, tokens: 100n });
  assert(fails(() => byName("Tonstakers", "tsTON").extract(filler(31))));
  assert(fails(() => byName("Hipo", "hGRAM").extract(filler(2))));
  assert(fails(() => byName("Bemo", "bmTON").extract(filler(16))));
});

/** Stub toncenter: blocks a cycle and a week ago, stacks per address and moment */
function stubToncenter(stacks: Record<string, Record<"now" | "cycle" | "week", [string, string][] | "lite">>) {
  const nowSec = Date.now() / 1000;
  const times: Record<number, number> = {
    2000: Math.floor(nowSec - CYCLE_SECONDS),
    1000: Math.floor(nowSec - WINDOW_SECONDS),
  };
  const calls: string[] = [];
  const fetchStub = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    calls.push(url);
    if (url.includes("lookupBlock")) {
      const unixtime = Number(new URL(url).searchParams.get("unixtime"));
      return Response.json({ ok: true, result: { seqno: Math.abs(unixtime - times[2000]) < 60 ? 2000 : 1000 } });
    }
    if (url.includes("getBlockHeader")) {
      const seqno = Number(new URL(url).searchParams.get("seqno"));
      const base = seqno >= 2000 ? 2000 : 1000;
      return Response.json({ ok: true, result: { gen_utime: times[base] + (seqno - base) } });
    }
    if (url.includes("runGetMethod")) {
      const body = JSON.parse(String(init?.body));
      const at = body.seqno === undefined ? "now" : body.seqno >= 2000 ? "cycle" : "week";
      const stack = stacks[body.address]?.[at];
      if (stack === "lite") {
        return Response.json({ ok: false, error: "LITE_SERVER_ERROR: cannot load state", code: 500 }, { status: 500 });
      }
      return Response.json({ ok: true, result: { exit_code: 0, stack } });
    }
    throw new Error(`unexpected request in test: ${url}`);
  }) as typeof fetch;
  return { fetchStub, calls };
}

async function withStub<T>(fetchStub: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const realFetch = globalThis.fetch;
  const realKey = Deno.env.get("TONCENTER_API_KEY");
  Deno.env.set("TONCENTER_API_KEY", "test-key"); // short throttle in tests
  globalThis.fetch = fetchStub;
  try {
    return await fn();
  } finally {
    globalThis.fetch = realFetch;
    if (realKey === undefined) Deno.env.delete("TONCENTER_API_KEY");
    else Deno.env.set("TONCENTER_API_KEY", realKey);
  }
}

Deno.test({
  name: "computeLstApys reads both windows and skips or degrades LSTs that fail",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const specs: LstSpec[] = [
      { ...byName("Tonstakers", "tsTON") }, // grows normally
      { ...byName("Stakee", "STAKED"), address: "SHRINKS" }, // rate falls in both windows: rejected
      { ...byName("KTON", "KTON"), address: "BADLAYOUT" }, // unknown layout: rejected
      { ...byName("Hipo", "hGRAM"), address: "FLATCYCLE" }, // no payout in the last cycle
    ];
    const { fetchStub } = stubToncenter({
      [specs[0].address]: {
        now: poolStack(30, 1_002_500n, 1_000_000n),
        cycle: poolStack(30, 1_002_000n, 1_000_000n),
        week: poolStack(30, 1_000_000n, 1_000_000n),
      },
      SHRINKS: { now: poolStack(30, 1000n, 1000n), cycle: poolStack(30, 1050n, 1000n), week: poolStack(30, 1100n, 1000n) },
      BADLAYOUT: { now: filler(12), cycle: filler(12), week: filler(12) },
      FLATCYCLE: { now: hipoStack(1_002_500n, 1_000_000n), cycle: hipoStack(1_002_500n, 1_000_000n), week: hipoStack(1_000_000n, 1_000_000n) },
    });
    const results = await withStub(fetchStub, () => computeLstApys(specs));
    assertEquals(results.map((r) => r.spec.source), ["Tonstakers", "Hipo"]);
    const [tonstakers, hipo] = results;
    assert(tonstakers.apy7d! > 12 && tonstakers.apy7d! < 13); // 0.25% over 7.6 days
    assert(tonstakers.apy > 12 && tonstakers.apy < 13.5); // 0.05% over 1.5 days
    assertAlmostEquals(tonstakers.stakedGram, 1_002_500 / 1e9, 1e-12);
    assertEquals(hipo.apy, hipo.apy7d); // the week stands in for the empty cycle
  },
});

Deno.test({
  name: "a LITE_SERVER answer steps to another block at once instead of retrying the same one",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const spec = { ...byName("Tonstakers", "tsTON"), address: "FLAKY" };
    const { fetchStub, calls } = stubToncenter({
      FLAKY: { now: poolStack(30, 1_002_500n, 1_000_000n), cycle: poolStack(30, 1_002_000n, 1_000_000n), week: "lite" },
    });
    const results = await withStub(fetchStub, () => computeLstApys([spec]));
    // The week window failed on every step: the LST is left to the fallback
    assertEquals(results.length, 0);
    const weekReads = calls.filter((c) => c.includes("runGetMethod")).length - 2; // minus now and cycle
    assertEquals(weekReads, 4); // one try per step, no same-block retries
  },
});

Deno.test("on-chain rows replace fallback rows by address or by ticker in either generation", () => {
  const row = (fields: Partial<YieldOpportunity>) => ({ asset: "GRAM", apyTotal: 0, tvlUsd: 0, ...fields } as YieldOpportunity);
  const swapCoffee = [
    row({ source: "Tonstakers", poolMeta: "tsGRAM", apyTotal: 13.33, tvlUsd: 153_800_000 }), // renamed ticker
    row({ source: "Bemo", poolMeta: "stTON", apyTotal: 13.6, poolAddress: "EQ-bemo-v1" }),
    row({ source: "Bemo", poolMeta: "bmGRAM", apyTotal: 13.6, poolAddress: "EQ-bemo-v2" }),
    row({ source: "Ston.fi", poolMeta: "tsTON", apyTotal: 1.9 }),
  ];
  const onchain = [
    row({ source: "Tonstakers", poolMeta: "tsTON", apyTotal: 12.05, onChain: true, tvlUsd: 0, tvlHidden: true }),
    row({ source: "Bemo", poolMeta: "bmTON", apyTotal: 13.37, onChain: true, poolAddress: "EQ-bemo-v2" }),
  ];
  const merged = preferOnchain(swapCoffee, onchain);
  assertEquals(merged.map((y) => `${y.source} ${y.poolMeta} ${y.apyTotal}`), [
    "Bemo stTON 13.6",
    "Ston.fi tsTON 1.9",
    "Tonstakers tsTON 12.05",
    "Bemo bmTON 13.37",
  ]);
  // Without a GRAM price the on-chain row keeps the replaced row's TVL
  const tonstakers = merged.find((y) => y.source === "Tonstakers")!;
  assertEquals([tonstakers.tvlUsd, tonstakers.tvlHidden], [153_800_000, false]);
});

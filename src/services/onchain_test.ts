import { assert, assertAlmostEquals, assertEquals, assertRejects } from "std/assert/mod.ts";
import type { YieldOpportunity } from "../types/yields.ts";
import {
  computeLstApys,
  computeStormApys,
  CYCLE_SECONDS,
  fetchOnchainYields,
  isSendableKey,
  LSTS,
  type LstSpec,
  preferOnchain,
  realizedApy,
  reconcile,
  STORM_VAULTS,
  STORM_WINDOW_SECONDS,
  type StormVaultSpec,
  vaultApy,
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

/** A TON Whales wsTON get_pool_status stack (15 values live): [1] rate, [10] wsTON supply, [11] GRAM balance */
function whalesStack(supply: bigint, balance: bigint, size = 15, rate = (balance * 1_000_000_000n) / supply): [string, string][] {
  const stack = filler(size);
  stack[1] = numEntry(rate);
  stack[10] = numEntry(supply);
  stack[11] = numEntry(balance);
  stack[12] = numEntry(balance);
  return stack;
}

const byName = (source: string, poolMeta: string) => LSTS.find((s) => s.source === source && s.poolMeta === poolMeta)!;

/** A Storm get_vault_data stack: [1] LP rate (1e9 = 1), [2] SLP supply, [3] free, [4] locked balance */
function vaultStack(supply: bigint, free: bigint, locked: bigint, size = 9, rate = (free * 1_000_000_000n) / supply): [string, string][] {
  const stack = filler(size);
  stack[1] = numEntry(rate);
  stack[2] = numEntry(supply);
  stack[3] = numEntry(free);
  stack[4] = numEntry(locked);
  return stack;
}

const vault = (asset: string) => STORM_VAULTS.find((v) => v.asset === asset)!;

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

Deno.test("every LST row reads GRAM (token) and keeps the label of the row it replaces", () => {
  assertEquals(
    LSTS.map((s) => `${s.source} ${s.asset} (${s.poolMeta})`),
    [
      "Tonstakers GRAM (tsTON)",
      "Stakee GRAM (STAKED)",
      "Hipo GRAM (hGRAM)",
      "KTON GRAM (KTON)",
      "Bemo GRAM (stTON)",
      "Bemo GRAM (bmTON)",
      "TON Whales GRAM (wsTON)",
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

Deno.test("wsTON is read only when its rate is GRAM balance / supply", () => {
  const fails = (fn: () => unknown) => {
    try {
      fn();
      return false;
    } catch {
      return true;
    }
  };
  const wston = byName("TON Whales", "wsTON");
  assertEquals(wston.method, "get_pool_status");
  // Live values of 2026-11-26: rate 1.185409671, 857,225 wsTON for 1,016,163 GRAM
  const supply = 857_225_320_000_000n;
  const balance = 1_016_162_800_000_000n;
  const atRate = (1_185_409_671n * supply) / 1_000_000_000n;
  assertEquals(wston.extract(whalesStack(supply, balance, 15, 1_185_409_671n)), { coins: atRate, tokens: supply });
  // Deposits between payouts move the ratio by about 1e-5: still accepted, and
  // the reading follows the published rate, not the drifting balance
  assertEquals(wston.extract(whalesStack(supply, balance + 6_000_000_000n, 15, 1_185_409_671n)).coins, atRate);
  assert(fails(() => wston.extract(whalesStack(supply, balance, 16)))); // unknown layout
  assert(fails(() => wston.extract(whalesStack(supply, balance, 15, 1_300_000_000n)))); // rate is not balance / supply
  assert(fails(() => wston.extract(whalesStack(1n, 0n, 15, 1n)))); // empty pool
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

async function withStub<T>(fetchStub: typeof fetch, fn: () => Promise<T>, key = "test-key"): Promise<T> {
  const realFetch = globalThis.fetch;
  const realKey = Deno.env.get("TONCENTER_API_KEY");
  Deno.env.set("TONCENTER_API_KEY", key); // a key keeps the throttle short in tests
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

/** toncenter's answer to a request made with an unknown key */
const unknownKey = (error = "API key does not exist") =>
  Response.json({ ok: false, error, code: 401 }, { status: 401 });

const keyOf = (init?: RequestInit) => (init?.headers as Record<string, string> | undefined)?.["X-API-Key"];

/** Run `fn` with console.warn captured instead of printed */
async function capturingWarnings<T>(fn: () => Promise<T>): Promise<{ result: T; warnings: string[] }> {
  const warnings: string[] = [];
  const realWarn = console.warn;
  console.warn = (...args: unknown[]) => void warnings.push(args.map(String).join(" "));
  try {
    return { result: await fn(), warnings };
  } finally {
    console.warn = realWarn;
  }
}

Deno.test({
  name: "a refused API key is dropped after one warning and the run goes on without it",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const key = "revoked-test-key";
    const spec = { ...byName("Tonstakers", "tsTON"), address: "KEYCHECK" };
    const { fetchStub } = stubToncenter({
      KEYCHECK: {
        now: poolStack(30, 1_002_500n, 1_000_000n),
        cycle: poolStack(30, 1_002_000n, 1_000_000n),
        week: poolStack(30, 1_000_000n, 1_000_000n),
      },
    });
    const keysSent: (string | undefined)[] = [];
    const sentAt: number[] = [];
    const refusing = (async (input: string | URL | Request, init?: RequestInit) => {
      keysSent.push(keyOf(init));
      sentAt.push(Date.now());
      if (keysSent.length > 20) throw new Error("request loop"); // a resend regression fails instead of hanging
      // toncenter does not echo the key; this stub does, to check that the log masks it
      if (keyOf(init) === key) return unknownKey(`API key ${key} does not exist`);
      return fetchStub(input, init);
    }) as typeof fetch;
    const { result, warnings } = await capturingWarnings(() => withStub(refusing, () => computeLstApys([spec]), key));
    assertEquals(result.map((r) => r.spec.source), ["Tonstakers"]); // still read on-chain
    assertEquals(keysSent[0], key); // the first request tried the key...
    assertEquals(keysSent.slice(1).filter((k) => k !== undefined), []); // ...no later one sent it
    assertEquals(keysSent.length, 8); // 7 requests of a normal run plus the refused one, sent again
    // From the refusal on, requests keep the keyless spacing (1100 ms)
    const gaps = sentAt.slice(1).map((t, i) => t - sentAt[i]);
    assert(gaps.every((gap) => gap >= 1000), `gaps after the refusal: ${gaps.join(", ")} ms`);
    const refused = warnings.filter((w) => w.includes("refused"));
    assertEquals(refused.length, 1);
    assert(refused[0].includes("HTTP 401") && !refused[0].includes(key)); // the key never reaches the log
  },
});

Deno.test("only a plain key (Latin letters, digits, punctuation) is accepted", () => {
  assert(isSendableKey("0f3c9a7be2d14c58a6e0b9d27f41c3e8a5b6d7c8e9f0a1b2c3d4e5f6a7b8c9d0"));
  assert(isSendableKey("any-printable_ASCII.~!"));
  for (
    const bad of [
      "",
      "two\nlines", // a two-line paste
      "with space",
      "0f3cаb", // Cyrillic "а" in place of a Latin "a"
      "0f3c​ab", // zero-width space from a copy
      "0f3c ab", // non-breaking space
      "0f3c\u{1F511}", // emoji
      "0f3c\u007Fab", // DEL
      "“0f3cab”", // smart quotes
    ]
  ) assert(!isSendableKey(bad), JSON.stringify(bad));
});

Deno.test({
  name: "a key with a line break or a non-Latin character is never sent and the run goes on without it",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const key = "malformed\ntest-key";
    const spec = { ...byName("Hipo", "hGRAM"), address: "BADHEADER" };
    const { fetchStub } = stubToncenter({
      BADHEADER: {
        now: hipoStack(1_002_500n, 1_000_000n),
        cycle: hipoStack(1_002_000n, 1_000_000n),
        week: hipoStack(1_000_000n, 1_000_000n),
      },
    });
    const keysSent: (string | undefined)[] = [];
    const strict = (async (input: string | URL | Request, init?: RequestInit) => {
      new Request(input, init); // throws on a header value fetch cannot send, as the real fetch does
      keysSent.push(keyOf(init));
      return fetchStub(input, init);
    }) as typeof fetch;
    const { result, warnings } = await capturingWarnings(() => withStub(strict, () => computeLstApys([spec]), key));
    assertEquals(result.map((r) => r.spec.source), ["Hipo"]); // still read on-chain
    assertEquals(keysSent.length, 7);
    assertEquals(keysSent.filter((k) => k !== undefined), []); // the key was never sent
    const skipped = warnings.filter((w) => w.includes("TONCENTER_API_KEY"));
    assertEquals(skipped.length, 1);
    assert(warnings.every((w) => !w.includes("malformed"))); // no part of the key reaches the log
  },
});

Deno.test({
  name: "the key is sent trimmed",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const spec = { ...byName("Tonstakers", "tsTON"), address: "TRIMMED" };
    const { fetchStub } = stubToncenter({
      TRIMMED: {
        now: poolStack(30, 1_002_500n, 1_000_000n),
        cycle: poolStack(30, 1_002_000n, 1_000_000n),
        week: poolStack(30, 1_000_000n, 1_000_000n),
      },
    });
    const keysSent = new Set<string | undefined>();
    const recording = (async (input: string | URL | Request, init?: RequestInit) => {
      keysSent.add(keyOf(init));
      return fetchStub(input, init);
    }) as typeof fetch;
    const results = await withStub(recording, () => computeLstApys([spec]), "  trimmed-test-key \n");
    assertEquals(results.length, 1);
    assertEquals([...keysSent], ["trimmed-test-key"]);
  },
});

Deno.test({
  name: "a blank key means no key, without a warning",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    for (const blank of ["", "  \n "]) {
      const keysSent: (string | undefined)[] = [];
      // Every request fails at once, so each run stops after its two block lookups
      const badRequest = (async (_input: string | URL | Request, init?: RequestInit) => {
        keysSent.push(keyOf(init));
        return Response.json({ ok: false, error: "test stub", code: 400 }, { status: 400 });
      }) as typeof fetch;
      const { warnings } = await capturingWarnings(() =>
        assertRejects(() => withStub(badRequest, () => computeLstApys([LSTS[0]]), blank), Error, "no past block available")
      );
      assertEquals(keysSent, [undefined, undefined], JSON.stringify(blank));
      assertEquals(warnings.filter((w) => w.includes("TONCENTER_API_KEY")), [], JSON.stringify(blank));
    }
  },
});

Deno.test({
  name: "a refusal that also comes without a key is not retried in a loop",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    let requests = 0;
    const alwaysRefuses = (async () => {
      // A regression that resends forever fails here instead of hanging the suite
      if (++requests > 10) throw new Error("request loop");
      return unknownKey();
    }) as typeof fetch;
    await capturingWarnings(() =>
      assertRejects(
        () => withStub(alwaysRefuses, () => computeLstApys([LSTS[0]]), "another-revoked-key"),
        Error,
        "no past block available",
      )
    );
    assertEquals(requests, 3); // one-cycle lookup with the key and again without it, then the 5-cycle lookup
  },
});

Deno.test("Storm vault rows keep the labels of the Swap.coffee rows they replace", () => {
  assertEquals(
    STORM_VAULTS.map((v) => `${v.source} ${v.asset} (${v.poolMeta}) ${v.assetType}`),
    ["Storm Trade GRAM (TON-SLP) TON", "Storm Trade USDT (null) STABLE"],
  );
});

Deno.test("get_vault_data is read only when its rate is free balance / supply", () => {
  const fails = (fn: () => unknown) => {
    try {
      fn();
      return false;
    } catch {
      return true;
    }
  };
  // Values of the live USDT vault on 2026-11-23 (9 values) and the 8-value layout of older vaults
  const live = vault("USDT").extract(vaultStack(1_591_171_886_417_926n, 2_138_609_397_926_078n, 208_890_532_663_846n, 9, 1_344_046_747n));
  assertEquals(live, { coins: 2_138_609_397_926_078n, tokens: 1_591_171_886_417_926n }); // the free balance, not the locked
  assert(!fails(() => vault("GRAM").extract(vaultStack(1_000n, 1_300n, 200n, 8))));
  assert(fails(() => vault("GRAM").extract(vaultStack(1_000n, 1_300n, 200n, 10)))); // unknown layout
  assert(fails(() => vault("GRAM").extract(vaultStack(1_000n, 1_300n, 200n, 9, 1_400_000_000n)))); // rate is not free / supply
  assert(fails(() => vault("GRAM").extract(vaultStack(1n, 0n, 0n)))); // empty vault
});

Deno.test("a vault APY can be negative, but not implausible", () => {
  const week = 7 * 86_400;
  assertAlmostEquals(vaultApy(1.3135, 1.3147, week)!, (Math.pow(1.3147 / 1.3135, (365 * 86_400) / week) - 1) * 100, 1e-9);
  assert(vaultApy(1.3147, 1.3135, week)! < 0); // traders won this week
  assertEquals(vaultApy(1.0, 1.0, week), 0);
  assertEquals(vaultApy(1.0, 1.02, week), null); // above 100% a year
  assertEquals(vaultApy(1.0, 0.98, week), null); // below -50% a year
  assertEquals(vaultApy(0, 1.0, week), null);
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const YEAR = 365 * 86_400;

/** Run `fn` with console.log, warn and error captured instead of printed */
async function quietly<T>(fn: () => Promise<T>): Promise<{ result: T; lines: string[] }> {
  const lines: string[] = [];
  const real = { log: console.log, warn: console.warn, error: console.error };
  const keep = (...args: unknown[]) => void lines.push(args.map(String).join(" "));
  console.log = keep;
  console.warn = keep;
  console.error = keep;
  try {
    return { result: await fn(), lines };
  } finally {
    Object.assign(console, real);
  }
}

/** Stub toncenter for the Storm vaults: the block is the one asked for, stacks per address and moment */
function stubStorm(stacks: Record<string, { now: [string, string][]; week: [string, string][] }>) {
  const lookups: number[] = [];
  const fetchStub = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes("lookupBlock")) {
      lookups.push(Number(new URL(url).searchParams.get("unixtime")));
      return Response.json({ ok: true, result: { seqno: 3000 } });
    }
    if (url.includes("getBlockHeader")) return Response.json({ ok: true, result: { gen_utime: lookups.at(-1) } });
    if (url.includes("runGetMethod")) {
      const body = JSON.parse(String(init?.body));
      const stack = stacks[body.address]?.[body.seqno === undefined ? "now" : "week"];
      return Response.json({ ok: true, result: { exit_code: 0, stack } });
    }
    throw new Error(`unexpected request in test: ${url}`);
  }) as typeof fetch;
  return { fetchStub, lookups };
}

Deno.test({
  name: "computeStormApys reads the vaults 7 days back and takes the free balance as TVL",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    assertEquals(STORM_WINDOW_SECONDS, 7 * 86_400);
    const specs: StormVaultSpec[] = [
      { ...vault("GRAM"), address: "GROWS" },
      { ...vault("USDT"), address: "FALLS" },
      { ...vault("USDT"), asset: "jUSDT", address: "BADLAYOUT" },
    ];
    const { fetchStub, lookups } = stubStorm({
      GROWS: { now: vaultStack(1_000_000n, 1_315_000n, 150_000n), week: vaultStack(1_000_000n, 1_313_500n, 90_000n) },
      FALLS: { now: vaultStack(1_000_000n, 1_343_900n, 200_000n), week: vaultStack(1_000_000n, 1_344_000n, 200_000n) },
      BADLAYOUT: { now: filler(12), week: filler(12) },
    });
    const started = Date.now() / 1000;
    const { result } = await quietly(() => withStub(fetchStub, () => computeStormApys(specs)));
    assertEquals(lookups.length, 1);
    assert(Math.abs(lookups[0] - (started - 7 * 86_400)) < 5, "the block 7 days back"); // not a cycle or 30 days
    assertEquals(result.map((r) => r.spec.address), ["GROWS", "FALLS"]);
    const [grows, falls] = result;
    assertAlmostEquals(grows.apy, (Math.pow(1_315_000 / 1_313_500, YEAR / (7 * 86_400)) - 1) * 100, 0.01);
    assertAlmostEquals(grows.assets, 1_315_000 / 1e9, 1e-12); // the free balance now, without the locked part
    assert(falls.apy < 0 && falls.apy > -1);
  },
});

/**
 * Stub toncenter and the price APIs for a whole engine run: every LST and
 * Storm vault answers; the LST blocks are a cycle and 5 cycles old, the Storm
 * block 7 days. `failLookups` refuses the LST or the Storm block lookups,
 * `stormDelayMs` slows every Storm get-method answer, `price: null` makes
 * both price APIs fail.
 */
function stubEngine(
  opts: { failLookups?: "lst" | "storm"; stormDelayMs?: number; price?: number | null; sent?: number[] } = {},
) {
  const nowSec = Date.now() / 1000;
  const blocks = [
    { seqno: 2000, time: Math.floor(nowSec - CYCLE_SECONDS), part: "lst" },
    { seqno: 1000, time: Math.floor(nowSec - WINDOW_SECONDS), part: "lst" },
    { seqno: 3000, time: Math.floor(nowSec - STORM_WINDOW_SECONDS), part: "storm" },
  ];
  const supply = 1_000_000_000_000n;
  const lstCoins: Record<string, bigint> = { now: 1_002_500_000_000n, "2000": 1_002_000_000_000n, "1000": 1_000_000_000_000n };
  const lstStack = (spec: LstSpec, coins: bigint) =>
    spec.method === "get_treasury_state"
      ? hipoStack(coins, supply)
      : spec.method === "get_full_data"
      ? bemoStack(supply, coins)
      : spec.method === "get_pool_status"
      ? whalesStack(supply, coins)
      : poolStack(spec.source === "KTON" ? 34 : 30, coins, supply);
  const vaultStacks: Record<string, Record<"now" | "week", [string, string][]>> = {
    [vault("GRAM").address]: {
      now: vaultStack(594_771_652_348_395n, 781_947_129_711_359n, 153_152_670_335_584n),
      week: vaultStack(594_771_652_348_395n, 781_247_129_711_359n, 150_000_000_000_000n),
    },
    [vault("USDT").address]: {
      now: vaultStack(1_591_171_886_417_926n, 2_138_609_397_926_078n, 208_890_532_663_846n),
      week: vaultStack(1_591_171_886_417_926n, 2_138_119_397_926_078n, 200_000_000_000_000n),
    },
  };
  const ok = (result: unknown) => Response.json({ ok: true, result });
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes("toncenter.com")) opts.sent?.push(Date.now());
    if (url.startsWith("https://coins.llama.fi") || url.startsWith("https://api.coingecko.com")) {
      if (opts.price === null) return new Response("down", { status: 503 });
      const price = opts.price ?? 0.99;
      return url.startsWith("https://coins.llama.fi")
        ? Response.json({ coins: { "coingecko:the-open-network": { price } } })
        : Response.json({ "the-open-network": { usd: price } });
    }
    if (url.includes("lookupBlock")) {
      const unixtime = Number(new URL(url).searchParams.get("unixtime"));
      const block = blocks.reduce((a, b) => (Math.abs(b.time - unixtime) < Math.abs(a.time - unixtime) ? b : a));
      if (opts.failLookups === block.part) {
        return Response.json({ ok: false, error: "lookup refused in test", code: 400 }, { status: 400 });
      }
      return ok({ seqno: block.seqno });
    }
    if (url.includes("getBlockHeader")) {
      const seqno = Number(new URL(url).searchParams.get("seqno"));
      return ok({ gen_utime: blocks.find((b) => b.seqno === seqno)!.time });
    }
    if (url.includes("runGetMethod")) {
      const body = JSON.parse(String(init?.body));
      if (vaultStacks[body.address]) {
        if (opts.stormDelayMs) await sleep(opts.stormDelayMs);
        return ok({ exit_code: 0, stack: vaultStacks[body.address][body.seqno === undefined ? "now" : "week"] });
      }
      const spec = LSTS.find((l) => l.address === body.address)!;
      return ok({ exit_code: 0, stack: lstStack(spec, lstCoins[body.seqno === undefined ? "now" : String(body.seqno)]) });
    }
    throw new Error(`unexpected request in test: ${url}`);
  }) as typeof fetch;
}

const storm = (rows: YieldOpportunity[], asset: string) => rows.find((y) => y.source === "Storm Trade" && y.asset === asset)!;

Deno.test({
  name: "fetchOnchainYields builds the LST and Storm rows with their TVL, class and flags",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const { result } = await quietly(() => withStub(stubEngine(), () => fetchOnchainYields()));
    assertEquals(result.length, LSTS.length + STORM_VAULTS.length);
    const gram = storm(result, "GRAM");
    const usdt = storm(result, "USDT");
    assertEquals([gram.assetType, gram.poolMeta, usdt.assetType, usdt.poolMeta], ["TON", "TON-SLP", "STABLE", null]);
    assertAlmostEquals(gram.tvlUsd, (781_947_129_711_359 / 1e9) * 0.99, 1e-6); // free balance x GRAM price
    assertAlmostEquals(usdt.tvlUsd, 2_138_609_397_926_078 / 1e9, 1e-6); // free balance x $1
    for (const y of [gram, usdt]) {
      assertEquals([y.onChain, y.apy7d, y.tvlHidden], [true, undefined, undefined]);
      assertEquals(y.poolAddress, vault(y.asset).address);
      assert(y.apyTotal > 0 && y.apyTotal < 10);
    }
    assert(result.filter((y) => y.source !== "Storm Trade").every((y) => y.onChain && y.tvlUsd > 0));
  },
});

Deno.test({
  name: "without a GRAM price the GRAM rows show no TVL, the USDT vault still does",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const { result } = await quietly(() => withStub(stubEngine({ price: null }), () => fetchOnchainYields()));
    assertEquals([storm(result, "GRAM").tvlHidden, storm(result, "GRAM").tvlUsd], [true, 0]);
    assertEquals(storm(result, "USDT").tvlHidden, undefined);
    assert(storm(result, "USDT").tvlUsd > 2_000_000);
    assert(result.filter((y) => y.source !== "Storm Trade").every((y) => y.tvlHidden));
  },
});

Deno.test({
  name: "the LST and the Storm reads fail on their own",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const noLst = await quietly(() => withStub(stubEngine({ failLookups: "lst" }), () => fetchOnchainYields()));
    assertEquals(noLst.result.map((y) => `${y.source} ${y.asset}`), ["Storm Trade GRAM", "Storm Trade USDT"]);
    const noStorm = await quietly(() => withStub(stubEngine({ failLookups: "storm" }), () => fetchOnchainYields()));
    assertEquals(noStorm.result.length, LSTS.length);
    assert(noStorm.result.every((y) => y.source !== "Storm Trade"));
  },
});

Deno.test({
  name: "a Storm read that runs out of time keeps the LST rows already read",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const sent: number[] = [];
    await withStub(stubEngine({ stormDelayMs: 3_000, sent }), async () => {
      const start = Date.now();
      const { result, lines } = await quietly(() => fetchOnchainYields(5_000));
      assertEquals(result.length, LSTS.length);
      assert(result.every((y) => y.source !== "Storm Trade"));
      assert(lines.some((l) => l.includes("kept the LSTs")));
      await sleep(3_500);
      // The abandoned Storm reads stop at their next call: nothing is sent after the limit
      assertEquals(sent.filter((t) => t > start + 5_100).length, 0);
    });
  },
});

Deno.test("Storm on-chain rows replace their Swap.coffee rows and stand in when Swap.coffee has none", () => {
  const row = (fields: Partial<YieldOpportunity>) => ({ asset: "USDT", apyTotal: 0, tvlUsd: 0, ...fields } as YieldOpportunity);
  const stable = [
    row({ source: "Storm Trade", asset: "USDT", poolMeta: null, apyTotal: 4.03 }),
    row({ source: "Storm Trade", asset: "jUSDT", poolMeta: null, apyTotal: 0.5 }), // another vault, no on-chain row
    row({ source: "EVAA", asset: "USDT", poolMeta: "Main", apyTotal: 1.9 }),
  ];
  const onchainStable = [row({ source: "Storm Trade", asset: "USDT", poolMeta: null, apyTotal: 1.18, onChain: true })];
  assertEquals(
    preferOnchain(stable, onchainStable).map((y) => `${y.source} ${y.asset} ${y.apyTotal}`),
    ["Storm Trade jUSDT 0.5", "EVAA USDT 1.9", "Storm Trade USDT 1.18"],
  );
  // The GRAM vault matches a fallback row labelled with either generation of the SLP ticker
  const gramVault = row({ source: "Storm Trade", asset: "GRAM", poolMeta: "TON-SLP", apyTotal: 4.81, onChain: true });
  const renamed = row({ source: "Storm Trade", asset: "GRAM", poolMeta: "GRAM-SLP", apyTotal: 8.77 });
  assertEquals(preferOnchain([renamed], [gramVault]).map((y) => y.apyTotal), [4.81]);
  // Swap.coffee left Storm out: the on-chain rows are added
  assertEquals(preferOnchain([], [gramVault]).map((y) => y.apyTotal), [4.81]);
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

import { assert, assertEquals, assertRejects } from "std/assert/mod.ts";
import type { Bot } from "grammy";
import type { GroupedYields, YieldOpportunity } from "./types/yields.ts";
import { type PostDeps, postDailyYields } from "./scheduler.ts";

const row = (fields: Partial<YieldOpportunity>): YieldOpportunity => ({
  assetType: "TON",
  source: "Hipo",
  sourceUrl: "",
  asset: "GRAM-hGRAM",
  poolMeta: "hGRAM",
  apyBase: 17,
  apyReward: null,
  apyTotal: 17,
  tvlUsd: 8_800_000,
  ...fields,
});

const yields = (rows: YieldOpportunity[]): GroupedYields => ({ TON: rows, STABLE: [], BTC: [], ETH: [], TON_USDT: [] });

/** Fake outside world: records what a run did; the KV marker lives in `posted` */
function world(overrides: Partial<PostDeps> = {}) {
  const calls: string[] = [];
  const posted = new Set<string>();
  const deps: Partial<PostDeps> = {
    fetchYields: () => {
      calls.push("fetch");
      return Promise.resolve(yields([row({})]));
    },
    format: () => Promise.resolve("<b>TON Yields Daily</b>"),
    send: (message) => {
      calls.push(`send ${message}`);
      return Promise.resolve();
    },
    wasPostedOn: (channel, date) => Promise.resolve(posted.has(`${channel}|${date}`)),
    markPosted: (channel, date) => {
      posted.add(`${channel}|${date}`);
      calls.push("mark");
      return Promise.resolve();
    },
    ping: (kind, message) => {
      calls.push(`ping ${kind}${message ? `: ${message}` : ""}`);
      return Promise.resolve();
    },
    channel: "@ton_yields_daily",
    today: "2026-11-24",
    secret: "123456:SECRET-TOKEN",
    ...overrides,
  };
  return { deps, calls, posted };
}

const bot = {} as Bot; // never touched: every outside call is faked

/** Run `fn` with console output captured instead of printed */
async function quietly<T>(fn: () => Promise<T>): Promise<{ result: T; lines: string[] }> {
  const lines: string[] = [];
  const real = { log: console.log, warn: console.warn, error: console.error };
  const keep = (...args: unknown[]) => void lines.push(args.map(String).join(" "));
  Object.assign(console, { log: keep, warn: keep, error: keep });
  try {
    return { result: await fn(), lines };
  } finally {
    Object.assign(console, real);
  }
}

Deno.test("the first run of the day posts, records it, and tells the watchdog after Telegram accepted it", async () => {
  const { deps, calls } = world();
  const { result } = await quietly(() => postDailyYields(bot, {}, deps));
  assertEquals(result, "posted");
  assertEquals(calls, ["ping start", "fetch", "send <b>TON Yields Daily</b>", "mark", "ping success: Posted 1 opportunities"]);
});

Deno.test("a later run the same day does nothing and still reports success", async () => {
  const { deps, calls, posted } = world();
  posted.add("@ton_yields_daily|2026-11-24");
  const { result } = await quietly(() => postDailyYields(bot, {}, deps));
  assertEquals(result, "skipped");
  assertEquals(calls, ["ping start", "ping success: Already posted today; this run did nothing"]);
});

Deno.test("force posts again even after today's post", async () => {
  const { deps, calls, posted } = world();
  posted.add("@ton_yields_daily|2026-11-24");
  const { result } = await quietly(() => postDailyYields(bot, { force: true }, deps));
  assertEquals(result, "posted");
  assert(calls.includes("send <b>TON Yields Daily</b>"));
});

Deno.test("a failed send is not recorded, reports the reason without the bot token, and fails the run", async () => {
  const { deps, calls, posted } = world({
    send: () => Promise.reject(new Error("Call to 'sendMessage' failed! token 123456:SECRET-TOKEN")),
  });
  await quietly(() => assertRejects(() => postDailyYields(bot, {}, deps), Error, "sendMessage"));
  assertEquals(posted.size, 0); // the 08:30 retry may post
  const fail = calls.find((c) => c.startsWith("ping fail"))!;
  assert(fail.includes("***") && !fail.includes("SECRET-TOKEN"), fail);
  assert(!calls.some((c) => c.startsWith("ping success")));
});

Deno.test("no yields at all is a failure, not a silent skip", async () => {
  const { deps, calls } = world({ fetchYields: () => Promise.resolve(yields([])) });
  await quietly(() => assertRejects(() => postDailyYields(bot, {}, deps), Error, "No yields found"));
  assert(calls.some((c) => c.startsWith("ping fail: The daily post failed: No yields found")));
  assert(!calls.some((c) => c.startsWith("send")));
});

Deno.test("an unreadable marker lets the run post; a marker that cannot be written does not fail it", async () => {
  const unreadable = world({ wasPostedOn: () => Promise.reject(new Error("database is locked")) });
  const first = await quietly(() => postDailyYields(bot, {}, unreadable.deps));
  assertEquals(first.result, "posted");
  assert(first.lines.some((l) => l.includes("Could not check whether today's post already went out")));

  const unwritable = world({ markPosted: () => Promise.reject(new Error("disk full")) });
  const second = await quietly(() => postDailyYields(bot, {}, unwritable.deps));
  assertEquals(second.result, "posted");
  assert(unwritable.calls.includes("ping success: Posted 1 opportunities"));
  assert(second.lines.some((l) => l.includes("Could not record today's post")));
});

import { assert, assertEquals, assertRejects } from "std/assert/mod.ts";
import type { Bot } from "grammy";
import type { GroupedYields, YieldOpportunity } from "./types/yields.ts";
import type { Digest } from "./formatters/digest.ts";
import type { DigestData } from "./formatters/message.ts";
import type { PostSnapshot } from "./services/post_snapshot.ts";
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

const digest = (date: string): Digest => ({
  html: "<b>TON Yields Daily</b>",
  richHtml: "<h3>TON Yields Daily</h3>",
  snapshot: { date, rows: [] },
  since: null,
  data: {} as DigestData,
});

/** Fake outside world: records what a run did; the KV marker lives in `posted` */
function world(overrides: Partial<PostDeps> = {}) {
  const calls: string[] = [];
  const posted = new Set<string>();
  const deps: Partial<PostDeps> = {
    fetchYields: () => {
      calls.push("fetch");
      return Promise.resolve(yields([row({})]));
    },
    loadPrevious: () => Promise.resolve(null),
    format: (_yields, options) => Promise.resolve(digest(options.today)),
    send: (d) => {
      calls.push(`send ${d.html}`);
      return Promise.resolve();
    },
    saveSnapshot: (channel, snapshot) => {
      calls.push(`snapshot ${channel} ${snapshot.date}`);
      return Promise.resolve();
    },
    cardMode: "monday",
    sendCard: (_digest, channel, today) => {
      calls.push(`card ${channel} ${today}`);
      return Promise.resolve(true);
    },
    wasPostedOn: (channel, date, kind = "posted") => Promise.resolve(posted.has(`${kind}|${channel}|${date}`)),
    markPosted: (channel, date, _at, kind = "posted") => {
      posted.add(`${kind}|${channel}|${date}`);
      calls.push(kind === "card" ? "mark card" : "mark");
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
  assertEquals(calls, [
    "ping start",
    "fetch",
    "send <b>TON Yields Daily</b>",
    "mark",
    "snapshot @ton_yields_daily 2026-11-24",
    "ping success: Posted 1 opportunities",
  ]);
});

Deno.test("the channel's previous post reaches the formatter; an unreadable one only drops the block", async () => {
  const previous: PostSnapshot = { date: "2026-11-23", rows: [] };
  let seen: PostSnapshot | null | undefined;
  const asked: string[] = [];
  const { deps } = world({
    loadPrevious: (channel, today) => {
      asked.push(`${channel} ${today}`);
      return Promise.resolve(previous);
    },
    format: (_yields, options) => {
      seen = options.previous;
      return Promise.resolve(digest(options.today));
    },
  });
  await quietly(() => postDailyYields(bot, {}, deps));
  assertEquals(asked, ["@ton_yields_daily 2026-11-24"]);
  assertEquals(seen, previous);

  const broken = world({ loadPrevious: () => Promise.reject(new Error("database is locked")) });
  const run = await quietly(() => postDailyYields(bot, {}, broken.deps));
  assertEquals(run.result, "posted");
  assert(run.lines.some((l) => l.includes("Could not read the previous post")));
});

Deno.test("a snapshot that cannot be saved does not fail the run", async () => {
  const { deps, calls } = world({ saveSnapshot: () => Promise.reject(new Error("disk full")) });
  const run = await quietly(() => postDailyYields(bot, {}, deps));
  assertEquals(run.result, "posted");
  assert(calls.includes("mark"));
  assert(run.lines.some((l) => l.includes("Could not save what today's post showed")));
});

Deno.test("a later run the same day does nothing and still reports success", async () => {
  const { deps, calls, posted } = world();
  posted.add("posted|@ton_yields_daily|2026-11-24");
  const { result } = await quietly(() => postDailyYields(bot, {}, deps));
  assertEquals(result, "skipped");
  assertEquals(calls, ["ping start", "ping success: Already posted today; this run did nothing"]);
});

Deno.test("force posts again even after today's post", async () => {
  const { deps, calls, posted } = world();
  posted.add("posted|@ton_yields_daily|2026-11-24");
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
  assert(!calls.some((c) => c.startsWith("snapshot")), "a failed post must not become tomorrow's comparison point");
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

Deno.test("the weekly card follows Monday's post, once per day; other days have none", async () => {
  const monday = world({ today: "2026-11-30" });
  await quietly(() => postDailyYields(bot, {}, monday.deps));
  assertEquals(monday.calls.slice(2), [
    "send <b>TON Yields Daily</b>",
    "mark",
    "snapshot @ton_yields_daily 2026-11-30",
    "card @ton_yields_daily 2026-11-30",
    "mark card",
    "ping success: Posted 1 opportunities",
  ]);
  // A forced repost the same Monday does not send the card again
  await quietly(() => postDailyYields(bot, { force: true }, monday.deps));
  assertEquals(monday.calls.filter((c) => c.startsWith("card")).length, 1);

  const friday = world({ today: "2026-11-27" });
  await quietly(() => postDailyYields(bot, {}, friday.deps));
  assert(!friday.calls.some((c) => c.startsWith("card")));
  const always = world({ today: "2026-11-27", cardMode: "always" });
  await quietly(() => postDailyYields(bot, {}, always.deps));
  assert(always.calls.includes("card @ton_yields_daily 2026-11-27"));
  const off = world({ today: "2026-11-30", cardMode: "off" });
  await quietly(() => postDailyYields(bot, {}, off.deps));
  assert(!off.calls.some((c) => c.startsWith("card")));
});

Deno.test("a failing weekly card never fails the run and is not marked as sent", async () => {
  const { deps, calls, posted } = world({
    today: "2026-11-30",
    sendCard: () => Promise.reject(new Error("Call to 'sendPhoto' failed! token 123456:SECRET-TOKEN")),
  });
  const run = await quietly(() => postDailyYields(bot, {}, deps));
  assertEquals(run.result, "posted");
  assert(!posted.has("card|@ton_yields_daily|2026-11-30"));
  assert(calls.includes("ping success: Posted 1 opportunities"));
  const warning = run.lines.find((l) => l.includes("The weekly card failed"))!;
  assert(warning.includes("***") && !warning.includes("SECRET-TOKEN"), warning);
});

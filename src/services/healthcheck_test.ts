import { assert, assertEquals } from "std/assert/mod.ts";
import { pingHealthcheck } from "./healthcheck.ts";

const URL_BASE = "https://hc-ping.com/00000000-test-ping-url";

interface Sent {
  url: string;
  method: string;
  body: string;
}

/** Run `fn` with HC_PING_URL set to `url` and fetch answered by `answer` */
async function withPings(
  url: string | undefined,
  answer: (attempt: number) => Response | Error,
  fn: () => Promise<void>,
): Promise<{ sent: Sent[]; warnings: string[] }> {
  const sent: Sent[] = [];
  const warnings: string[] = [];
  const realFetch = globalThis.fetch;
  const realWarn = console.warn;
  const previous = Deno.env.get("HC_PING_URL");
  if (url === undefined) Deno.env.delete("HC_PING_URL");
  else Deno.env.set("HC_PING_URL", url);
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(input), method: init?.method ?? "GET", body: String(init?.body ?? "") });
    const reply = answer(sent.length);
    if (reply instanceof Error) throw reply;
    return reply;
  }) as typeof fetch;
  console.warn = (...args: unknown[]) => void warnings.push(args.map(String).join(" "));
  try {
    await fn();
  } finally {
    globalThis.fetch = realFetch;
    console.warn = realWarn;
    if (previous === undefined) Deno.env.delete("HC_PING_URL");
    else Deno.env.set("HC_PING_URL", previous);
  }
  return { sent, warnings };
}

const ok = () => new Response("OK");

Deno.test("without HC_PING_URL nothing is sent", async () => {
  const { sent } = await withPings(undefined, ok, () => pingHealthcheck("fail", "boom"));
  assertEquals(sent, []);
});

Deno.test("start, success and fail go to their own ping URLs with the message", async () => {
  const { sent } = await withPings(`${URL_BASE}/`, ok, async () => {
    await pingHealthcheck("start");
    await pingHealthcheck("success", "Posted 19 opportunities");
    await pingHealthcheck("fail", "x".repeat(5_000));
  });
  assertEquals(sent.map((s) => `${s.method} ${s.url}`), [
    `POST ${URL_BASE}/start`,
    `POST ${URL_BASE}`,
    `POST ${URL_BASE}/fail`,
  ]);
  assertEquals(sent[1].body, "Posted 19 opportunities");
  assertEquals(sent[2].body.length, 1_000); // trimmed
});

Deno.test({
  name: "a watchdog outage never stops the post and never shows the ping URL",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const { sent, warnings } = await withPings(
      URL_BASE,
      (attempt) => (attempt === 1 ? new TypeError("network down") : new Response("down", { status: 503 })),
      () => pingHealthcheck("success"),
    );
    assertEquals(sent.length, 3); // three attempts, then it gives up quietly
    assertEquals(warnings.length, 1);
    assert(!warnings[0].includes("hc-ping.com"), warnings[0]);
  },
});

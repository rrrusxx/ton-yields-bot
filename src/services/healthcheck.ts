/**
 * Signals for the healthchecks.io watchdog (see HOSTING.md). HC_PING_URL is
 * the check's ping URL, kept as a GitHub secret; without it nothing is sent.
 * The watchdog alerts in Telegram when a run reports a failure, and when no
 * success arrives by the expected time, whatever the reason: the scheduler,
 * GitHub or the bot itself.
 *
 * The URL is a secret (anyone who has it can report a fake success), so it
 * never goes into the log. A ping never throws: a watchdog outage must not
 * stop the post.
 */

export type PingKind = "start" | "success" | "fail";

const ATTEMPTS = 3;
/** healthchecks.io keeps up to 100 KB of a ping body; the alert needs far less */
const MAX_BODY = 1_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function pingHealthcheck(kind: PingKind, message = ""): Promise<void> {
  const base = Deno.env.get("HC_PING_URL")?.trim().replace(/\/+$/, "");
  if (!base) return;
  const url = kind === "success" ? base : `${base}/${kind}`;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        body: message.slice(0, MAX_BODY),
        signal: AbortSignal.timeout(10_000),
      });
      await response.body?.cancel();
      if (response.ok) return;
    } catch {
      // network error or timeout: try again
    }
    if (attempt < ATTEMPTS) await sleep(1_000 * attempt);
  }
  console.warn(`Watchdog ${kind} signal could not be sent after ${ATTEMPTS} attempts`);
}

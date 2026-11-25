# Hosting

The bot runs on GitHub Actions. GitHub's own schedule starts runs hours late (the median delay after 08:00 UTC was 7 h 51 min in November 2026, and on 2026-05-23 and 05-26 no run started at all), so since v1.6.0 an outside scheduler starts the post at 08:00 UTC, and a watchdog alerts in Telegram when a post does not go out.

## How a day goes

| Time (UTC) | What happens |
|---|---|
| 08:00 | cron-job.org calls GitHub's `workflow_dispatch` API for `daily-post.yml`. The run starts within seconds and usually posts within a minute or two (DefiLlama is given up to 90 s per request, since its cache can be slow). After Telegram accepts the message, the bot records the day in its KV store and sends "success" to the watchdog. |
| 08:30 | cron-job.org calls again, as a retry. If the post already went out, the run finds the day's marker and stops ("success" again, nothing posted). If it did not, this run posts. |
| 08:45 | If the watchdog has had no success since 08:00 (or got a "fail" signal at any time), healthchecks.io sends an alert to Telegram. |
| hours later | `daily-post-fallback.yml`, on GitHub's own late schedule, starts `daily-post.yml` once more. It stops at once if the day's post is out; if both outside calls failed, it posts, late but the same day. |

- **Once a day.** The marker is kept per channel and per UTC date (`src/services/post_guard.ts`), so retries and late runs normally stop, and test posts never block the real one. A manual run with `force` ignores it. A second post can still happen in rare cases: GitHub's cache fails to save or restore the KV store, the marker cannot be read (the bot then posts rather than miss a day), or the day of the switch to v1.6.0 (see below).
- **One run at a time.** `daily-post.yml` has a concurrency group per channel; a run that comes while another is busy waits, then finds the marker.
- **No schedule in the main workflow.** GitHub disables the scheduled workflows of a public repository after 60 days without activity, and a disabled workflow also refuses `workflow_dispatch`. The schedule therefore lives only in the fallback file; if GitHub disables it, only the fallback stops.
- **Watchdog signals** (`src/services/healthcheck.ts`): "start" when a run begins, "success" only after Telegram accepted the post (or when the day's post was already out), "fail" with the reason (the bot token is masked). Test runs send none.

## One-time setup

Everything below is done by the owner; tokens and ping URLs are typed by him only and never go into the repo, issues or chats.

### 1. GitHub token for the scheduler

GitHub > Settings > Developer settings > Personal access tokens > Fine-grained tokens > Generate new token:

- Name: `ton-yields dispatch`; Resource owner: your account.
- Expiration: 366 days, with a calendar reminder to make a new one (when it expires, the 08:00 post stops; the fallback and the watchdog still work). The token lives at a third party, so an expiry date is safer than "No expiration".
- Repository access: Only select repositories > `ton-yields-bot`.
- Permissions: Repository permissions > Actions > Read and write. Nothing else (Metadata read-only comes along).

Anyone with this token can start production runs at will, including forced reposts to @ton_yields_daily, re-run or cancel runs, switch the workflows off and delete the caches (the 7-day history and the day's marker). It cannot read secrets or change code. If it leaks, delete it under Developer settings > Fine-grained tokens and make a new one.

### 2. cron-job.org

Create a free account (turn on two-factor authentication), then two cron jobs with the same settings except the time:

| Field | Value |
|---|---|
| Title | `TON Yields 08:00` (and `TON Yields 08:30`) |
| URL | `https://api.github.com/repos/rrrusxx/ton-yields-bot/actions/workflows/daily-post.yml/dispatches` |
| Schedule | every day at 08:00 (and 08:30); set the job's time zone to UTC (in cron-job.org it is on the job's Advanced tab, and a new job starts in the account's time zone) |
| Request method | POST |
| Headers | `Accept: application/vnd.github+json`, `Authorization: Bearer <the token from step 1>`, `Content-Type: application/json` (no API version header: a pinned version is retired after a few years and then answers 410) |
| Request body | `{"ref":"main"}` |
| Notifications | on failure, and when the job is disabled |

GitHub answers a correct call with HTTP 204 (no content; 200 with the run's id is fine too). The job's "Test run" starts a real production run within seconds: if the day's post is not out yet, it posts it (later runs that day then stop); if it is out, the run stops at once. On the day of the switch to v1.6.0, do not press it (see below).

### 3. healthchecks.io watchdog

Create a free account (sign-in by email link), then a check:

- Name: `TON Yields daily post`.
- Schedule: Cron `0 8 * * *`, time zone UTC.
- Grace time: 45 minutes once step 2 is live (12 hours before that, while posts still start late).
- Integrations: open https://t.me/HealthchecksBot, send `/start`, follow the link and connect the check's project; keep the email integration as a backup and press "Test" once.

Copy the check's ping URL and store it as a repository secret (paste it at the prompt):

```bash
gh secret set HC_PING_URL --repo rrrusxx/ton-yields-bot
```

A check that has never received a ping never alerts; the first post after the secret is set activates it.

### 4. Optional: test runs on GitHub

To run the whole chain against the test channel, store the test pair (paste each value at its prompt):

```bash
gh secret set TEST_TELEGRAM_BOT_TOKEN --repo rrrusxx/ton-yields-bot
```

```bash
gh secret set TEST_TELEGRAM_CHANNEL_ID --repo rrrusxx/ton-yields-bot
```

### Switching over to v1.6.0 (once)

1. Push v1.6.0 only after the day's post from the old version is out. The push removes the schedule from `daily-post.yml`; a day whose late scheduled run had not started yet would get no post, and the fallback's first run is the next day.
2. The old version leaves no "posted" marker. On the day of the push, start no production run: no cron-job.org "Test run", no manual run. A run that day would post a second time.
3. Create the token, the cron-job.org jobs and the watchdog the same day if you like; the jobs first fire at 08:00 UTC the next day. Press "Test run" on a later day if you want to see it work.
4. The next morning check that the post came at about 08:00 UTC, then shorten the watchdog's grace time to 45 minutes.

## Manual runs

- Actions tab > "Daily Yields Post" > Run workflow. `target`: production or test; `force`: post even if today's post is out. Use "Run workflow" for a new run rather than "Re-run" on an old one: a re-run uses the old run's code.
- From a terminal: `gh workflow run daily-post.yml --repo rrrusxx/ton-yields-bot -f target=test`.

A production run posts to @ton_yields_daily; start one by hand only when a post is really missing.

## When an alert comes

1. Check the channel: is today's post there?
2. Actions tab: did a run start at 08:00 and 08:30, and what does its log say? A "fail" alert carries the reason.
3. cron-job.org: the job's history shows GitHub's answer (204 or 200 is fine; 401 or 403 means the token expired or lost its permission; 404 means the URL or the workflow file name changed; 410 means a retired API version was requested).
4. If nothing posted, start a production run by hand (it posts only if the day's post is missing).

## Considered and not used (November 2026)

- **Supabase** (Edge Function + Cron + Postgres): fits the limits, but needs a rewrite (Deno KV is not available there), free projects are paused after a week of low activity, and a paused project cannot alert.
- **Deno Deploy**: shuts down in April 2027 (Deno joined Cloudflare); Val Town shuts down on 2027-01-10.
- **Cloudflare Workers Free** (10 ms of CPU per cron run), Google Cloud and AWS (a payment card), Vercel Hobby (fires anywhere within the hour).

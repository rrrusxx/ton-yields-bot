# Hosting

The bot runs on GitHub Actions. GitHub's own schedule starts runs hours late (the median delay after 08:00 UTC was 7 h 51 min in November 2026, and on 2026-05-23 and 05-26 no run started at all), so since v1.6.0 an outside scheduler starts the post at 08:00 UTC, and a watchdog alerts in Telegram when a post does not go out.

## Current setup (2026-11-25)

| Part | State |
|---|---|
| cron-job.org job at 08:00 UTC | Live since 2026-11-25; the first scheduled run is 2026-11-26. Its test run that day got 204 from GitHub and started a run that stopped on the day's marker. |
| GitHub token in that job | Fine-grained, Actions read and write on this repository only. Expires 2027-11-24 17:00 UTC (GitHub sends the date in the `github-authentication-token-expiration` response header). Before then, make a new one (step 1) and paste it into the job's `Authorization` header. |
| cron-job.org job at 08:30 UTC (retry) | Not set up (owner's choice of 2026-11-25). A missed 08:00 call is then caught by the fallback, usually hours later the same day. |
| healthchecks.io watchdog (`HC_PING_URL`) | Not set up (owner's choice of 2026-11-25); without the secret the bot sends no signals and no alert comes. |
| GitHub's fallback schedule | Active (`daily-post-fallback.yml`). |
| Repository variable `POST_FORMAT` | `rich` since 2026-11-27 (owner's decision): the public channel gets the rich message from the post of 2026-11-28. `gh variable delete POST_FORMAT --repo rrrusxx/ton-yields-bot` goes back to the classic post. |

## How a day goes

| Time (UTC) | What happens |
|---|---|
| 08:00 | cron-job.org calls GitHub's `workflow_dispatch` API for `daily-post.yml`. The run starts within seconds and usually posts within a minute or two (DefiLlama is given up to 90 s per request, since its cache can be slow). After Telegram accepts the message, the bot records the day in its KV store and sends "success" to the watchdog. |
| 08:30 | If the retry job is set up, cron-job.org calls again. If the post already went out, the run finds the day's marker and stops ("success" again, nothing posted). If it did not, this run posts. |
| 08:45 | If the watchdog is set up and has had no success since 08:00 (or got a "fail" signal at any time), healthchecks.io sends an alert to Telegram. |
| hours later | `daily-post-fallback.yml`, on GitHub's own late schedule, starts `daily-post.yml` once more. It stops at once if the day's post is out; if both outside calls failed, it posts, late but the same day. |

- **Once a day.** The marker is kept per channel and per UTC date (`src/services/post_guard.ts`), so retries and late runs normally stop, and test posts never block the real one. A manual run with `force` ignores it. A second post can still happen in rare cases: GitHub's cache fails to save or restore the KV store, the marker cannot be read (the bot then posts rather than miss a day), or the day of the switch to v1.6.0 (see below).
- **One run at a time.** `daily-post.yml` has a concurrency group per channel; a run that comes while another is busy waits, then finds the marker.
- **No schedule in the main workflow.** GitHub disables the scheduled workflows of a public repository after 60 days without activity, and a disabled workflow also refuses `workflow_dispatch`. The schedule therefore lives only in the fallback file; if GitHub disables it, only the fallback stops.
- **Watchdog signals** (`src/services/healthcheck.ts`): "start" when a run begins, "success" only after Telegram accepted the post (or when the day's post was already out), "fail" with the reason (the bot token is masked). Test runs send none.

## One-time setup

Everything below is done by the owner; tokens and ping URLs are typed by him only and never go into the repo, issues or chats.

### 1. GitHub token for the scheduler

Open https://github.com/settings/personal-access-tokens/new (the long way: profile picture > Settings > "Developer settings" at the bottom of the left sidebar > Personal access tokens > Fine-grained tokens > Generate new token). GitHub may first ask to confirm access (passkey, security key, GitHub Mobile, an authenticator code or the password; text-message codes are not accepted). Labels below were checked on 2026-11-25.

- Token name: `ton-yields dispatch`. Resource owner: your account (the default).
- Expiration: "Custom", a date up to one year ahead (the menu offers 7, 30, 60 and 90 days, Custom and No expiration; a custom date more than a year away makes "Generate token" silently do nothing). Set a calendar reminder a week before it. When the token expires, every cron-job.org call gets 401 and the post comes only from the late fallback. The token lives at a third party, so an expiry date is safer than "No expiration".
- Repository access: "Only select repositories", then pick `ton-yields-bot` in the repository list that appears under it.
- Permissions (a picker since 2025-08-26): on the repository tab click "Add permissions", search for "Actions" and select it, then change its access from "Read-only" (the default) to "Read and write". Do not take "Workflows" instead: it cannot start runs. Nothing else; "Metadata" (read-only) comes along.
- Click "Generate token" (and again in the confirmation, if one appears), then copy the token, which starts with `github_pat_` and is shown only once, straight into cron-job.org.

To renew, https://github.com/settings/personal-access-tokens/new?name=ton-yields+dispatch&expires_in=366&actions=write pre-fills the name, 366 days and Actions read and write. The repository still has to be picked; check the resource owner and the Actions row before "Generate token". Then replace the token in the job's `Authorization` header (Advanced tab, "Save") and delete the old token. GitHub also revokes a fine-grained token that goes unused for a year or is pushed to a public repository or gist.

Anyone with this token can start production runs at will, including forced reposts to @ton_yields_daily, re-run, cancel or delete runs, switch the workflows off and delete the caches (the 7-day history and the day's marker). It cannot read secrets or change code. If it leaks, delete it ("Delete" next to it under Fine-grained tokens) and make a new one.

### 2. cron-job.org

Create a free account at https://console.cron-job.org/signup (`?lng=en` gives English labels) and confirm it through the emailed link before signing in. Recommended: Settings > "Multi-Factor Authentication devices" > "Add device" (no backup codes are issued), and Settings > "Default timezone" > UTC (it applies to new jobs only).

Then "Cronjobs" > "Create cronjob". The editor has three tabs, and leaving it before "Create" loses everything typed, without a warning. Labels below were checked on 2026-11-25.

| Tab | Field | Value |
|---|---|---|
| Common | Title | `TON Yields 08:00` (and `TON Yields 08:30` for the optional retry job) |
| Common | URL | `https://api.github.com/repos/rrrusxx/ton-yields-bot/actions/workflows/daily-post.yml/dispatches` (in place of the pre-filled `http://`) |
| Common | Enable job; Save responses in job history | on; on (the second is off by default, and without it the history shows only the status code) |
| Common | Execution schedule | "Every day at" 8 : 00 (and 8 : 30) |
| Notifications | execution of the cronjob fails | on (off by default); keep "the cronjob will be disabled because of too many failures" on (the default) |
| Advanced | Headers | "Add" once per header, the name in "Key" and the value in "Value": `Accept` = `application/vnd.github+json`, `Authorization` = `Bearer <the token from step 1>`, `Content-Type` = `application/json`. A row with an empty Key or Value is dropped silently. |
| Advanced | Time zone | UTC, the last entry (a new job starts in the account's time zone). On Common, "Next executions" should then note "In this job's individual timezone (UTC)." |
| Advanced | Request method | POST (the default is GET; the body is editable only after this) |
| Advanced | Request body | `{"ref":"main"}` |

Then "Create". For the retry job, open the first job with "Edit" > "Actions" > "Clone": the copy starts disabled; change its title and minute, switch "Enable job" on and "Save".

No `X-GitHub-Api-Version` header: without it GitHub uses its default version, 2022-11-28, supported until 2028-03-10 (its answers carry `Deprecation` and `Sunset` headers since version 2026-03-10 came out), and after that a newer supported one, where this call answers 200 with the run's details instead of 204. A pinned version would get 410 Gone once its support ends. (GitHub's sample cURL command pins 2026-03-10: delete that header if you use "Import from cURL".)

GitHub answers a correct call with HTTP 204 (no content; 200 with the run's details is fine too, and cron-job.org counts any 2xx as success). "Test run" (at the bottom of the editor) sends a real request with the current settings, saved or not, and is not recorded in the history. It starts a real production run within seconds: if the day's post is not out yet, it posts it (later runs that day then stop); if it is out, the run stops at once. On the day of the switch to v1.6.0, do not press it (see below).

A failing job sends one email per run of failures (with the Notifications switch on), and after more than 25 failures in a row it is disabled ("Inactive") until switched on again by hand. cron-job.org has no rule that disables jobs or accounts for inactivity.

### 3. healthchecks.io watchdog

Create a free account at https://healthchecks.io ("Sign Up" > "Email Me a Link"; the link is valid for 1 hour). Sign-up adds a sample check "My First Check" and an email integration; remove the sample ("Danger Zone" > "Remove") or leave it, it never alerts. Labels below were checked on 2026-11-25.

- "Add Check": Name `TON Yields daily post`; Schedule "Cron"; Cron Expression `0 8 * * *` (in place of `* * * * *`); Time Zone UTC (the default); Grace Time 45 "minutes" once step 2 is live (12 "hours" before that, while posts still start late); "Save". Later changes: the check's page > "Change Schedule…"; its "Expected Ping Dates" should list 08:00 each day.
- Telegram: in Telegram (Desktop is easiest) open https://t.me/HealthchecksBot and send `/start`. Within 10 minutes open the link it replies with, in a browser logged in to healthchecks.io, choose the project and click "Connect Telegram". The integration is switched on for every check. On "Integrations", press "Test!" in the Telegram row: a message about a dummy check "TEST" being down should arrive. Keep the email integration as a backup.
- Optional: on the check's page, "Filtering Rules…" > "Only POST" > "Save". The bot always POSTs, so link previews of the URL can no longer mark the check up.
- Log in at least once a year: an account without log-ins for over a year is deleted after a 30-day notice, and pings do not count.

Copy the ping URL (the check's page, under "How To Ping") and store it as a repository secret, the base URL only (the bot adds `/start` and `/fail`); paste it at the prompt:

```bash
gh secret set HC_PING_URL --repo rrrusxx/ton-yields-bot
```

How it behaves: a check that has never received a ping has no deadline and never alerts on schedule; the first success turns it up, without a message. From then on it alerts once per down event: no success by 08:45 UTC, a "fail" signal (at once), or a "start" with no success or fail within the grace time (a run killed half-way, even on a day whose post is out); a recovery sends "is now UP". hc-ping.com answers even a mistyped URL with HTTP 200, so after the first production run check the check's "Events" for "Started" and "OK" rows; "This check has never received a ping." means no ping arrived (a wrong secret, no run, or only test runs, which send none).

### 4. Optional: test runs on GitHub

To run the whole chain against the test channel, store the test pair (paste each value at its prompt):

```bash
gh secret set TEST_TELEGRAM_BOT_TOKEN --repo rrrusxx/ton-yields-bot
```

```bash
gh secret set TEST_TELEGRAM_CHANNEL_ID --repo rrrusxx/ton-yields-bot
```

### 5. Optional: post format and weekly card (since v1.8.0)

Two repository variables (not secrets) change what the run sends; without them it sends the classic post and the Monday card. Production reads `POST_FORMAT` and `WEEKLY_CARD`; a test run reads `TEST_POST_FORMAT` and `TEST_WEEKLY_CARD`, so a test never changes the real channel.

Stop the Monday card:

```bash
gh variable set WEEKLY_CARD --body off --repo rrrusxx/ton-yields-bot
```

Send the rich message in test runs only:

```bash
gh variable set TEST_POST_FORMAT --body rich --repo rrrusxx/ton-yields-bot
```

Go back to the defaults:

```bash
gh variable delete WEEKLY_CARD --repo rrrusxx/ton-yields-bot
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
2. Actions tab: did a run start at 08:00 (and 08:30, if that job exists), and what does its log say? A "fail" alert carries the reason.
3. cron-job.org: the job list shows only "Failed (HTTP error)"; its "History" shows GitHub's answer. 204 or 200 is fine; 401 means the token expired, was deleted or is mistyped; 403 or 404 means it lacks access to the repository or the Actions permission, or the URL or the workflow file name changed; 422 means the workflow lost its `workflow_dispatch` trigger or Actions is disabled; 410 means a retired API version was requested.
4. If nothing posted, start a production run by hand (it posts only if the day's post is missing).

## Considered and not used (November 2026)

- **Supabase** (Edge Function + Cron + Postgres): fits the limits, but needs a rewrite (Deno KV is not available there), free projects are paused after a week of low activity, and a paused project cannot alert.
- **Deno Deploy**: shuts down in April 2027 (Deno joined Cloudflare); Val Town shuts down on 2027-01-10.
- **Cloudflare Workers Free** (10 ms of CPU per cron run), Google Cloud and AWS (a payment card), Vercel Hobby (fires anywhere within the hour).

# TON Yields Bot

Daily digest of TON DeFi yields (the TON coin was renamed GRAM in June 2026), posted by `@ton_yields_bot` to the public channel `@ton_yields_daily`. Test pair: `@ton_yields_test_bot` posts to `@ton_yields_test`; the local `.env` holds the test credentials.

## Working rules (from the owner)
- Release flow: change → dry run → post to `@ton_yields_test` → the owner checks it in Telegram → commit only when the owner says so → push only on a separate explicit ask (a push to `main` becomes the next production post). After approval Claude may push and trigger `workflow_dispatch` itself.
- Never post to `@ton_yields_daily` and never commit or push without an explicit ask.
- After every finished task update TODO.md, ROADMAP.md, CHANGELOG.md and the relevant `*_INTEGRATION.md`. Leave no debug or scratch files in the repo.
- Explain root causes in plain words, offer options with a recommendation, give copy-paste commands. Numbers are validated against each protocol's own mini app and DefiLlama.
- Post style he set: grouped by asset, then protocol; links only to protocols (never to DefiLlama); no indexer names in rows; the footer lists the data providers (DefiLlama, Swap.coffee, Palette, GTC; DeDust is not credited there, owner's choice of 2026-11-20); "⛓️ on-chain" appears there only when the post has rows read from contracts (since v1.5.0); APY, not APR; no `~` on exact values; low TVL is flagged with ⚠️, not hidden; only impermanent-loss-free yields in asset sections; GRAM-USDT pools in their own section and never in TOP-5.
- The repo is public: no secrets, partner-confidential or personal details in code, docs or commit messages.

## Commands
- Dry run (builds the post, sends nothing): run a small script from a scratch directory that has **no `.env`**. `src/config.ts` auto-loads `./.env` from the CWD and refills unset variables, so `env -u TELEGRAM_BOT_TOKEN` alone is not enough. Use `deno run --config <repo>/deno.json --no-lock --unstable-kv --allow-net --allow-env --allow-read --allow-write --allow-import script.ts`, import `fetchTonYields` (`src/services/defillama.ts`) and `formatChannelMessage` (`src/formatters/message.ts`) by absolute path, write the HTML to a file, then `Deno.exit(0)`. Never import `src/main.ts` or call `sendToChannel`. KV writes land in `./data/kv.db` of the scratch dir.
- `deno task test-msg` and `deno task post` **send** to the channel in `.env` (the test channel locally). `post` sends the full digest, `test-msg` only a short "Bot is running" message. Use them only for the agreed test-channel step.
- `deno task test`: unit tests (`src/**/*_test.ts`), offline, nothing is sent.
- `deno check --allow-import src/main.ts` passes (grammY 1.21.1 pulls a Skypack module, hence `--allow-import`).
- `deno task start` / `dev` schedule nothing since v1.4.0 (the leftover `Deno.cron` is gone); with a token they only print usage.

## Architecture
- `src/main.ts` (flags `--post-now`, `--test`) → `src/scheduler.ts` → `fetchTonYields()` in `src/services/defillama.ts` (all sources in one `Promise.all`, merge, Palette overrides) → `formatChannelMessage()` in `src/formatters/message.ts` (Telegram HTML, expandable blockquotes, TOP-5, 7d averages, TVL line) → `sendToChannel()` in `src/bot.ts` (grammY).
- `src/services/protocols.ts`: asset families, exact-symbol allowlist `NATIVE_TON_ASSETS` (both ticker generations), `HACKED_PROTOCOLS` (rows flagged "🚨 Hacked", no TVL, never in TOP-5), correlated pairs, memecoin and lookalike exclusions, display names and protocol URLs.
- TOP-5: `isTopYieldEligible` / `getTopYields` in `defillama.ts` (known TVL ≥ `config.top5MinTvlUsd` $10K, 0 < APY ≤ `config.top5MaxApy` 100%, not hacked, one place per protocol and asset class).
- `src/services/prices.ts`: GRAM price in USD (DefiLlama coins, CoinGecko fallback, null on failure; never guess). Rows whose TVL cannot be priced get `tvlHidden`.
- History: Deno KV `./data/kv.db` via `apy_history.ts` (7d average; pool id = `source-asset-poolMeta`, so renames reset it) and `tvl_history.ts` (24h TVL change).
- Production: `.github/workflows/daily-post.yml` (cron `0 8 * * *`, secrets `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_ID`, optional `TONCENTER_API_KEY`). `./data` is carried between runs by `actions/cache`; entries unused for 7 days are evicted.

## Data sources (state on 2026-11-20, v1.5.0)
| Source | File | Notes |
|---|---|---|
| On-chain (toncenter v2 `runGetMethod`, archival `seqno`) | onchain.ts | Six LSTs: APY over the last cycle (131072 s), `apy7d` over 5 cycles, TVL = GRAM held x price. Rows replace the Swap.coffee rows of the same LST, matched by contract address or by source and ticker in either generation (`preferOnchain`, run after Palette's overrides; logged cross-check). About 22 calls, 1 RPS without `TONCENTER_API_KEY`. See ONCHAIN_INTEGRATION.md. |
| Swap.coffee `backend.swap.coffee/v1/yield/pools` | swapcoffee.ts | Storm, Ston.fi, Tonco, and the fallback for LST rows the on-chain engine cannot read. Keyless, about 1 RPS. The code reads page 1 only (100 of ~2,000; the API has `size` ≤ 100, `page`, `order`, `providers[]`). Numbers can be strings, including `"NaN"` (coerced). A pool whose TVL is not a number is skipped with a warning; a NaN APR is kept so Palette can replace it, and `dropNonFiniteApy` removes rows still not finite after the overrides. DeDust APRs are always 0 (DeDust is filtered out here). Hipo TVL here (~$7.5M) is below the contract figure (~$9M). |
| DefiLlama `yields.llama.fi/pools` | defillama.ts, ethena.ts | EVAA, Affluent, Ethena APY. Projects in `SWAP_COFFEE_PROTOCOLS` are excluded unconditionally, so a Swap.coffee outage removes every DEX row (LST rows come from the contracts). Has hipo, kton, storm-trade, dedust, tonco, evaa; no tonstakers, stakee or bemo. A DefiLlama error aborts the whole post. The 10 MB file is downloaded 2 times per run. |
| DefiLlama `api.llama.fi/protocol/ethena-tsusde` | ethena.ts | tsUSDe TVL on TON (`currentChainTvls.TON`). |
| DefiLlama coins `coingecko:the-open-network`, CoinGecko fallback | prices.ts | GRAM price for GRAM-denominated TVL. |
| Palette `palette.finance/api/public/apr/all` | palette.ts | Override layer only, never adds rows. Keys follow GRAM tickers (`hGRAM`, `bmGRAM`). `tvl:*` keys in `aprBySource` override TVL for Hipo (`tvl:hGRAM`) and the Storm vaults (Swap.coffee counts Hipo at hGRAM supply x GRAM price and only the free balance of Storm vaults); the Storm GRAM vault APR also comes from Palette. For LSTs read on-chain Palette is only a logged cross-check (its tsTON value is about 1.3 pp above the on-chain rate); its overrides apply to fallback rows. |
| DeDust `mainnet.api.dedust.io/v4/api/get_pools` (POST, sorted by TVL) | dedust.ts | GRAM-USDT pools, plus impermanent-loss-free pairs (for example hGRAM-GRAM) once they reach $10K TVL. The native coin is still `TON` in the API. Labels follow the app: type plus trade fee ("Classic 0.10%", "CPMM v2 0.10%"). `apr_fees` = LP share of the last 24h fees, annualised: Classic and Stable compound (APY = daily-compounded APR, about 1 point above the app's APR), CPMM v2 does not (APY = APR; DefiLlama compounds it anyway and shows it higher). Excluded from the DefiLlama path via `SWAP_COFFEE_PROTOCOLS` and from Swap.coffee, which reports APR 0 for every DeDust pool. |
| GTC `api.giftcredit.app/api/v1/analytics/pools/yield` | gtc.ts | `tvl` is in asset units: USDT taken 1:1, GRAM converted with prices.ts; unknown currencies skipped. |
| Header TVL `api.llama.fi/protocols` | tvl.ts | Custom sum that includes bridges (about 8% above `/v2/chains`). |
| Removed 2026-11-20 | (git history, commit `a1d8d10`) | Merkl + Feather Zone, Morpho via Goldsky, Euler, YieldFi (no live data since August 2026), Midas vault (closed to new deposits since 2026-08-14). |

## Gotchas
- Ticker drift drops rows silently. After TON→GRAM, Swap.coffee returns Hipo as `GRAM/hGRAM`; that hid Hipo from 2026-11-08 until v1.4.0. `NATIVE_TON_ASSETS` keeps both generations; add any new LST ticker there (the TON list in `CORRELATED_PAIRS` is reference only). `protocols_test.ts` guards it.
- Never use substring matching for TON assets (STON, GEMSTON, TONNEL, JETTON, sTONks are not TON).
- `config.minTvlUsd` ($10K) is applied on the DefiLlama and DeDust paths (as on DefiLlama's DeDust listing), so their pools under $10K are left out; Swap.coffee ($100) and GTC use lower floors, and their rows under $10K stay in sections with ⚠️ and out of the TOP-5.
- Telegram HTML: put third-party text through `safeText` in `message.ts` (displayText: one line, no control or direction characters, max 64 characters; then escapeHtml). Use `escapeHtml` alone only for href values; text must stay within 4096 characters after entity parsing; `<blockquote expandable>` cannot be nested.
- APY history keys are `source-asset-poolMeta`, so a ticker rename resets a row's 7d average, and Ston.fi GRAM-USDT rows carry a v1/v2 label so its two pools no longer share a key (DeDust rows are kept unique per pair and label by `keepLargestPerLabel`). The 7d average uses only snapshots dated within the last 7 days (at least 3), so a local KV file with old history shows no 7d values.
- `src/config.ts` loads `.env` with `examplePath: null`: std dotenv otherwise enforces `.env.example` as required keys and silently drops the whole `.env` (token included) when one is missing.
- Custom emoji in channel posts require a Fragment-purchased bot username.
- Bot API 10.1 Rich Messages (`sendRichMessage`: tables, `<details>`, buttons, up to 32,768 characters) work in channels; Bot API 10.4 widgets work only in private chats. grammY 1.21.1 predates both (`npm:grammy@1.46` supports up to 10.3).
- GitHub `schedule` runs start hours late, and public-repo schedules are disabled after 60 days without repo activity.

## On-chain LST rates (implemented in src/services/onchain.ts since v1.5.0)
Realized APY = (rate_now / rate_then)^(365 d / Δt) − 1, where rate = staked GRAM / LST supply from one get-method. Past values come from toncenter v2 `runGetMethod` with `seqno` (archival). The engine uses windows of whole 2-round cycles: the last cycle (131072 s) for the post's APY and 5 cycles (≈ 7.6 d) for its 7d value; `reconcile()` compares them because KTON and Bemo payouts drift up to ~13 min around the cycle.

| LST | Contract | Get-method | Rate |
|---|---|---|---|
| Hipo hGRAM | `EQCLyZHP4Xe8fpchQz76O-_RmUhaVc_9BAoGyJrwJrcbz2eZ` | `get_treasury_state` | [0] / [1]; append-only layout, [12]/[13]/[14] = contract APY rate pair and window |
| Tonstakers tsTON | `EQCkWxfyhAkim3g2DjKQQg8T5P4g-Q1-K_jErGcDJZ4i-vqR` | `get_pool_full_data` (30 values) | [2] / [13] |
| Stakee STAKED | `EQD2_4d91M4TVbEBVyBF8J1UwpMJc361LKVCz6bBlffMW05o` | `get_pool_full_data` (30 values) | [2] / [13] |
| KTON | `EQA9HwEZD_tONfVz6lJS0PVKR5viEiEGyj9AuQewGQVnXPg0` | `get_pool_full_data` (34 values) | [2] / [17] |
| Bemo v2 bmTON/bmGRAM | `EQCSxGZPHqa3TtnODgMan8CEM0jf6HpY-uon_NMeFgjKqkEY` | `get_full_data` | [1] / [0] |
| Bemo v1 stTON | `EQDNhy-nxYFgUqzfUzImBEP67JqsyMIcyk2S5_RwNNEYku0k` | `get_full_data` | [1] / [0] |

EVAA supply rates: `getAssetRates(sha256(symbol))` on the pool masters, APY = (1 + s/1e12 × 86400)^365 − 1. Detect layouts by stack length and fail closed on unknown ones.

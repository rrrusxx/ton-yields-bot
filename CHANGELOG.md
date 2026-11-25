# Changelog

All notable changes to TON Yields Bot will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Production is started at 08:00 UTC by a cron-job.org job, set up on 2026-11-25 (its test run got 204 from GitHub and the run stopped on the day's marker). The 08:30 retry job and the healthchecks.io watchdog are not set up for now (owner's choice). HOSTING.md gains a "Current setup" table and a corrected note on GitHub's API versions.
- HOSTING.md setup steps checked against the live sites on 2026-11-25: GitHub's permission picker (since 2025-08-26) and expiry choices, plus a pre-filled link for renewing the token; cron-job.org's three editor tabs, its off-by-default failure email (on the "Notifications" tab) and its auto-disable after more than 25 failures; healthchecks.io's dialogs, Telegram flow, alert rules and the deletion of accounts without a log-in for a year.

## [1.6.1] - 2026-11-25

### Changed
- GTC is no longer credited in the footer's sources line (owner's choice); its rows stay in the post. The line now reads "📊 ⛓️ on-chain · DefiLlama · Swap.coffee · Palette" and the time.

### Fixed
- DefiLlama requests (the yields file, the protocols list for the header TVL, the tsUSDe listing) now wait up to 90 s instead of 15-20 s (`config.defiLlamaTimeoutMs`). On 2026-11-24 DefiLlama's cold cache took 56 s for the yields file, so a test post failed outright, and the protocols list took 14 s against 15 s, so the next one went out without the header TVL. The GRAM price request keeps its 10 s limit (it has a CoinGecko fallback).

## [1.6.0] - 2026-11-23

### Added
- **On-time start.** An outside scheduler (cron-job.org) starts `daily-post.yml` at 08:00 UTC through GitHub's `workflow_dispatch` API, with a retry at 08:30. GitHub's own schedule started runs hours late (median 7 h 51 min after 08:00 in November 2026; no run at all on 2026-05-23 and 05-26). See [HOSTING.md](HOSTING.md).
- **Once a day.** The bot records the day's post per channel and UTC date in its KV store; a later run that day (the retry, the fallback, a manual run) stops before building a post. `--force`, or the workflow's `force` input, reposts. Each run attempt saves the store under its own cache key, so a re-run restores the newest store instead of its own old one. A second post remains possible if GitHub's cache fails, and on the day of the switch (the old version wrote no marker).
- **Watchdog.** With the `HC_PING_URL` secret, each run tells healthchecks.io "start", then "success" only after Telegram accepted the post (or when the day's post was already out), or "fail" with the reason (the bot token masked). healthchecks.io alerts in Telegram on a failure or when no success arrives by 08:45 UTC.
- **Test runs on GitHub.** The workflow's `target` input sends a run to the test channel (`TEST_TELEGRAM_BOT_TOKEN` / `TEST_TELEGRAM_CHANNEL_ID` only); test runs never touch the production history or the watchdog.
- `daily-post-fallback.yml`: GitHub's late schedule, kept only to start the post workflow if the outside scheduler failed. A fallback run that GitHub starts after midnight UTC belongs to the previous day and does nothing.

### Changed
- `daily-post.yml` has no schedule of its own: GitHub disables the scheduled workflows of a public repository after 60 days without activity, and a disabled workflow also refuses `workflow_dispatch`. A concurrency group lets one run per channel go at a time.
- A run that finds no yields at all now fails (and alerts) instead of exiting quietly.
- One shared opener for the KV store (`src/services/kv.ts`, path overridable with `YIELDS_KV_PATH`); the leftover Deno Deploy branch is gone.

## [1.5.0] - 2026-11-23

### Added
- **Own on-chain engine for the six liquid staking tokens** (Tonstakers, Stakee, Hipo, KTON, Bemo v1 and v2), see [ONCHAIN_INTEGRATION.md](ONCHAIN_INTEGRATION.md). The APY is the realized growth of each contract's exchange rate (GRAM held / tokens issued), net of every protocol fee: over the last cycle of 2 validation rounds (about 1.5 days) for the post's APY, over the last 5 cycles (about 7.6 days) for its "7d" value. Past states come from archival nodes, so the 7d value is available from day one and never mixes in figures from other sources. TVL = GRAM held x GRAM price.
- **Storm Trade vaults (GRAM and USDT) read from their contracts.** The APY is the growth of each vault's LP rate (free balance per SLP token, from `get_vault_data`) over the last 7 days, as DefiLlama computes it; it includes fees and traders' profit and loss and can be negative. TVL is the free balance, the LPs' pool. Swap.coffee left both vaults out of the posts of 2026-11-17, 18, 20, 21 and 22; the on-chain rows now stand in, and Palette's Storm figure is only a logged cross-check on days Swap.coffee sends the vault. The vault rows take part in the TOP-5 like any row (owner's decision of 2026-11-23), so a week of heavy liquidations can put the GRAM vault at the top: its 7-day APY was 42-64% at the end of October 2026, against a median of 5% over a year.
- "⛓️ on-chain" in the footer's sources line whenever the post contains rows read from contracts.
- Optional `TONCENTER_API_KEY` secret in the workflow and `.env.example` (10 requests per second instead of 1). The key is trimmed. A key that toncenter refuses (HTTP 401 or 403: a typo, a revoked key or a testnet key), or one that is not a plain key (a line break, a space or a non-Latin character left by a paste), is dropped after one warning that never shows it, and the engine goes on at the keyless rate instead of losing the on-chain rows.
- Safety for the engine: a 2-minute limit after which the LSTs or Storm vaults still being read fall back to Swap.coffee (a part already read is kept) and the abandoned run stops; archival "cannot load state" answers step to a later block at once, and block lookups retry a few seconds later; the two windows are compared (the 5-cycle value replaces a one-cycle value that counted a payout too many or too few, a doubtful 5-cycle value is not shown as 7d, and an LST without a 5-cycle reading falls back); stricter layout checks for Hipo and Bemo; LST rows are matched to the fallback rows by contract address or by ticker in either generation, after Palette's overrides, so a row without a GRAM price inherits the Palette-corrected TVL; on-chain rows do not write into the shared 7-day history.
- Known limit: a miscounted payout at the very end of both windows ("now") is not caught (about 0.1% of runs per KTON or Bemo token, value off by about 20%). Aligning the windows to the validation round is planned.

### Fixed
- **Storm Trade vault TVL is the LPs' pool.** v1.4.0 took the TVL from Palette, which adds the locked balance; Storm's specs define it as traders' collateral, and the SLP price leaves it out. The post now shows the free balance, as Storm's app and Swap.coffee do: about $774K instead of $931K for the GRAM vault and $2.14M instead of $2.35M for the USDT vault on 2026-11-23.
- **Only GRAM-related tokens in the GRAM section.** A single token goes there only if it is GRAM or one of its liquid staking tokens, by the exact-ticker list already used for pairs, which now also holds KTON and STAKED. Any symbol the code did not recognise ended up in the GRAM section, so one-token lending markets for unrelated jettons from Swap.coffee's "coffin" provider (HYDRA, KINGY, GRM and durev; GRM is the jetton "Grm", not GRAM) appeared there in the posts of 2026-06-01, 06-12, 06-13 and 11-11. Such rows are now left out with a line in the log, on the DefiLlama and Swap.coffee paths. With KTON and STAKED on the list, GRAM-KTON and GRAM-STAKED pairs count as impermanent-loss-free like the other LST pairs; none has enough TVL or APY to show today.
- `.env` is loaded even when it lacks keys listed in `.env.example`. std dotenv treated the example as a list of required keys, so one optional key missing from `.env` silently dropped the whole file, including the bot token; `.env.defaults` is no longer read either.

### Changed
- The on-chain value is used for every LST (owner's decision of 2026-11-20). For Tonstakers it is about 1.3 pp below the 13.3% that Palette and Swap.coffee show; for the others it is within about 0.4 pp of Palette on 2026-11-20.
- Palette no longer overrides LST rows read on-chain; it is logged as a cross-check (warning above 1 pp). Swap.coffee's LST rows, with Palette's overrides, stay as the fallback for any LST the engine cannot read.
- Storm Trade rows show the realized 7-day APY instead of Storm's own one-year figure through Palette: 4.81% instead of 8.77% for the GRAM vault and 1.18% instead of 4.03% for the USDT vault on 2026-11-23 (DefiLlama shows 4.81% and 1.17%). They have no "7d" value.

## [1.4.0] - 2026-11-20

Hotfix after the November 2026 audit. Changes between 1.3.0 and 1.4.0 (Swap.coffee, Palette, GTC, the Midas vault, the GitHub Actions schedule and others) were not recorded here; see the git history.

### Fixed
- **Hipo is back in the post.** Swap.coffee renamed the token from hTON to hGRAM, and the exact-ticker allowlist (`NATIVE_TON_ASSETS`) only knew HTON, so the row was silently dropped from 2026-11-08. The allowlist now holds both ticker generations: TSGRAM, STGRAM, HGRAM, BMGRAM and WGRAM next to the old names.
- **TOP-5 no longer shows dust or stale pools.** A row needs a known TVL of at least $10K, an APY above 0 and at most 100%, and a protocol that is not marked as hacked. Each protocol gets one place per asset class, so Bemo v1 (stTON) and v2 (bmTON) at the same rate take a single place. Rows that fail these rules stay in their own section.
- **Ethena tsUSDe shows its TVL on TON** (about $1.9M, DefiLlama "Ethena tsUSDe") instead of the global sUSDe TVL on Ethereum (about $1.2B).
- **GTC GRAM vault TVL is in USD.** The GTC API reports it in GRAM; it is now converted with the GRAM price (DefiLlama coins API, CoinGecko as fallback). Without a price the row keeps its APY and shows no TVL.
- **HTML escaping.** Every third-party string in the post (pool, vault and protocol names, links) is escaped, so a "<" or "&" in a name can no longer make Telegram reject the post or inject a link.
- **Hipo and Storm Trade vault TVLs come from Palette.** Swap.coffee values Hipo at hGRAM supply times the GRAM price (about 17% too low, since one hGRAM is worth about 1.2 GRAM) and counts only the free balance of each Storm Trade vault, leaving out the funds locked against open trades (9-20% too low). The Storm Trade GRAM vault APR now also comes from Palette (Storm's own current rate), as the USDT vault's already did. If Palette is down, the Swap.coffee value stays.
- **7-day averages use only the last 7 days.** Before, the "7d" value averaged the last 7 saved snapshots, however old (after a pause, or with an old local KV file, it mixed in rates from weeks or months ago).
- Swap.coffee numbers that arrive as strings, including "NaN", are converted. A pool without a real TVL is skipped with a warning. A non-numeric APR is kept so a Palette override can still replace it; rows whose APY is still not a number after the overrides are dropped with a warning, instead of crashing the formatter.
- GTC vaults are classified by their currency id or their symbol, so a rename ("ton" to "gram") or an upper-case id no longer drops a vault, and the vault list is read before the GRAM price lookup finishes, so a slow price service cannot drop both GTC rows.
- Third-party names are kept on one line (line breaks and control characters become spaces) and shortened to 64 characters, so a name cannot fake extra rows or push the post past Telegram's 4,096-character limit.
- `link_preview_options` replaces the deprecated `disable_web_page_preview`, so `deno check` passes again.
- The date in the post header is computed in UTC.

### Changed
- **Affluent is marked "🚨 Hacked"** (unbacked mint of about $1.05M between 2026-09-30 and 2026-10-16). Its rows stay visible with their APY, but without the frozen TVL, at the end of their section and never in the TOP-5. The footer legend explains the mark.
- The Palette override for the Affluent USDT vault was dropped.
- The footer lists DefiLlama, Swap.coffee, Palette and GTC. TAC sources (Merkl, Goldsky) are gone from it; DeDust, read from its own API, is not credited separately (owner's choice).
- **Ston.fi GRAM-USDT pools are labelled v1 and v2** and read "GRAM-USDT" like the other pools of the section. Both used to read "USDT-GRAM (USDT)", shared one 7-day history and showed the same 7d value; their 7d averages start again from this release. Other Ston.fi rows (GRAM-tsTON) keep their label and history.

### Removed
- TAC sources: Merkl (with Feather Zone), Morpho via the Goldsky subgraph, Euler and YieldFi. They no longer returned live data (Morpho returned stale rates). Their integration docs are kept with a removal note.
- The Midas USDT vault shown as "Telegram Wallet" (now Walt): closed to new deposits since 2026-08-14.
- The top-level `Deno.cron` left over from Deno Deploy, which caused duplicate posts, and the `--unstable-cron` task flags. Scheduling lives in `.github/workflows/daily-post.yml`.
- The unused `ethers` dependency and the unused `dailyPostHour` setting.

### Added
- **DeDust GRAM-USDT pools** in the GRAM-USDT section, from DeDust's own API (the source DefiLlama's DeDust adaptor reads). Swap.coffee reports an APR of 0 for every DeDust pool and DefiLlama's DeDust rows were excluded, so DeDust never appeared before. Rows are labelled like DeDust's app ("Classic 0.10%", "CPMM v2 0.10%"). Classic and Stable pools add fees to the pool, so their APY is the fee APR compounded daily (about 1 point above the APR in DeDust's app, equal to DefiLlama); CPMM v2 pools pay fees separately, so their APY equals the app's APR (DefiLlama compounds them too and shows them higher). As on DefiLlama's DeDust listing, only verified pools with at least $10K TVL are shown, and only GRAM-USDT or impermanent-loss-free pairs.
- Unit tests for the ticker allowlist, the TOP-5 rules, HTML escaping, Palette overrides, GTC vaults, Swap.coffee parsing, DeDust pools and 7-day averages (`deno task test`).

## [1.3.0] - 2026-01-13

### Added
- **YieldFi Protocol Integration**
  - yUSD vault (9.03% APY)
  - vyUSD vault (10.13% APY)
  - Fallback APY data until TAC contract addresses available
  - See [YIELDFI_INTEGRATION.md](YIELDFI_INTEGRATION.md) for details
  
### Notes
- YieldFi yields currently use static APY values from their frontend
- TVL data pending (will show $0 until smart contract integration)
- Future update will add direct ERC-4626 vault queries once contracts are deployed on TAC

## [1.0.0] - 2026-01-09

### Added
- **Core Features**
  - Telegram bot with grammY framework
  - Daily automated posts at 9:00 UTC using Deno.cron
  - DefiLlama API integration for TON native protocols
  - Merkl API integration for TAC dApps (Chain ID 239)
  
- **Data Processing**
  - Asset classification (TON, Stablecoins, BTC)
  - Correlated pairs filtering (prevents IL risk)
  - Duplicate asset labeling for multiple pools
  - APR to APY conversion for Merkl rewards
  
- **Message Formatting**
  - Group yields by asset type
  - Group by protocol within categories
  - Top 5 yield opportunities section
  - HTML formatting with clickable protocol links
  - APY breakdown (base + rewards)
  - Human-readable TVL display ($1.5M format)
  
- **Protocol Support**
  - TON Native: Storm Trade, EVAA, Affluent, Hipo, Ston.fi, DeDust, Tonstakers, Daolama, FIVA, Swap.coffee
  - TAC dApps: Curve, Morpho, Euler, Carbon, Snap
  
- **Bot Commands**
  - `/start` - Welcome message
  - `/help` - Help information
  - `/yields` - Get current yields snapshot
  
- **Developer Tools**
  - Test mode (console output without Telegram)
  - Manual post trigger (`--post-now`)
  - Environment configuration with `.env`
  - Comprehensive logging

### Security
- Exclude memecoins (NOT, DOGS, HMSTR, CATI, etc.)
- Filter minimum TVL ($10k threshold)
- Validate APY ranges (0% - 10,000%)
- Gitignore for sensitive data (.env)

### Documentation
- README with setup instructions
- MERKL_INTEGRATION.md for TAC integration
- .env.example template
- ROADMAP.md for project tracking
- TODO.md for quick tasks
- This CHANGELOG.md

## [1.2.0] - 2026-01-12

### Added
- **Euler Integration**
  - Direct smart contract integration using ethers.js
  - Fetches vault data from Euler contracts on TAC chain via RPC
  - Reads supply APY directly from `interestRateInfo.supplyAPY` (25 decimals precision)
  - Batch processing of verified vaults (5 vaults per batch)
  - Support for Euler Perspective and VaultLens contracts
  - Real-time on-chain data (no indexer delays)

- **Technical Improvements**
  - Added ethers.js v6 to dependencies (npm:ethers@^6.13.0)
  - TAC RPC endpoint integration (https://rpc.ankr.com/tac)
  - Enhanced vault data transformation with fallback structure handling
  - BigInt to APY conversion utilities

### Changed
- Updated data sources to include four sources: DefiLlama, Merkl, Morpho Goldsky, and Euler Contracts
- Improved error handling for contract calls
- Enhanced batch processing with retry logic

### Documentation
- Created EULER_INTEGRATION.md with technical details
- Updated TODO.md to mark Euler as completed
- Updated ROADMAP.md with Euler integration status

## [1.1.0] - 2026-01-10

### Added
- **Morpho Integration**
  - Morpho Goldsky subgraph integration for TAC chain lending markets
  - GraphQL query support for Morpho Blue markets
  - Supply APY (LENDER rates) extraction
  - Test token filtering (BMW, LADA, etc.)
  - Minimum token balance threshold for active markets

- **Technical Improvements**
  - `--allow-import` flag added to all deno tasks
  - Cleaned up test scripts after Morpho research
  - Enhanced market filtering (min 10 tokens, min 0.1% APY)

### Changed
- Updated data sources to include three APIs: DefiLlama, Merkl, and Morpho Goldsky
- Improved protocol URL mappings for TAC dApps
- Enhanced asset classification for TAC-bridged assets

### Fixed
- Corrected corrupted deno.json task definition for `test-msg`
- Added missing `--unstable-cron` flag to `post` task

## [Unreleased]

See "Status and Plan" in [ROADMAP.md](ROADMAP.md).

---

## Version Guidelines

- **Major (X.0.0)**: Breaking changes, major redesign
- **Minor (1.X.0)**: New features, protocol additions
- **Patch (1.0.X)**: Bug fixes, small improvements

---

**Legend:**
- `Added` - New features
- `Changed` - Changes to existing functionality
- `Deprecated` - Features being removed in future
- `Removed` - Features removed
- `Fixed` - Bug fixes
- `Security` - Security improvements

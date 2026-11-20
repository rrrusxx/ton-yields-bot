# TODO - Quick Task List

> For detailed roadmap, see [ROADMAP.md](ROADMAP.md)

## 🔥 Next

- [ ] **Own on-chain engine** (next): realized APY of all six LSTs (Tonstakers, Stakee, Hipo, KTON, Bemo v1 and v2) from each contract's exchange rate over whole validation cycles, net of protocol fees, with "⛓ on-chain" in the footer once live. Decided 2026-11-20: the on-chain rate is used for all six, including Tonstakers and Bemo, where it is about 1.2 pp below Palette. Then EVAA, Storm and tsUSDe; Palette becomes a cross-check.
- [ ] **Run the daily job on time and with alerts.** GitHub starts the 08:00 UTC schedule 6-10 hours late, and public repos lose their schedule after 60 days without commits. Proposed: Supabase Cron + Edge Function + Postgres for history, plus a healthchecks.io watchdog that alerts in Telegram. GitHub Actions stays for code and manual runs.
- [ ] **Reliability:** retries, one DefiLlama download per run, fallback rows when Swap.coffee fails, a source health summary, a guard against duplicate posts.
- [ ] Final check against Telegram's 4,096-character limit before sending, with a shorter fallback post.
- [ ] Delete the old Deno Deploy project (hosting moved to GitHub Actions).
- [ ] Ston.fi and Tonco pools from their own APIs or DefiLlama instead of Swap.coffee.
- [ ] Tonco GRAM-USDT APR is an outlier (often above 100%; DefiLlama flags it): decide whether to mark it or use a longer average.

## ✅ Recently Completed

- [x] **P0 hotfix after the November 2026 audit** (v1.4.0, Nov 20, 2026)
  - [x] Hipo back in the post; allowlist knows GRAM-era tickers (hGRAM, tsGRAM, stGRAM, bmGRAM, wGRAM)
  - [x] TOP-5 rules: TVL from $10K, APY up to 100%, no hacked protocols, one place per protocol and asset class
  - [x] Removed TAC sources (Merkl, Feather Zone, Morpho via Goldsky, Euler, YieldFi) and the Midas vault
  - [x] Affluent marked "🚨 Hacked", shown without TVL, never in the TOP-5
  - [x] Ethena TVL on TON instead of the global sUSDe TVL; GTC GRAM TVL in USD
  - [x] Hipo and Storm Trade vault TVL from Palette (Swap.coffee reports them too low)
  - [x] 7-day averages only from snapshots of the last 7 days
  - [x] HTML escaping; third-party names on one line, max 64 characters; `link_preview_options`; leftover `Deno.cron` removed
  - [x] Sturdier handling of "NaN" values from Swap.coffee and of GTC currency renames
  - [x] DeDust GRAM-USDT pools (Classic and CPMM v2) from DeDust's own API
  - [x] Ston.fi GRAM-USDT pools labelled v1/v2, each with its own 7-day history; the GRAM-USDT section reads GRAM-USDT everywhere
  - [x] Unit tests (`deno task test`)
- [x] **7-Day Average APY Tracking** (Jan 23, 2026) 🎉
  - [x] Created APY history service with Deno KV storage
  - [x] Tracks daily APY snapshots for all pools
  - [x] Displays rolling 7-day averages after 3+ days of history
  - [x] Format: "4.5% (7d: 4.8%)" for regular pools
  - [x] Format: "0.0% (+22.9%), 7d: 23.0%" for reward-based pools
  - [x] Backfilled 4 days of historical data (Jan 20-23)
  - [x] Persistent storage works in production (Deno Deploy at the time; now GitHub Actions with actions/cache)
- [x] **TON Total TVL Metric Added** (Jan 17, 2026) 🎉
  - [x] Created new TVL service (`src/services/tvl.ts`)
  - [x] Fetches DeFi TVL from DefiLlama protocols API
  - [x] Excludes CEXs and LST (matches website's $92.94M value)
  - [x] Displays as "💎 TON DeFi TVL: $94.3M" right after date
  - [x] Gracefully handles API errors (shows nothing if unavailable)
- [x] **Morpho TVL Calculation Verified** ✅ (Jan 17, 2026; Morpho removed in v1.4.0)
  - [x] Confirmed with Morpho team: integration is correct
  - [x] Using `lastTotalAssets` field from MetaMorpho vaults
  - [x] APYs accurate (3.4%, 0.4%) - matches Mini App
  - [x] TVL implementation confirmed as correct approach
- [x] **Swap Coffee API Integration** (commit 310e817) - MAJOR UPDATE! 🎉
  - [x] Integrated 100+ pools from 17+ TON-native protocols
  - [x] Storm Trade: TON (7.1%, $6.7M), USDT (10.1%, $5.9M)
  - [x] KTON.io: TON (KTON): 4.1% | $2.2M (matches ~3.7% website APY)
  - [x] Stakee: TON (STAKED): 3.3% | $15.9M
  - [x] Tonstakers, Bemo, Hipo now showing from Swap Coffee
  - [x] Ston.fi, DeDust, Daolama, Colossus all integrated
  - [x] Fixed LST token format detection (TON-SLP, TON-KTON, TON-STAKED)
  - [x] Memecoin filtering (NOT/Notcoin correctly excluded)
  - [x] Maintained strict correlation filter (no IL risk)
- [x] **EVAA USDE Visibility Fixed** (commit 310e817)
  - [x] Increased pool display limit from 5 to 10 per protocol
  - [x] Now showing USDE: 1.5% ($26K) and 3.6% ($12K)
  - [x] EVAA exclusively from DefiLlama (16 pools, complete coverage)
- [x] **Footer/Data Sources Updated** (commit 310e817)
  - [x] Removed "YieldFi" (sourced from DefiLlama)
  - [x] Added Swap.coffee with hyperlink
  - [x] Re-added Daolama hyperlink
- [x] Morpho Goldsky integration (direct markets only) (removed in v1.4.0)
- [x] Euler contract integration via ethers.js (removed in v1.4.0)
- [x] YieldFi integration (yUSD, vyUSD) with TVL aggregation across chains (removed in v1.4.0)
- [x] Set up test/production environment separation
- [x] Curve integration confirmed (uses Merkl API) (removed in v1.4.0)
- [x] Carbon DeFi DEX verified (already covered by Merkl) (removed in v1.4.0)
- [x] ETH asset filtering (wrsETH, pufETH, wstETH)

## 📅 Later

- [ ] **NEW Badge Feature** 🆕
  - [ ] Add emoji indicator for new yield opportunities
  - [ ] Requires historical data tracking/comparison
  - [ ] Show which pools are newly added since last post
- [ ] TON wallet yields:
  - [ ] Walt (formerly Telegram Wallet): no public Earn-rates API yet
  - [ ] TON Whales and Tonkeeper Queue (native staking)
  - [ ] MyTonWallet (MTW)
- [ ] **Tradoor Protocol Integration** (needs research: data sources, yield types)

## 💭 Ideas to Explore

- [ ] **Points Tracking Feature** ⭐
  - [ ] Add emoji indicator for protocols that generate points (airdrops)
  - [ ] Challenge: Most protocols don't expose points data via API
  - [ ] Options:
    - Manual configuration (hardcode known points programs)
    - Scraping (not ideal, fragile)
    - Wait for protocols to add points APIs
  - [ ] Priority: Low (technically difficult, data availability issue)
- [ ] Web dashboard with Fresh
- [ ] User alerts system (APY changes, new opportunities)
- [ ] Wallet integration (track user positions)

## 📝 Quick Notes

**Production:** GitHub Actions (`.github/workflows/daily-post.yml`), cron `0 8 * * *` (08:00 UTC; GitHub usually starts it hours late)
- Channel: @ton_yields_daily
- A push to `main` becomes the next production post
- History (7d averages, 24h TVL change) lives in Deno KV `./data/kv.db`, carried between runs by `actions/cache`

**Development Setup:**
- The test bot posts to @ton_yields_test (local `.env`)
- Release flow: change, dry run, post to @ton_yields_test, owner check, then commit and push

---

**Quick Commands:**

```bash
# Unit tests (no network, nothing sent)
deno task test

# Post the full digest to the channel in .env
deno task post

# Send a short test message to the channel in .env
deno task test-msg
```

# TODO - Quick Task List

> For detailed roadmap, see [ROADMAP.md](ROADMAP.md)

## ✅ Recently Completed

- [x] **7-Day Average APY Tracking** (Jan 23, 2026) 🎉
  - [x] Created APY history service with Deno KV storage
  - [x] Tracks daily APY snapshots for all pools
  - [x] Displays rolling 7-day averages after 3+ days of history
  - [x] Format: "4.5% (7d: 4.8%)" for regular pools
  - [x] Format: "0.0% (+22.9%), 7d: 23.0%" for reward-based pools
  - [x] Backfilled 4 days of historical data (Jan 20-23)
  - [x] Persistent storage works in production (Deno Deploy)
- [x] **TON Total TVL Metric Added** (Jan 17, 2026) 🎉
  - [x] Created new TVL service (`src/services/tvl.ts`)
  - [x] Fetches DeFi TVL from DefiLlama protocols API
  - [x] Excludes CEXs and LST (matches website's $92.94M value)
  - [x] Displays as "💎 TON DeFi TVL: $94.3M" right after date
  - [x] Gracefully handles API errors (shows nothing if unavailable)
- [x] **Morpho TVL Calculation Verified** ✅ (Jan 17, 2026)
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
- [x] Morpho Goldsky integration (direct markets only)
- [x] Euler contract integration via ethers.js
- [x] YieldFi integration (yUSD, vyUSD) with TVL aggregation across chains
- [x] Set up test/production environment separation
- [x] Curve integration confirmed (uses Merkl API)
- [x] Carbon DeFi DEX verified (already covered by Merkl)
- [x] ETH asset filtering (wrsETH, pufETH, wstETH)

## 🔥 Immediate (This Week)

- [ ] **NEW Badge Feature** 🆕
  - [ ] Add emoji indicator for new yield opportunities
  - [ ] Requires historical data tracking/comparison
  - [ ] Show which pools are newly added since last post
  - Priority: MEDIUM (you mentioned wanting to work on this)
- [ ] Start fetching TON wallet yields:
  - [ ] Telegram Wallet (@wallet) - custodial and self-custodial
  - [ ] MyTonWallet (MTW)
  - [ ] Tonkeeper
  - Priority: MEDIUM (this week if time permits)

## 🎯 Next Sprint (Current)

- [ ] **Tradoor Protocol Integration**
  - [ ] Research: What is Tradoor? (DeFi protocol on TON)
  - [ ] Identify data sources (DefiLlama, API, contracts)
  - [ ] Determine yield types and integration approach
  - [ ] Priority: Medium (needs research first)
- [ ] Research additional yield sources

## 📅 Next Week

- [ ] Add ETH and TAC asset clusters
- [ ] Expand asset classification beyond TON/STABLE/BTC

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

**Latest Deployment:** Jan 23, 2026 (commit ab6f90d) 🚀
- Production: Deno Deploy (auto-deploy from GitHub main branch)
- Cron: Daily at 9:00 UTC
- Channel: @ton_yields_daily (40 subscribers! 🎉)
- Status: ✅ Running
- **Latest Updates:**
  - ✅ ETH AND RELATED ASSETS section (WETH, LSTs, Re7 WETH vault)
  - ✅ Shortened Merkl pool names (removed "Supply to" / "on TAC" / "(Merkl)")
  - ✅ EVAA stablecoins capped at top 3 by TVL
  - ✅ uniBTC added to BTC assets
  - ✅ 7-Day Average APY tracking (format: "4.5% (7d: 4.8%)")
  - ✅ TON Total DeFi TVL metric with 24h change tracking
  - ✅ Swap Coffee API integrated (100+ pools, 17+ protocols)
  - ✅ All data sources integrated and working

**Development Setup:**
- Test bot posts to @ton_yields_test (private test channel)
- Use `deno task post` for local testing
- Production and test environments fully separated

---

**Quick Commands:**

```bash
# Test bot locally
deno task dev

# Post to channel now
deno task post

# Send test message
deno task test-msg
```

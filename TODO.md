# TODO - Quick Task List

> For detailed roadmap, see [ROADMAP.md](ROADMAP.md)

## ✅ Recently Completed

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

- [ ] **Fix Morpho TVL Calculation** 🔴 (Priority: HIGH)
  - [ ] Get clarification from Morpho team on correct field for Total Deposits
  - [ ] Current issue: `lastTotalAssets` inconsistent for some vaults
  - [ ] Verify TVL matches Mini App values
  - Note: APYs are accurate (3.4%, 0.4%), only TVL needs refinement
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
- [ ] Create database with historical yields
- [ ] Add 7-day average APYs
- [ ] Show APY delta vs yesterday
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

## ⏸️ On Hold

- [ ] Moon DEX (TON-USDT pool filtered - uncorrelated pair has IL risk)
- [ ] BidAsk DEX (USDT-TON pool filtered - uncorrelated pair has IL risk)
- [ ] Torch Finance (0% APR - correctly filtered, no yields currently)

## 📝 Quick Notes

**Latest Deployment:** Jan 15, 2026 (commit 310e817) 🚀
- Production: Deno Deploy (auto-deploy from GitHub main branch)
- Cron: Daily at 9:00 UTC
- Channel: @ton_yields_daily (40 subscribers! 🎉)
- Status: ✅ Running
- **Latest Updates:**
  - ✅ Swap Coffee API integrated (100+ pools, 17+ protocols)
  - ✅ Storm Trade, KTON, Stakee now showing
  - ✅ EVAA USDE visibility fixed (1.5%, 3.6%)
  - ✅ Footer updated with all data sources
  - ⚠️  Morpho TVL still needs refinement (APYs accurate)

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

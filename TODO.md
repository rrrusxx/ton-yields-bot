# TODO - Quick Task List

> For detailed roadmap, see [ROADMAP.md](ROADMAP.md)

## ✅ Recently Completed

- [x] Morpho Goldsky integration (direct markets only)
- [x] Euler contract integration via ethers.js
- [x] Test Euler integration (3 yields: TON, USDT, cbBTC)
- [x] Push Euler integration to GitHub (commit 98fe4ae)
- [x] Deploy Euler update to Deno Deploy (production running)
- [x] YieldFi integration (yUSD, vyUSD) with fallback APY data
- [x] Set up test/production environment separation:
  - [x] Test bot + test channel for development
  - [x] Production bot + production channel on Deno Deploy
  - [x] Environment variables configured
- [x] Curve integration confirmed (uses Merkl API)
- [x] Carbon DeFi DEX verified (already covered by Merkl, no additional yields)
- [x] Test token filtering (BMW, LADA, unknown)
- [x] ETH asset filtering (wrsETH, pufETH, wstETH)

## 🔥 Immediate (This Week)

- [x] Test YieldFi integration locally and deploy to production (commit a200541)
- [x] Verify YieldFi appears in 9:00 UTC post (✅ 40 subscribers!)
- [x] Fix Morpho APY calculation (commit c06b559) - APYs now accurate! ✅
- [ ] **Fix Morpho TVL Calculation** 🔴 (Priority: TOMORROW)
  - [ ] Get clarification from Morpho team on correct field for Total Deposits
  - [ ] Test with markets[].market.totalSupply approach
  - [ ] Verify TVL matches Mini App values (currently inconsistent)
  - Note: APYs are accurate, only TVL needs refinement
- [ ] **NEW Badge Feature** 🆕
  - [ ] Add emoji indicator for new yield opportunities
  - [ ] Requires historical data tracking/comparison
  - [ ] Show which pools are newly added since last post
- [ ] **Add KTON.io Protocol** (Priority: HIGH)
  - [ ] Liquid staking token (LST) on TON
  - [ ] Check DefiLlama for KTON yields
  - [ ] Similar integration to tsTON, hTON, stTON
- [ ] Start fetching TON wallet yields:
  - [ ] Telegram Wallet (@wallet) - custodial and self-custodial
  - [ ] MyTonWallet (MTW)
  - [ ] Tonkeeper

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

- [ ] Swap Coffee API integration (waiting for API key access)
- [ ] Tonstakers yields (no public API - needs team contact)
- [ ] Bemo yields (no public API - needs team contact)

## 📝 Quick Notes

**Latest Deployment:** Jan 14, 2026 (commit c06b559)
- Production: Deno Deploy (auto-deploy from GitHub main branch)
- Cron: Daily at 9:00 UTC
- Channel: @ton_yields_daily (40 subscribers! 🎉)
- Status: ✅ Running
- Latest: Fixed Morpho APYs (now accurate: 3.4%, 0.4%)
- Note: Morpho TVL needs refinement (working on it)

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

# Send test message
deno task test-msg
```

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
- [ ] Verify YieldFi appears in tomorrow's 9:00 UTC post
- [ ] Start fetching TON wallet yields:
  - [ ] Telegram Wallet (@wallet) - custodial and self-custodial
  - [ ] MyTonWallet (MTW)
  - [ ] Tonkeeper
- [ ] Continue Morpho alignment discussions with team

## 🎯 Next Sprint (Current)

- [ ] Create database with historical yields
- [ ] Add 7-day average APYs
- [ ] Show APY delta vs yesterday
- [ ] Research additional yield sources

## 📅 Next Week

- [ ] Add ETH and TAC asset clusters
- [ ] Expand asset classification beyond TON/STABLE/BTC

## 💭 Ideas to Explore

- [ ] Web dashboard with Fresh
- [ ] User alerts system (APY changes, new opportunities)
- [ ] Wallet integration (track user positions)

## ⏸️ On Hold

- [ ] Swap Coffee API integration (waiting for API key access)
- [ ] Tonstakers yields (no public API - needs team contact)
- [ ] Bemo yields (no public API - needs team contact)

## 📝 Quick Notes

**Latest Deployment:** Jan 13, 2026 (commit a200541)
- Production: Deno Deploy (auto-deploy from GitHub main branch)
- Cron: Daily at 9:00 UTC
- Channel: @ton_yields_daily
- Status: ✅ Running
- Latest: Added YieldFi (yUSD $31.7M, vyUSD $4.5M)

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
